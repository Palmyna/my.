import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { verifiedTlsConfig } from '../postgres-tls.ts'
import { createSandbox, destroySandbox, docker, sandboxConnect } from '../backup/isolated.js'
import { fixtureSql } from '../backup/clients.js'
import { scramVerifier } from '../notifications/test-fixtures.ts'
import { cloudProject } from './cloud.js'
import { readFreeze, observe, verifyContract } from './database.js'

const image = 'public.ecr.aws/supabase/postgres:17.6.1.166'
const host = `db.${cloudProject}.supabase.co`
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMDATA)$/i.test(key)))

test('AUTO.1 real CLI, SQL contract, concurrency and TLS on a disposable network-none cluster', { timeout: 240_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'my-auto1-'))
  const password = randomBytes(32).toString('hex')
  const processes = new Set(), sockets = new Set()
  let sandbox, admin, proxy, target, hook, stage = 'sandbox'
  const targetFile = join(directory, 'target.json')
  const state = () => readFreeze(admin)
  const bound = revision => ['--expect-system-id', sandbox.system_id, '--expect-revision', revision]
  async function cli(command, args = [], { fault = '', secret = password, local = false, targetPath = targetFile, protectedInput = false } = {}) {
    const argv = ['--command', command, '--environment', local ? 'local' : 'cloud', '--project', local ? 'my-local' : cloudProject,
      ...(!local ? ['--target', targetPath, '--authorize-cloud-connect'] : []), ...args]
    const env = { ...cleanEnv(), NODE_OPTIONS: `--import=${hook}`, MY_AUTO1_TEST_FAULT: fault }
    if (local) env.MY_MAINTENANCE_DATABASE_URL = `postgresql://postgres:${secret}@127.0.0.1:55322/postgres`
    else if (!protectedInput) env.MY_MAINTENANCE_DATABASE_PASSWORD = secret
    let executable = process.execPath, childArgs = ['scripts/maintenance/cli.js', ...argv]
    if (protectedInput) {
      executable = 'powershell.exe'
      env.OS = process.env.OS
      // Only the synthetic test replaces masked input. The real wrapper still
      // runs, passes its child environment, zeroes the BSTR and removes it.
      const wrapper = new URL('./secrets.ps1', import.meta.url).pathname.replace(/^\/(.:)/, '$1')
      const ps = `$ErrorActionPreference='Stop'; function Read-Host { param([string]$Prompt,[switch]$AsSecureString); ConvertTo-SecureString ([Console]::ReadLine()) -AsPlainText -Force }; & '${decodeURIComponent(wrapper).replaceAll("'", "''")}' -MaintenanceArgs @(${argv.map(a => "'" + a.replaceAll("'", "''") + "'").join(',')})`
      childArgs = ['-NoProfile', '-NonInteractive', '-Command', ps]
    }
    const child = spawn(executable, childArgs, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    processes.add(child)
    let stdout = '', stderr = ''
    child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
    child.stdin.on('error', () => undefined); child.stdin.end(protectedInput ? secret + '\n' : undefined)
    const timeout = setTimeout(() => child.kill(), 20_000)
    try {
      const [code] = await once(child, 'exit')
      assert.ok(!stdout.includes(secret) && !stderr.includes(secret) && !stdout.includes('sensitive-server-detail'), 'No secret/server error in output')
      return { code, stderr, results: stdout.trim() ? stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [] }
    } finally { clearTimeout(timeout); processes.delete(child) }
  }
  async function success(command, args = [], options) {
    const result = await cli(command, args, options)
    assert.equal(result.code, 0, JSON.stringify(result.results))
    assert.equal(result.stderr, '')
    return result.results.at(-1)
  }
  async function refused(command, args, diagnostic, options) {
    const result = await cli(command, args, options)
    assert.equal(result.code, 1)
    const last = result.results.at(-1)
    assert.equal(last.recorded, 'unknown'); assert.equal(last.verified, false)
    assert.equal(last.backup_authorized, false)
    if (diagnostic) assert.equal(last.diagnostic, diagnostic)
    return last
  }
  async function configure(certificate = 'server', ssl = 'on') {
    assert.ok(['server', 'wrong'].includes(certificate)); assert.ok(['on', 'off'].includes(ssl))
    await admin.query(`alter system set ssl='${ssl}'`)
    await admin.query(`alter system set ssl_cert_file='/tmp/${certificate}.crt'`)
    await admin.query(`alter system set ssl_key_file='/tmp/${certificate}.key'`)
    await admin.query('select pg_reload_conf()'); await delay(200)
  }
  async function snapshot() {
    const relations = (await admin.query(`select format('%I.%I',n.nspname,c.relname) name from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and
      ((n.nspname in ('public','private') and c.oid<>'private.business_write_freeze'::regclass) or c.oid='auth.users'::regclass) order by 1`)).rows
    const hashes = {}
    for (const { name } of relations) hashes[name] = (await admin.query(`select count(*)::text count,
      md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from ${name} t`)).rows[0]
    return { relations: hashes, sequences: (await admin.query(`select schemaname,sequencename,last_value::text
      from pg_sequences where schemaname in ('public','private') order by schemaname,sequencename`)).rows }
  }
  try {
    const digest = JSON.parse(await docker(['image', 'inspect', image]))[0].Id
    sandbox = await createSandbox({ container: `my-prod4-test-${randomBytes(6).toString('hex')}`, client_image: digest, password, source: true })
    admin = await sandboxConnect(sandbox, password)
    stage = 'SQL_fixture'
    const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url)
    const migrations = (await readdir(migrationDirectory)).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort()
    await fixtureSql(sandbox.container, `create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$; set role postgres;\n`
      + (await Promise.all(migrations.map(f => readFile(new URL(f, migrationDirectory), 'utf8')))).join('\n')
      + `\ncreate schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key);
        insert into supabase_migrations.schema_migrations(version) values ${migrations.map(f => `('${f.slice(0, 14)}')`).join(',')};`)
    await admin.query(`alter role postgres password '${scramVerifier(password)}'; alter role authenticator password '${scramVerifier(password)}'`)
    // Match managed postgres rather than the image's initial superuser. No
    // production grant/role change is performed by the operator tool.
    await admin.query('alter role postgres nosuperuser; grant pg_read_all_stats to postgres')
    await admin.query("update private.business_write_freeze set revision='9007199254740997'::bigint where singleton")
    const hba = (await admin.query('show hba_file')).rows[0].hba_file
    assert.match(hba, /^\/(etc\/postgresql|var\/lib\/postgresql\/data)\/[a-z_./-]+$/)
    await docker(['exec', '-i', sandbox.container_id, 'sh', '-c', `cat > ${hba}`], 'local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n')
    await admin.query('select pg_reload_conf()')
    stage = 'TLS_fixture'
    const candidates = process.platform === 'win32' ? ['C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'openssl'] : ['openssl']
    const openssl = candidates.find(p => { try { execFileSync(p, ['version'], { windowsHide: true, stdio: 'ignore' }); return true } catch { return false } })
    assert.ok(openssl, 'OpenSSL required for isolated TLS certificates')
    const certificate = args => execFileSync(openssl, args, { cwd: directory, env: cleanEnv(), windowsHide: true, stdio: 'ignore' })
    for (const root of ['root', 'bad-root']) certificate(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${root}.key`, '-out', `${root}.crt`, '-days', '1', '-subj', `/CN=MY-AUTO1-${root}`])
    for (const name of ['server', 'wrong']) {
      certificate(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=MY-AUTO1-Synthetic'])
      await writeFile(join(directory, 'extensions.txt'), `subjectAltName=DNS:${name === 'wrong' ? 'wrong.invalid' : host}\nextendedKeyUsage=serverAuth\n`)
      certificate(['x509', '-req', '-in', `${name}.csr`, '-CA', 'root.crt', '-CAkey', 'root.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', '1', '-extfile', 'extensions.txt'])
      for (const ext of ['crt', 'key']) await docker(['exec', '-i', sandbox.container_id, 'sh', '-c', `cat > /tmp/${name}.${ext}; chown 100:101 /tmp/${name}.${ext}; chmod 600 /tmp/${name}.${ext}`], await readFile(join(directory, `${name}.${ext}`)))
    }
    await configure()
    proxy = createServer(socket => {
      sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => undefined)
      const child = spawn('docker', ['exec', '-i', sandbox.container_id, 'nc', '127.0.0.1', '5432'], { env: cleanEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      processes.add(child); child.once('exit', () => processes.delete(child))
      child.stderr.on('data', () => undefined); child.stdin.on('error', () => undefined)
      child.stdout.pipe(socket); socket.pipe(child.stdin)
      socket.once('close', () => child.kill()); child.once('error', () => socket.destroy()); child.once('exit', () => socket.destroy())
    })
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
    target = { format: 'my-maintenance-target-v1', environment: 'cloud', project: cloudProject, connection: 'direct', host,
      port: 5432, database: 'postgres', user: 'postgres', system_id: sandbox.system_id, server_port: 5432,
      ca_file: join(directory, 'root.crt'), ca_sha256: createHash('sha256').update(await readFile(join(directory, 'root.crt'))).digest('hex') }
    await writeFile(targetFile, JSON.stringify(target))
    // Test-only routing: every connection either reaches this loopback proxy
    // or throws BEFORE DNS/network access. There is no production test mode.
    hook = pathToFileURL(join(directory, 'routing.mjs')).href
    await writeFile(join(directory, 'routing.mjs'), `import {Socket} from 'node:net'; import pg from ${JSON.stringify(new URL('../../node_modules/pg/lib/index.js', import.meta.url).href)};
      const connect=Socket.prototype.connect; Socket.prototype.connect=function(...args){
        if((args[0]===5432&&args[1]===${JSON.stringify(host)})||(args[0]===55322&&args[1]==='127.0.0.1'))
          return connect.call(this,${proxy.address().port},'127.0.0.1'); throw new Error('Test refuses all other endpoints'); };
      const open=pg.Client.prototype.connect; let opens=0; pg.Client.prototype.connect=async function(...args){
        if(++opens===2&&process.env.MY_AUTO1_TEST_FAULT==='reread') throw Object.assign(new Error('sensitive-server-detail'),{code:'ECONNREFUSED'});
        return await open.apply(this,args); };
      const query=pg.Client.prototype.query; pg.Client.prototype.query=async function(...args){
        const result=await query.apply(this,args); const fault=process.env.MY_AUTO1_TEST_FAULT;
        if(args[0]==='select private.set_business_write_freeze($1)::text'&&fault==='before-commit') process.emit('SIGINT');
        if(args[0]==='commit'&&fault==='after-commit') process.emit('SIGTERM');
        if(args[0]==='commit'&&fault==='commit-lost') throw Object.assign(new Error('sensitive-server-detail'),{code:'ECONNRESET'});
        if(args[0]==='commit'&&fault==='commit-race') await query.call(this,'select private.set_business_write_freeze(true)');
        return result; };`)
    stage = 'scenarios'
    const before = await snapshot()
    await t.test('preflight verifies real TLS, identity, exact migrations and permanent exception contract', async () => {
      const result = await success('preflight')
      assert.equal(result.identity.system_id, sandbox.system_id)
      assert.equal(result.identity.transport, 'verified_TLS_CA_and_hostname')
      assert.equal(result.repository.environment, 'cloud'); assert.equal(result.repository.project, cloudProject)
      assert.equal(result.contract.migrations, migrations.length); assert.equal(result.state.frozen, false)
      assert.equal(result.backup_authorized, false); assert.equal(result.global_closure, 'not_attested')
    })
    await t.test('bad password, cluster identity, visibility, CA and hostname fail closed', async () => {
      await refused('preflight', [], 'postgresql_authentication_failed', { secret: 'invalid-synthetic' })
      const file = join(directory, 'wrong-target.json')
      await writeFile(file, JSON.stringify({ ...target, system_id: '1' }))
      await refused('preflight', [], 'unexpected_cloud_postgresql_system_or_operator', { targetPath: file })
      await admin.query('revoke pg_read_all_stats, pg_monitor from postgres')
      try { await refused('preflight', [], 'identity_or_visibility_invalid') } finally { await admin.query('grant pg_read_all_stats, pg_monitor to postgres') }
      const badCa = await readFile(join(directory, 'bad-root.crt'))
      await writeFile(file, JSON.stringify({ ...target, ca_file: join(directory, 'bad-root.crt'), ca_sha256: createHash('sha256').update(badCa).digest('hex') }))
      await refused('preflight', [], undefined, { targetPath: file })
      await configure('wrong'); try { await refused('preflight', []) } finally { await configure() }
      await configure('server', 'off'); try { await refused('preflight', []) } finally { await configure() }
      assert.equal((await state()).frozen, false)
    })
    await t.test('already open is idempotent and reopen consent never authorizes a close', async () => {
      const initial = await state()
      const result = await success('reopen', [...bound(initial.revision), '--authorize-reopen'])
      assert.equal(result.changed, false); assert.equal(result.idempotent, true); assert.equal(result.state.revision, initial.revision)
      await refused('close', [...bound(initial.revision), '--authorize-reopen'], 'arguments_invalid_explicit_target_and_authorization_required')
    })
    await t.test('concurrent operators cannot both use the same revision', async () => {
      const initial = await state()
      const attempts = await Promise.all([cli('close', [...bound(initial.revision), '--authorize-close']), cli('close', [...bound(initial.revision), '--authorize-close'])])
      assert.deepEqual(attempts.map(r => r.code).sort(), [0, 1])
      assert.equal(attempts.find(r => r.code === 1).results.at(-1).diagnostic, 'freeze_revision_changed')
      assert.equal((await state()).revision, (BigInt(initial.revision) + 1n).toString())
      await success('reopen', [...bound((await state()).revision), '--authorize-reopen'])
    })
    await t.test('admitted writer delays close; exclusive barrier and independent reread establish commit', async () => {
      const ordinary = new pg.Client({ host: '127.0.0.1', port: proxy.address().port, database: 'postgres',
        user: 'authenticator', password, ssl: verifiedTlsConfig(target), connectionTimeoutMillis: 5_000, statement_timeout: 10_000 })
      ordinary.on('error', () => undefined)
      const watcher = await sandboxConnect(sandbox, password)
      try {
        await ordinary.connect()
        await ordinary.query('begin'); await ordinary.query('set local role authenticated')
        // Real PROD.2 guard admission through an ordinary zero-row statement;
        // no synthetic JWT, sequence, personal row or direct operator bypass.
        await ordinary.query('update public.user_preferences set binder_default_format=binder_default_format where false')
        const initial = await state()
        const pending = success('close', [...bound(initial.revision), '--authorize-close'])
        let waiting = false
        for (let i = 0; i < 100; i++) {
          waiting = (await observe(watcher)).admission_locks.some(lock => lock.mode === 'ExclusiveLock' && !lock.granted)
          if (waiting) break
          await delay(30)
        }
        assert.equal(waiting, true)
        assert.equal((await readFreeze(watcher)).frozen, false)
        await ordinary.query('commit')
        const result = await pending
        assert.equal(result.changed, true); assert.equal(result.independent_read, true); assert.equal(result.state.frozen, true)
        assert.equal(result.state.revision, (BigInt(initial.revision) + 1n).toString())
      } finally { await ordinary.end().catch(() => undefined); await watcher.end() }
    })
    await t.test('already closed does not increment revision; stale close/reopen consents both fail', async () => {
      const closed = await state()
      const result = await success('close', [...bound(closed.revision), '--authorize-close'])
      assert.equal(result.idempotent, true); assert.deepEqual(result.state, closed)
      for (const name of ['close', 'reopen']) await refused(name, [...bound((BigInt(closed.revision) - 1n).toString()), name === 'close' ? '--authorize-close' : '--authorize-reopen'], 'freeze_revision_changed')
      assert.deepEqual(await state(), closed)
    })
    await t.test('closed verification scopes drainage and preserves API/privileged uncertainty', async () => {
      const result = await success('verify-closed', bound((await state()).revision))
      assert.equal(result.state.frozen, true); assert.equal(result.probes.verified, false)
      assert.equal(result.privileged_writer_exclusion, 'not_attested')
      assert.equal(result.observation.privileged_and_auth_drained, false)
      assert.equal(result.super_admin_exception, 'preserved_not_probed')
      await admin.query('begin'); await admin.query('select pg_advisory_xact_lock_shared(771403)')
      try { await refused('verify-closed', bound((await state()).revision), 'drainage_uncertain_inspect_observe') }
      finally { await admin.query('rollback') }
    })
    await t.test('lock timeout and independent reread refusal never reopen', async () => {
      const closed = await state()
      await admin.query('begin'); await admin.query('select pg_advisory_xact_lock(771403)')
      try { await refused('reopen', [...bound(closed.revision), '--authorize-reopen', '--timeout-ms', '100'], 'statement_timeout_state_unknown') }
      finally { await admin.query('rollback') }
      await refused('close', [...bound(closed.revision), '--authorize-close'], 'cloud_service_unavailable', { fault: 'reread' })
      assert.deepEqual(await state(), closed)
      await refused('close', [...bound(closed.revision), '--authorize-close'], 'committed_state_unverified', { fault: 'commit-race' })
      assert.equal((await success('preflight')).state.frozen, true)
    })
    await t.test('interruption before commit rolls back; lost acknowledgment and postcommit interruption require fresh recovery', async () => {
      await success('reopen', [...bound((await state()).revision), '--authorize-reopen'])
      const open = await state()
      const interrupted = await cli('close', [...bound(open.revision), '--authorize-close'], { fault: 'before-commit' })
      assert.equal(interrupted.code, 130); assert.equal(interrupted.results.at(-1).recorded, 'unknown')
      assert.deepEqual(await state(), open)
      await refused('close', [...bound(open.revision), '--authorize-close'], undefined, { fault: 'commit-lost' })
      const recovered = await success('preflight'); assert.equal(recovered.state.frozen, true)
      const retry = await success('close', [...bound(recovered.state.revision), '--authorize-close'])
      assert.equal(retry.idempotent, true); assert.equal(retry.state.revision, recovered.state.revision)
      await success('reopen', [...bound(retry.state.revision), '--authorize-reopen'])
      const afterCommit = await cli('close', [...bound((await state()).revision), '--authorize-close'], { fault: 'after-commit' })
      assert.equal(afterCommit.code, 130); assert.equal(afterCommit.results.at(-1).verified, false)
      assert.equal((await success('preflight')).state.frozen, true)
    })
    await t.test('Local PROD.3 retains authentic authenticator probes and explicit reopen on the same isolated SQL contract', async () => {
      const closed = await state()
      const verified = await success('verify-closed', bound(closed.revision), { local: true })
      assert.equal(verified.ordinary_writes, 'closed_and_drained')
      assert.equal(verified.probes.identity, 'authenticator')
      await success('reopen', [...bound(closed.revision), '--authorize-reopen'], { local: true })
      const open = await success('verify-open', bound((await state()).revision), { local: true })
      assert.equal(open.probes.statement_writes, 'allowed_zero_rows')
    })
    if (process.platform === 'win32') await t.test('Windows protected input wrapper executes without persisting or logging password', async () => {
      await success('preflight', [], { protectedInput: true })
    })
    assert.deepEqual(await snapshot(), before)
    await verifyContract(admin)
    assert.equal((await state()).frozen, false)
  } catch (error) {
    // Stage only: never forward arbitrary PostgreSQL/Docker output.
    t.diagnostic(`Isolated failure stage: ${stage}`)
    throw error
  } finally {
    // Destroy only this nonce/ID-verified fixture. Never toggle in cleanup.
    if (admin) await admin.end().catch(() => undefined)
    for (const socket of sockets) socket.destroy()
    for (const child of processes) child.kill()
    if (proxy) await new Promise(resolve => proxy.close(resolve))
    if (sandbox) await destroySandbox(sandbox, { source: true })
    await rm(directory, { recursive: true, force: true })
  }
})
