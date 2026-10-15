import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Socket, createServer } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { createSandbox, destroySandbox, docker, sandboxConnect } from '../backup/isolated.js'
import { fixtureSql } from '../backup/clients.js'
import { cloudPublisherConfig, decodeCloudTarget, verifyPublisher, verifyPublisherTls } from './database.ts'
import { publicationSchema, publicationHash } from './contract.ts'
import { publish, withdraw, safeError } from './publish.ts'
import { scramVerifier } from './test-fixtures.ts'

const image = 'public.ecr.aws/supabase/postgres:17.6.1.166'
const role = 'my_notification_publisher'
const project = 'aaaaaaaaaaaaaaaaaaaa'
const host = `db.${project}.supabase.co`
const sessionHost = 'aws-0-eu-west-1.pooler.supabase.com'
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMDATA)$/i.test(k)))

test('PROD6 real TLS/PostgreSQL/CLI on disposable no-network synthetic cluster', { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'my-prod6-tls-'))
  const password = randomBytes(32).toString('base64url')
  const adminPassword = randomBytes(32).toString('hex')
  const clients = new Set(), processes = new Set(), sockets = new Set()
  let sandbox, admin, proxy
  const caFile = join(directory, 'root.crt')
  let target, port, hook, stage = 'sandbox'
  function stream() {
    const socket = new Socket()
    // Test-only TCP routing. pg still verifies the synthetic DNS certificate;
    // no production config/CLI offers this routing or an isolated target mode.
    socket.connect = () => Socket.prototype.connect.call(socket, port, '127.0.0.1')
    return socket
  }
  async function publisher(delta = {}, override = {}) {
    const selected = decodeCloudTarget({ ...target, ...delta }, project)
    const config = cloudPublisherConfig(selected, password)
    const client = new pg.Client({ ...config, stream: stream(), ...override })
    clients.add(client); client.on('error', () => undefined)
    try {
      await client.connect()
      verifyPublisherTls(client, selected)
      await verifyPublisher(client, selected)
      return client
    } catch (error) { await client.end().catch(() => undefined); clients.delete(client); throw error }
  }
  async function close(client) { await client.end().catch(() => undefined); clients.delete(client) }
  async function configure(certificate = 'server', ssl = 'on', minimum = 'TLSv1.2') {
    // All substitutions belong to this test's closed certificate/settings set.
    assert.ok(['server', 'wrong', 'expired'].includes(certificate))
    assert.ok(['on', 'off'].includes(ssl)); assert.ok(['TLSv1.2', 'TLSv1.3'].includes(minimum))
    await admin.query(`alter system set ssl='${ssl}'`)
    await admin.query(`alter system set ssl_cert_file='/tmp/${certificate}.crt'`)
    await admin.query(`alter system set ssl_key_file='/tmp/${certificate}.key'`)
    await admin.query(`alter system set ssl_min_protocol_version='${minimum}'`)
    await admin.query('select pg_reload_conf()')
    await delay(200)
  }
  function payload(suffix) {
    return publicationSchema.parse({ publication_key: `prod6.synthetic.${suffix}`, category: 'changelog', title: 'Synthetic publisher',
      body: 'Isolated synthetic release', app_version: '0.8.29', action: { kind: 'notification_content' }, requires_action: false,
      include_new_users: false, expires_at: null, publication_context: { reason: 'Disposable test only', include_new_users_justification: null } })
  }
  async function cli(args, { dpapi = false, secret = password } = {}) {
    const cliArgs = ['--environment', 'cloud', '--project', project, '--target', join(directory, 'target.json'), '--authorize-cloud-connect', ...args]
    const env = { ...cleanEnv(), OS: process.env.OS, NODE_OPTIONS: `--import=${hook}` }
    let executable = process.execPath, argv = ['scripts/notifications/publish.ts', ...cliArgs], input
    if (dpapi) {
      executable = 'powershell.exe'
      // Synthetic masked input replaced only inside this test's trusted wrapper
      // caller. Actual wrapper executes unchanged; its cleanup is then checked.
      const ps = `$ErrorActionPreference='Stop'; function Read-Host { param([string]$Prompt,[switch]$AsSecureString); ConvertTo-SecureString ([Console]::ReadLine()) -AsPlainText -Force }; & '${resolve('scripts/notifications/secrets.ps1').replaceAll("'", "''")}' -PublisherArgs @(${cliArgs.map(a => "'" + a.replaceAll("'", "''") + "'").join(',')})`
      argv = ['-NoProfile', '-NonInteractive', '-Command', ps]
      input = secret + '\n'
    } else env.MY_NOTIFICATION_DATABASE_PASSWORD = secret
    const child = spawn(executable, argv, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
    child.stdin.on('error', () => undefined); child.stdin.end(input)
    const [code] = await once(child, 'exit')
    assert.ok(!stdout.includes(secret) && !stderr.includes(secret), 'Secret must never reach CLI output')
    return { code, stdout, stderr }
  }
  async function withAlteration(sql, restore) {
    await admin.query(sql)
    try { await assert.rejects(publisher(), e => /Identité|Permissions/.test(e.message) || e.code === '42501') }
    finally { await admin.query(restore) }
  }
  try {
    const digest = (JSON.parse(await docker(['image', 'inspect', image]))[0]).Id
    sandbox = await createSandbox({ container: `my-prod4-test-${randomBytes(6).toString('hex')}`, client_image: digest, password: adminPassword, source: true })
    admin = await sandboxConnect(sandbox, adminPassword)
    stage = 'migration_fixture'
    const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url)
    const migrations = (await readdir(migrationDirectory)).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort()
    assert.equal(migrations.length, 50)
    await fixtureSql(sandbox.container,
      `create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      set role postgres;\n` + (await Promise.all(migrations.map(f => readFile(new URL(f, migrationDirectory), 'utf8')))).join('\n'))
    await admin.query(`alter role ${role} password '${scramVerifier(password)}'`)
    stage = 'scram_configuration'
    // Require SCRAM on real TCP. No trust substitute for publisher login.
    const hbaFile = (await admin.query('show hba_file')).rows[0].hba_file
    assert.match(hbaFile, /^\/(etc\/postgresql|var\/lib\/postgresql\/data)\/[a-z_./-]+$/)
    await docker(['exec', '-i', sandbox.container_id, 'sh', '-c', `cat > ${hbaFile}`],
      'local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n')
    await admin.query('select pg_reload_conf()')
    stage = 'certificate_fixtures'

    const candidates = process.platform === 'win32' ? ['C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'openssl'] : ['openssl']
    const openssl = candidates.find(p => { try { execFileSync(p, ['version'], { windowsHide: true, stdio: 'ignore' }); return true } catch { return false } })
    assert.ok(openssl, 'OpenSSL executable required for real TLS fixtures')
    const certificate = args => execFileSync(openssl, args, { cwd: directory, env: cleanEnv(), windowsHide: true, stdio: 'ignore' })
    for (const root of ['root', 'bad-root']) certificate(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${root}.key`, '-out', `${root}.crt`, '-days', '1', '-subj', `/CN=MY-PROD6-${root}`])
    for (const name of ['server', 'wrong', 'expired']) {
      certificate(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=MY-PROD6-Synthetic'])
      await writeFile(join(directory, 'extensions.txt'), `subjectAltName=DNS:${name === 'wrong' ? 'wrong.invalid' : host}${name === 'wrong' ? '' : `,DNS:${sessionHost}`}\nextendedKeyUsage=serverAuth\n`)
      certificate(['x509', '-req', '-in', `${name}.csr`, '-CA', 'root.crt', '-CAkey', 'root.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', name === 'expired' ? '0' : '1', '-extfile', 'extensions.txt'])
      for (const ext of ['crt', 'key']) await docker(['exec', '-i', sandbox.container_id, 'sh', '-c', `cat > /tmp/${name}.${ext}; chown 100:101 /tmp/${name}.${ext}; chmod 600 /tmp/${name}.${ext}`], await readFile(join(directory, `${name}.${ext}`)))
    }
    await configure()
    stage = 'scenarios'
    proxy = createServer(socket => {
      sockets.add(socket); socket.once('close', () => sockets.delete(socket))
      const child = spawn('docker', ['exec', '-i', sandbox.container_id, 'nc', '127.0.0.1', '5432'], { env: cleanEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      processes.add(child); child.once('exit', () => processes.delete(child))
      child.stderr.on('data', () => undefined); child.stdin.on('error', () => undefined)
      socket.on('error', () => undefined); child.stdout.pipe(socket); socket.pipe(child.stdin)
      socket.once('close', () => child.kill()); child.once('error', () => socket.destroy()); child.once('exit', () => socket.destroy())
    })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening'); port = proxy.address().port
    target = { format: 'my-notification-target-v1', environment: 'cloud', project, connection: 'direct', host, port: 5432,
      database: 'postgres', user: role, system_id: sandbox.system_id, server_port: 5432, ca_file: caFile,
      ca_sha256: createHash('sha256').update(await readFile(caFile)).digest('hex') }
    await writeFile(join(directory, 'target.json'), JSON.stringify(target))
    // Fresh child CLI keeps the production target/hostname checks. This harness
    // alone maps the fictional project to the no-network fixture proxy.
    hook = new URL('file://' + join(directory, 'routing.mjs').replaceAll('\\', '/')).href
    await writeFile(join(directory, 'routing.mjs'), `import {Socket} from 'node:net'; const original=Socket.prototype.connect;
      Socket.prototype.connect=function(...args){ if(args[0]===5432&&args[1]===${JSON.stringify(host)}) return original.call(this,${port},'127.0.0.1'); throw new Error('Test routing refuses every other endpoint'); };`)

    await t.test('trusted CA + hostname + TLS + real role and cluster accepted', async () => {
      const c = await publisher(); await close(c)
    })
    await t.test('bad password rejected under SCRAM', async () => {
      await assert.rejects(publisher({}, { password: 'invalid-synthetic' }), e => e.code === '28P01')
    })
    await t.test('real cluster system_identifier mismatch rejected', async () => {
      await assert.rejects(publisher({ system_id: '1' }), /Identité réelle/)
    })
    await t.test('cluster identity read unavailable refuses instead of adding a grant', async () => {
      await withAlteration('revoke execute on function pg_catalog.pg_control_system() from public',
        'grant execute on function pg_catalog.pg_control_system() to public')
    })
    await t.test('same endpoint with wrong PostgreSQL identity rejected', async () => {
      await assert.rejects(publisher({}, { user: 'supabase_admin', password: adminPassword }), /Identité/)
    })
    await t.test('missing schema USAGE and EXECUTE refused', async () => {
      await withAlteration(`revoke usage on schema private from ${role}`, `grant usage on schema private to ${role}`)
      await withAlteration(`revoke execute on function private.publish_notification_announcement(jsonb) from ${role}`, `grant execute on function private.publish_notification_announcement(jsonb) to ${role}`)
    })
    await t.test('table/column/PUBLIC/sequence/schema/ownership grants refused', async () => {
      for (const [sql, restore] of [
        [`grant select on public.pokemon to ${role}`, `revoke select on public.pokemon from ${role}`],
        [`grant update(name_fr) on public.pokemon to ${role}`, `revoke update(name_fr) on public.pokemon from ${role}`],
        ['grant select on public.pokemon to public', 'revoke select on public.pokemon from public'],
        [`grant usage on sequence public.pokemon_id_seq to ${role}`, `revoke usage on sequence public.pokemon_id_seq from ${role}`],
        [`grant create on schema private to ${role}`, `revoke create on schema private from ${role}`],
        [`create table extensions.prod6_owned(id int); alter table extensions.prod6_owned owner to ${role}`, 'drop table extensions.prod6_owned'],
      ]) await withAlteration(sql, restore)
    })
    await t.test('freeze control/user RPC/grant option rights refused', async () => {
      for (const fn of ['private.set_business_write_freeze(boolean)', 'public.get_notification_center(integer,jsonb)', 'private.prepare_notification_publication(jsonb)']) {
        await withAlteration(`grant execute on function ${fn} to ${role}`, `revoke execute on function ${fn} from ${role}`)
      }
      await withAlteration(`grant execute on function private.publish_notification_announcement(jsonb) to ${role} with grant option`, `revoke grant option for execute on function private.publish_notification_announcement(jsonb) from ${role}`)
    })
    await t.test('memberships and privileged role attributes refused', async () => {
      await withAlteration(`grant authenticated to ${role}`, `revoke authenticated from ${role}`)
      for (const [enabled, disabled] of [['superuser', 'nosuperuser'], ['createdb', 'nocreatedb'], ['createrole', 'nocreaterole'], ['replication', 'noreplication'], ['bypassrls', 'nobypassrls'], ['inherit', 'noinherit']]) {
        await withAlteration(`alter role ${role} ${enabled}`, `alter role ${role} ${disabled}`)
      }
    })
    await t.test('private function signature/security contract refused', async () => {
      await withAlteration('alter function private.publish_notification_announcement(jsonb) security invoker', 'alter function private.publish_notification_announcement(jsonb) security definer')
    })
    await t.test('real TLS wrong CA rejected, no plaintext fallback', async () => {
      const bad = join(directory, 'bad-root.crt')
      await assert.rejects(publisher({ ca_file: bad, ca_sha256: createHash('sha256').update(await readFile(bad)).digest('hex') }), e => /CERT|SELF_SIGNED|VERIFY/.test(e.code))
    })
    await t.test('real TLS wrong hostname rejected', async () => {
      await configure('wrong')
      try { await assert.rejects(publisher(), e => e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') } finally { await configure() }
    })
    await t.test('real TLS expired certificate rejected', async () => {
      await configure('expired')
      try { await assert.rejects(publisher(), e => e.code === 'CERT_HAS_EXPIRED') } finally { await configure() }
    })
    await t.test('server without TLS and incompatible protocol rejected', async () => {
      await configure('server', 'off')
      try { await assert.rejects(publisher(), /does not support SSL/) } finally { await configure('server', 'on', 'TLSv1.3') }
      try {
        const config = cloudPublisherConfig(decodeCloudTarget(target, project), password)
        await assert.rejects(publisher({}, { ssl: { ...config.ssl, maxVersion: 'TLSv1.2' } }), e => e.code === 'EPROTO' || /PROTOCOL_VERSION/.test(e.code))
      } finally { await configure() }
    })
    await t.test('session config verifies TLS then refuses substituted real identity', async () => {
      // Simulate the unsafe pool mode: PostgreSQL sees a routing login rather
      // than the publisher. This is not a Supavisor compatibility proof.
      await admin.query(`create role "${role}.${project}" login password '${scramVerifier(password)}'`)
      try { await assert.rejects(publisher({ connection: 'session', host: sessionHost, user: `${role}.${project}` }), /Identité/) }
      finally { await admin.query(`drop role "${role}.${project}"`) }
    })
    await t.test('real Cloud CLI check/write consent/version/hash and sanitized failure', async () => {
      const p = payload('cli'), file = join(directory, 'publication.json')
      await writeFile(file, JSON.stringify(p))
      const check = await cli(['--file', file, '--check', '--expect-version', p.app_version])
      assert.equal(check.code, 0); const output = JSON.parse(check.stdout)
      assert.equal(output.content_hash, publicationHash(p)); assert.equal(output.TLS, 'verified'); assert.equal(output.deployment_verified, false)
      assert.equal((await admin.query('select count(*)::int n from private.notification_announcements where publication_key=$1', [p.publication_key])).rows[0].n, 0)
      const denied = await cli(['--file', file, '--apply', '--expect-version', p.app_version])
      assert.equal(denied.code, 1)
      const invalidSecret = await cli(['--file', file, '--check', '--expect-version', p.app_version], { secret: 'DO_NOT_PRINT' })
      assert.equal(invalidSecret.code, 1); assert.equal(invalidSecret.stdout, '')
      await admin.query('select private.set_business_write_freeze(true)')
      const applied = await cli(['--file', file, '--apply', '--expect-version', p.app_version, '--authorize-publish', '--expect-hash', publicationHash(p)])
      assert.equal(applied.code, 0)
      const receipt = JSON.parse(applied.stdout.trim().split('\n').at(-1))
      const replay = await cli(['--file', file, '--apply', '--expect-version', p.app_version, '--authorize-publish', '--expect-hash', publicationHash(p)])
      assert.deepEqual(JSON.parse(replay.stdout.trim().split('\n').at(-1)), receipt)
      const removed = await cli(['--withdraw', p.publication_key, '--authorize-withdraw'])
      assert.equal(removed.code, 0)
      assert.equal((await admin.query('select frozen from private.business_write_freeze')).rows[0].frozen, true)
    })
    await t.test('committed publication response lost; explicit same-file/key/hash recovery', async () => {
      const p = payload('lost-response'), client = await publisher()
      const socket = client.connection.stream
      socket.pause()
      const pending = publish(client, p).then(() => ({ unexpected: true }), error => ({ error }))
      const deadline = Date.now() + 5000
      let stored
      while (Date.now() < deadline) {
        stored = (await admin.query('select id::text,content_hash,published_at from private.notification_announcements where publication_key=$1', [p.publication_key])).rows[0]
        if (stored) break
        await delay(20)
      }
      assert.ok(stored, 'Independent session sees committed row while publisher has no response')
      socket.destroy(new Error('Synthetic loss after commit'))
      const outcome = await pending
      assert.ok(outcome.error); assert.match(safeError(outcome.error), /Issue incertaine/)
      await close(client)
      const fresh = await publisher(), recovered = await publish(fresh, p)
      assert.equal(recovered.announcement_id, stored.id); assert.equal(recovered.content_hash, publicationHash(p))
      assert.deepEqual(await publish(fresh, p), recovered)
      await assert.rejects(publish(fresh, { ...p, body: 'Conflicting content' }), e => e.code === '23505')
      assert.equal((await admin.query('select count(*)::int n from private.notification_announcements where publication_key=$1', [p.publication_key])).rows[0].n, 1)
      const removed = await withdraw(fresh, p.publication_key)
      assert.deepEqual(await withdraw(fresh, p.publication_key), removed)
      assert.deepEqual(await publish(fresh, p), recovered)
      for (const sql of ['update private.notification_announcement_states set read_at=read_at where false', 'update public.profiles set id=id where false',
        'select private.set_business_write_freeze(false)', 'select public.get_notification_center()', 'alter role my_notification_publisher superuser']) {
        await assert.rejects(fresh.query(sql), e => e.code === '42501')
      }
      await close(fresh)
    })
    await t.test('committed withdrawal response lost; same-key recovery keeps first timestamp', async () => {
      const p = payload('lost-withdrawal'), client = await publisher()
      const receipt = await publish(client, p)
      client.connection.stream.pause()
      const pending = withdraw(client, p.publication_key).then(() => ({ unexpected: true }), error => ({ error }))
      const deadline = Date.now() + 5000
      let timestamp
      while (Date.now() < deadline) {
        timestamp = (await admin.query(`select to_char(withdrawn_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') value
          from private.notification_announcements where publication_key=$1`, [p.publication_key])).rows[0]?.value
        if (timestamp) break
        await delay(20)
      }
      assert.ok(timestamp)
      client.connection.stream.destroy(new Error('Synthetic withdrawal response loss after commit'))
      assert.match(safeError((await pending).error), /Issue incertaine/)
      await close(client)
      const fresh = await publisher(), recovered = await withdraw(fresh, p.publication_key)
      assert.equal(recovered.announcement_id, receipt.announcement_id)
      assert.equal(recovered.withdrawn_at, timestamp)
      assert.deepEqual(await withdraw(fresh, p.publication_key), recovered)
      assert.deepEqual(await publish(fresh, p), receipt)
      await close(fresh)
    })
    if (process.platform === 'win32') await t.test('actual protected PowerShell wrapper with synthetic stdin secret', async () => {
      const p = payload('powershell'), file = join(directory, 'powershell.json')
      await writeFile(file, JSON.stringify(p))
      const result = await cli(['--file', file, '--check', '--expect-version', p.app_version], { dpapi: true })
      assert.equal(result.code, 0, result.stderr)
      assert.equal(JSON.parse(result.stdout).TLS, 'verified')
    })
  } catch (error) {
    t.diagnostic(`Failed isolated stage: ${stage}`)
    throw error
  } finally {
    for (const client of clients) await close(client)
    for (const socket of sockets) socket.destroy()
    for (const child of processes) child.kill()
    if (proxy) await new Promise(resolve => proxy.close(resolve))
    await admin?.end().catch(() => undefined)
    if (sandbox) await destroySandbox(sandbox, { source: true })
    // Only this exact mkdtemp path, never a prefix-wide cleanup.
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'))
    await rm(directory, { recursive: true, force: true })
  }
})
