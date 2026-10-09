import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { connect } from './catalog/database.ts'

// Real Local HTTP/BIGINT and overlapping-snapshot proof. Reserved fixtures only;
// no user collections, migrations, reset, configuration or Cloud access.
const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
  execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
assert.equal(settings.API_URL, 'http://127.0.0.1:55321')
const users = [1, 2, 3, 4].map(n => `a2500000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const contentUsers = [1, 2, 3].map(n => `a1600000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const parent = (n = 1) => `c2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const item = (n: number) => `d2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const operation = (n: number) => `e2900000-0000-0000-0000-${String(n).padStart(12, '0')}`
function token(user: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, role: 'authenticated', aud: 'authenticated', aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 600 })}`
  return `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
}
async function rpc(name: string, args: Record<string, unknown>, user = users[0]!) {
  const response = await fetch(`${settings.API_URL}/rest/v1/rpc/${name}`, { method: 'POST', signal: AbortSignal.timeout(15_000),
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  assert.equal(response.status, 200, `${name} HTTP status`)
  return JSON.parse(await response.text()) as unknown
}
const envelope = z.strictObject({ order_contract_version: z.union([z.literal(1), z.literal(2)]), personal_revision: z.string(), items: z.array(z.record(z.string(), z.unknown())) })
const result = z.strictObject({ operation_id: z.string(), outcome: z.enum(['changed', 'noop']), personal_revision: z.string(), collection_item_id: z.string() })
const db = await connect(), reader = await connect()
let installed = false
try {
  await db.query('select pg_advisory_lock(829007)')
  assert.equal((await db.query<{ n: string }>('select count(*)::text n from auth.users where id=any($1::uuid[])', [[...users, ...contentUsers]])).rows[0]!.n, '0', 'Fixture identities must be free')
  await db.query('begin')
  for (const fixture of ['collection_content.fixtures.inc', 'relative_order_writer.fixtures.inc', 'manual_collection_items_v2.fixtures.inc']) {
    await db.query(readFileSync(new URL(`../supabase/tests/database/${fixture}`, import.meta.url), 'utf8'))
  }
  await db.query('commit'); installed = true
  const volumeId = 'c1600000-0000-0000-0000-000000000003'
  const volume = envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: volumeId }, contentUsers[0]))
  assert.equal(volume.items.length, 1005)
  assert.deepEqual(envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: volumeId }, contentUsers[1])), volume)
  assert.equal(await rpc('get_collection_content_v2', { p_collection_id: volumeId }, contentUsers[2]), null)
  const mixed = envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: 'c1600000-0000-0000-0000-000000000001' }, contentUsers[1]))
  assert.equal(mixed.items[3]!.variant_id, '-9007199254740995')
  assert.equal(mixed.items[4]!.set_id, '-9007199254740996')
  assert.ok(mixed.items.every(row => Object.keys(row).length === 16 && row.is_hidden === false))
  console.log('PASS: real HTTP full 1005-item envelope, exact 16 keys, shared owner possession, inaccessible NULL, signed BIGINT IDs.')

  // Start a read statement while the writer is uncommitted. Its gate is an
  // advisory lock held by db; observe the wait before committing the writer.
  await db.query('begin')
  await db.query("set local role authenticated; set local request.jwt.claims = '{\"sub\":\"a2500000-0000-0000-0000-000000000001\",\"aal\":\"aal2\"}'")
  await db.query('select public.reorder_collection_item_v2($1,$2,$3,null,$4::bigint,$5)', [parent(), item(5), 'start', '2', operation(1)])
  await db.query('reset role')
  await db.query('insert into public.physical_copies(user_id,variant_id) values($1,-95005)', [users[0]])
  await reader.query('begin')
  await reader.query("set local role authenticated; set local request.jwt.claims = '{\"sub\":\"a2500000-0000-0000-0000-000000000001\",\"aal\":\"aal2\"}'")
  const pid = (await reader.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  const reading = reader.query<{ payload: z.infer<typeof envelope> }>('with gate as materialized (select pg_advisory_xact_lock(829007)) select public.get_collection_content_v2($1) payload from gate', [parent()])
  let observed = false
  for (let attempt = 0; attempt < 100; attempt++) {
    observed = (await db.query<{ waiting: boolean }>('select pg_backend_pid()=any(pg_blocking_pids($1)) waiting', [pid])).rows[0]!.waiting
    if (observed) break
    await delay(20)
  }
  assert.ok(observed, 'Reader statement snapshot started before writer commit')
  await db.query('commit')
  await db.query('select pg_advisory_unlock(829007)')
  const old = (await reading).rows[0]!.payload
  assert.equal(old.personal_revision, '2')
  assert.equal(old.items[0]!.collection_item_id, item(1))
  assert.equal(old.items[4]!.owned, false)
  await reader.query('rollback')
  const fresh = envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: parent() }))
  assert.equal(fresh.personal_revision, '3')
  assert.equal(fresh.items[0]!.collection_item_id, item(5))
  assert.equal(fresh.items[0]!.owned, true)
  console.log('PASS: observed overlapping statement snapshot preserves old revision/order/owner possession; next read sees all committed changes together.')

  await db.query('update public.collections set personal_revision=9007199254740994 where id=$1', [parent(4)])
  const args = { p_collection_id: parent(4), p_variant_id: '9007199254740997', p_placement: 'end', p_expected_revision: '9007199254740994', p_operation_id: operation(2) }
  const added = result.parse(await rpc('add_manual_collection_item_v2', args))
  assert.equal(added.personal_revision, '9007199254740995')
  const read = envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: parent(4) }))
  assert.equal(read.personal_revision, added.personal_revision); assert.equal(read.items[0]!.variant_id, '9007199254740997')
  const moved = result.parse(await rpc('reorder_collection_item_v2', { p_collection_id: parent(4), p_item_id: added.collection_item_id,
    p_placement: 'end', p_anchor_id: null, p_expected_revision: added.personal_revision, p_operation_id: operation(3) }))
  assert.equal(moved.outcome, 'noop'); assert.equal(moved.personal_revision, added.personal_revision)
  const removed = result.parse(await rpc('remove_manual_collection_item_v2', { p_collection_id: parent(4), p_collection_item_id: added.collection_item_id,
    p_expected_revision: added.personal_revision, p_operation_id: operation(4) }))
  assert.equal(removed.personal_revision, '9007199254740996')
  assert.deepEqual(await rpc('get_collection_operation_result', { p_collection_id: parent(4), p_operation_id: operation(2) }), added)
  assert.deepEqual(await rpc('add_manual_collection_item_v2', args), added) // Historical add after removal, never new item.
  assert.equal(envelope.parse(await rpc('get_collection_content_v2', { p_collection_id: parent(4) })).items.length, 0)
  console.log('PASS: three v2 writers accept decimal-string BIGINT over real PostgREST; historical receipt/retry after removal preserves result and empty current content.')
} finally {
  try {
    await reader.query('rollback'); await db.query('rollback')
    if (installed) {
      await db.query('begin')
      await db.query('delete from public.collections where owner_id=any($1::uuid[])', [[...users, ...contentUsers]])
      await db.query('delete from auth.users where id=any($1::uuid[])', [[...users, ...contentUsers]])
      await db.query('delete from public.catalog_variants where source_card_id in (-86001,-9007199254740995,-95001,-95002,-95003,-95004)')
      await db.query('delete from public.source_cards where id in (-86001,-9007199254740995,-95001,-95002,-95003,-95004)')
      await db.query('delete from public.automatic_target_states where set_id in (-95001,-95002,-95003)')
      await db.query('delete from public.tcg_sets where id in (-86001,-9007199254740996,-95001,-95002,-95003)')
      await db.query('delete from public.tcg_series where id in (-86001,-95001)')
      await db.query('commit')
      assert.equal((await db.query<{ n: string }>('select count(*)::text n from auth.users where id=any($1::uuid[])', [[...users, ...contentUsers]])).rows[0]!.n, '0')
      console.log('PASS: all isolated HTTP/snapshot fixtures cleaned.')
    }
  } finally { await Promise.all([reader.end(), db.end()]) }
}
