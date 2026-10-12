import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { z } from 'zod'
import { expect, test } from 'vitest'
import { connect } from '../catalog/database.ts'
import { install, cleanup, users } from '../notification-fixtures.ts'
import { publicationSchema, publicationHash } from './contract.ts'
import type { Publication } from './contract.ts'
import { connectPublisher, publish, withdraw } from './publish.ts'

// SCRAM verifier, never the plaintext credential, reaches the administrative
// SQL statement. Credential exists only in this test's process/child env.
function verifier(password: string): string {
  const salt = randomBytes(16), salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const stored = createHash('sha256').update(clientKey).digest('base64')
  const server = createHmac('sha256', salted).update('Server Key').digest('base64')
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`
}
type Receipt = Awaited<ReturnType<typeof publish>>
type Withdrawal = Awaited<ReturnType<typeof withdraw>>
type Centre = { items: { announcement_id?: string; revision: string; action: { kind: string; announcement_id?: string } }[]; unread_count: string }

test.skipIf(process.env.MY_SUPABASE_LOCAL_TEST !== '1')('8G.3 actual publisher CLI → Local PostgREST + real concurrency', async () => {
  const admin = await connect(), connections: pg.Client[] = [], keys = new Set<string>()
  const namespace = `8g3.synthetic.${randomUUID()}`
  const filename = `.cache/8g3/${namespace}.json`
  let installed = false, provisioned = false
  const password = randomBytes(32).toString('base64url')
  const connection = `postgresql://my_notification_publisher:${password}@127.0.0.1:55322/postgres`
  const settings = z.object({ API_URL: z.literal('http://127.0.0.1:55321'), ANON_KEY: z.string(), JWT_SECRET: z.string(), SERVICE_ROLE_KEY: z.string() }).parse(JSON.parse(
    execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
  function payload(suffix: string, delta: Partial<Publication> = {}): Publication {
    const p = publicationSchema.parse({ ...JSON.parse(readFileSync('scripts/notifications/examples/announcement.json', 'utf8')) as Record<string, unknown>,
      publication_key: `${namespace}.${suffix}`, publication_context: { reason: 'Isolated synthetic 8G.3 test', include_new_users_justification: null }, ...delta })
    keys.add(p.publication_key); return p
  }
  function token(user: string): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, role: 'authenticated', aal: 'aal2', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`
    return `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
  }
  async function rpc<T>(name: string, parameters: Record<string, unknown> = {}, user = users[0]!): Promise<T> {
    const response = await fetch(`${settings.API_URL}/rest/v1/rpc/${name}`, { method: 'POST',
      headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters), signal: AbortSignal.timeout(10_000) })
    expect(response.status).toBe(200); return await response.json() as T
  }
  function cli(args: string[]): string {
    const result = spawnSync(process.execPath, ['scripts/notifications/publish.ts', ...args], { env: { ...process.env, MY_NOTIFICATION_DATABASE_URL: connection }, encoding: 'utf8', windowsHide: true })
    expect(result.stderr).not.toContain(password); expect(result.stdout).not.toContain(password)
    assert.equal(result.status, 0, result.stderr); return result.stdout
  }
  async function blocked(waiting: number, holding: number): Promise<void> {
    const deadline = Date.now() + 5000
    do {
      if ((await admin.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked', [waiting, holding])).rows[0]!.blocked) return
      await delay(20)
    } while (Date.now() < deadline)
    assert.fail('Real PostgreSQL lock wait was not observed')
  }
  const snapshot = async (id: string) => (await admin.query<{ data: Record<string, unknown> }>('select to_jsonb(a) data from private.notification_announcements a where id=$1', [id])).rows[0]!.data
  try {
    await admin.query('select pg_advisory_lock(830011)')
    await install(admin); installed = true
    await admin.query(`alter role my_notification_publisher password '${verifier(password)}'`); provisioned = true
    const bad = new pg.Client({ connectionString: connection.replace(password, 'invalid-password') })
    try { await expect(bad.connect()).rejects.toHaveProperty('code', '28P01') } finally { await bad.end() }
    for (let i = 0; i < 3; i++) connections.push(await connectPublisher(connection))
    const [first, second, third] = connections as [pg.Client, pg.Client, pg.Client]
    const pid = async (db: pg.Client) => (await db.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
    const firstPid = await pid(first), secondPid = await pid(second), thirdPid = await pid(third)
    for (const sql of ['select * from auth.users', 'select * from public.catalog_variants', 'select * from private.notification_announcements',
      "update private.notification_announcements set title='Forbidden'", 'delete from private.notification_announcements',
      "insert into private.notification_announcements(publication_key) values('forbidden')", 'select public.get_notification_center()',
      'select private.prepare_notification_publication(null)', 'set role authenticated']) {
      await expect(first.query(sql)).rejects.toHaveProperty('code', '42501')
    }
    console.log('PASS: real login/password verification; publisher cannot read Auth/catalogue/private storage, DML, user RPC, preparer or SET ROLE')

    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator']) {
      await admin.query(`set role ${role}`)
      try {
        await expect(admin.query('select private.publish_notification_announcement($1::jsonb)', [JSON.stringify(payload(`denied-${role}`))])).rejects.toHaveProperty('code', '42501')
        await expect(admin.query('select private.withdraw_notification_announcement($1)', [`${namespace}.missing`])).rejects.toHaveProperty('code', '42501')
      } finally { await admin.query('reset role') }
    }
    const raw = { ...payload('normalize'), title: ' \u00a0Cafe\u0301 😀\u3000', body: ' \r\nQuotes " et barre \\ et tab\tinterne\rFin  ',
      expires_at: '2030-01-01T01:02:03.123456+01:00', publication_context: { reason: '\u00a0 Cafe\u0301 \u3000', include_new_users_justification: null } }
    const normalized = publicationSchema.parse(raw)
    const prepared = (await admin.query<{ p: { publication: Publication; content_hash: string } }>('select private.prepare_notification_publication($1::jsonb) p', [JSON.stringify(raw)])).rows[0]!.p
    expect(prepared.publication).toEqual(normalized); expect(prepared.content_hash).toBe(publicationHash(normalized))
    console.log('PASS: actual SQL denial for anon/Auth/service_role/authenticator; SQL/Node independent normalization/hash agree including Unicode, escaped text and microseconds')

    const ordinary = payload('cli', { title: '  Cafe\u0301 😀 ', body: ' \r\nTexte brut\r\nFin  ' })
    mkdirSync('.cache/8g3', { recursive: true }); writeFileSync(filename, JSON.stringify(ordinary))
    const result = JSON.parse(cli(['--file', filename, '--apply', '--environment', 'local'])) as Receipt
    expect(result.content_hash).toBe(publicationHash(ordinary))
    expect(JSON.parse(cli(['--file', filename, '--apply', '--environment', 'local']))).toEqual(result)
    const stored = await snapshot(result.announcement_id)
    expect(stored).toMatchObject({ published_by: 'my_notification_publisher', title: 'Café 😀', body: 'Texte brut\nFin', publication_context: ordinary.publication_context })
    expect(JSON.stringify(stored)).not.toContain(password)
    const firstCentre = await rpc<Centre>('get_notification_center')
    expect(firstCentre.items.find(item => item.announcement_id === result.announcement_id)).toMatchObject({ revision: result.content_hash, action: { kind: 'notification_content', announcement_id: result.announcement_id } })
    expect(await rpc('get_notification_unread_count')).toEqual({ unread_count: firstCentre.unread_count })
    expect(await rpc('get_notification_content', { p_announcement_id: result.announcement_id })).toMatchObject({ body: ordinary.body })
    expect(await rpc('mark_notification_read', { p_notification_key: `announcement:${result.announcement_id}`, p_observed_revision: result.content_hash })).toEqual({ outcome: 'recorded' })
    expect(await rpc('process_announcement_notification', { p_announcement_id: result.announcement_id, p_observed_hash: result.content_hash })).toEqual({ outcome: 'recorded' })
    const states = (await admin.query('select * from private.notification_announcement_states where announcement_id=$1', [result.announcement_id])).rows
    expect(await rpc('process_announcement_notification', { p_announcement_id: result.announcement_id, p_observed_hash: result.content_hash })).toEqual({ outcome: 'recorded' })
    expect((await admin.query('select * from private.notification_announcement_states where announcement_id=$1', [result.announcement_id])).rows).toEqual(states)
    const withdrawn = JSON.parse(cli(['--withdraw', ordinary.publication_key, '--environment', 'local'])) as Withdrawal
    expect(JSON.parse(cli(['--withdraw', ordinary.publication_key, '--environment', 'local']))).toEqual(withdrawn)
    expect(await publish(first, ordinary)).toEqual(result)
    expect(await rpc('get_notification_content', { p_announcement_id: result.announcement_id })).toBeNull()
    const after = await snapshot(result.announcement_id)
    const { withdrawn_at: beforeWithdrawal, ...history } = stored, { withdrawn_at: afterWithdrawal, ...current } = after
    expect(beforeWithdrawal).toBeNull(); expect(afterWithdrawal).toBeTruthy(); expect(current).toEqual(history)
    expect((await admin.query('select * from private.notification_announcement_states where announcement_id=$1', [result.announcement_id])).rows).toEqual(states)
    console.log('PASS: real CLI apply/retry/withdraw/retry → five PostgREST RPCs; normalized hash, identity, server dates, acquired states and history preserved')

    const change = payload('changelog', { category: 'changelog', app_version: '0.8.16', action: null })
    const changelog = await publish(first, change)
    expect(await rpc('get_notification_content', { p_announcement_id: changelog.announcement_id })).toMatchObject({ kind: 'changelog', app_version: '0.8.16' })
    const ordinary2 = await publish(first, payload('audience'))
    expect(await rpc('get_notification_content', { p_announcement_id: ordinary2.announcement_id }, users[1])).toBeNull()
    const exception = await publish(first, payload('newusers', { include_new_users: true,
      publication_context: { reason: 'Isolated synthetic 8G.3 test', include_new_users_justification: 'Still important and current' } }))
    expect(await rpc('get_notification_content', { p_announcement_id: exception.announcement_id }, users[1])).toMatchObject({ announcement_id: exception.announcement_id })
    await withdraw(first, ordinary2.publication_key)
    expect((await rpc<Centre>('get_notification_center')).items.some(item => item.announcement_id === ordinary2.announcement_id)).toBe(false)
    expect(await rpc('mark_notification_read', { p_notification_key: `announcement:${ordinary2.announcement_id}`, p_observed_revision: ordinary2.content_hash })).toEqual({ outcome: 'obsolete' })
    console.log('PASS: ordinary/changelog, old/new Auth audience, justified exception, withdrawal removes an unread active item immediately')

    const expiring = payload('expiry', { expires_at: new Date(Date.now() + 1200).toISOString() })
    const expiry = await publish(first, expiring)
    expect(await rpc('get_notification_content', { p_announcement_id: expiry.announcement_id })).toMatchObject({ announcement_id: expiry.announcement_id })
    await delay(1400)
    expect(await rpc('get_notification_content', { p_announcement_id: expiry.announcement_id })).toBeNull()
    expect(await publish(first, expiring)).toEqual(expiry)
    console.log('PASS: actual expiration removes content; expired identical retry returns historical result')

    // Genuine first-publication contention: second query waits for first commit.
    const concurrent = payload('concurrent')
    await first.query('begin'); const published = await publish(first, concurrent)
    const pending = publish(second, concurrent)
    await blocked(secondPid, firstPid)
    // Different key can commit while first key remains locked.
    await publish(third, payload('independent'))
    await first.query('commit'); expect(await pending).toEqual(published)
    expect((await admin.query<{ n: number }>('select count(*)::int n from private.notification_announcements where publication_key=$1', [concurrent.publication_key])).rows[0]!.n).toBe(1)
    await first.query('begin'); await publish(first, concurrent)
    const conflicting = publish(second, { ...concurrent, body: 'Changed content' }).then(() => null, (error: unknown) => error)
    await blocked(secondPid, firstPid); await first.query('commit')
    expect(await conflicting).toMatchObject({ code: '23505', message: 'publication_key_conflict' })
    console.log('PASS: same-key concurrent publication retry/conflict with observed waits; one UUID; other keys independent')

    const pubThenWithdraw = payload('publish-withdraw')
    await first.query('begin'); const pBeforeWithdrawal = await publish(first, pubThenWithdraw)
    const pendingWithdrawal = withdraw(second, pubThenWithdraw.publication_key)
    await blocked(secondPid, firstPid); await first.query('commit'); await pendingWithdrawal
    expect(await publish(third, pubThenWithdraw)).toEqual(pBeforeWithdrawal)
    expect(await rpc('get_notification_content', { p_announcement_id: pBeforeWithdrawal.announcement_id })).toBeNull()
    await first.query('begin'); const removal = await withdraw(first, concurrent.publication_key)
    const repeatRemoval = withdraw(second, concurrent.publication_key), afterRemovalRetry = publish(third, concurrent)
    await blocked(secondPid, firstPid); await blocked(thirdPid, firstPid); await first.query('commit')
    expect(await repeatRemoval).toEqual(removal); expect(await afterRemovalRetry).toEqual(published)
    console.log('PASS: publish/withdraw, withdraw/withdraw and withdraw/publication-retry genuine overlaps; no reactivation')

    // New withdrawal function versus both 8G.2 state writers, in both orders.
    await admin.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
    const adminPid = await pid(admin)
    for (const operation of ['mark_notification_read', 'process_announcement_notification'] as const) {
      const p = payload(`withdraw-${operation}`), r = await publish(first, p)
      await first.query('begin'); await withdraw(first, p.publication_key)
      const sql = operation === 'mark_notification_read' ? 'select public.mark_notification_read($1,$2) result' : 'select public.process_announcement_notification($1,$2) result'
      const args = [operation === 'mark_notification_read' ? `announcement:${r.announcement_id}` : r.announcement_id, r.content_hash]
      // Observer cannot use admin while its query waits; third publisher can
      // inspect pg_catalog locks, without business-table access.
      const transition = admin.query<{ result: { outcome: string } }>(sql, args)
      const until = Date.now() + 5000
      let observed = false
      do { observed = (await third.query<{ b: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) b', [adminPid, firstPid])).rows[0]!.b; if (!observed) await delay(20) } while (!observed && Date.now() < until)
      expect(observed).toBe(true); await first.query('commit'); expect((await transition).rows[0]!.result.outcome).toBe('obsolete')
      expect((await admin.query('select * from private.notification_announcement_states where announcement_id=$1', [r.announcement_id])).rows).toEqual([])
      const reverse = await publish(first, payload(`reverse-${operation}`))
      await admin.query('begin')
      await admin.query(sql, [operation === 'mark_notification_read' ? `announcement:${reverse.announcement_id}` : reverse.announcement_id, reverse.content_hash])
      const withdrawing = withdraw(first, reverse.publication_key)
      // No blocking query on admin in this direction, so a publisher observes.
      const deadline = Date.now() + 5000; let seen = false
      do { seen = (await third.query<{ b: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) b', [firstPid, adminPid])).rows[0]!.b; if (!seen) await delay(20) } while (!seen && Date.now() < deadline)
      expect(seen).toBe(true); await admin.query('commit'); await withdrawing
      expect((await admin.query('select * from private.notification_announcement_states where announcement_id=$1', [reverse.announcement_id])).rows).toHaveLength(1)
    }
    console.log('PASS: private withdrawal/read and withdrawal/process in both orders, actual row-lock waits and retained/absent sparse states')

    for (const isolation of ['repeatable read', 'serializable']) {
      for (const operation of [() => publish(first, concurrent), () => withdraw(first, concurrent.publication_key)]) {
        await first.query(`begin isolation level ${isolation}`)
        await expect(operation()).rejects.toMatchObject({ code: '25000', message: 'notification_isolation_invalid' })
        await first.query('rollback')
      }
    }
    for (const bearer of [settings.ANON_KEY, settings.SERVICE_ROLE_KEY, token(users[0]!)]) {
      for (const name of ['publish_notification_announcement', 'withdraw_notification_announcement']) {
        const response = await fetch(`${settings.API_URL}/rest/v1/rpc/${name}`, { method: 'POST',
          headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10_000) })
        expect(response.status).toBe(404)
      }
    }
    console.log('PASS: fixed isolation refused; anon/Auth/service_role cannot reach publication via PostgREST')
  } finally {
    for (const db of [...connections, admin]) await db.query('rollback').catch(() => undefined)
    await Promise.all(connections.map(db => db.end()))
    try {
      // Delete only identities generated by this run, never existing publications.
      await admin.query('delete from private.notification_announcements where publication_key=any($1::text[])', [[...keys]])
      if (installed) await cleanup(admin)
      if (provisioned) await admin.query('alter role my_notification_publisher password null')
      expect((await admin.query<{ n: number }>('select count(*)::int n from private.notification_announcements where publication_key=any($1::text[])', [[...keys]])).rows[0]!.n).toBe(0)
    } finally { await admin.end(); try { unlinkSync(filename) } catch { /* File may not have been created. */ } }
  }
}, 60_000)
