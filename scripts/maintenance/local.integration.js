import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import pg from 'pg'
import { install, cleanup, users, parent, item, operation } from '../collection-update-apply-fixtures.ts'
import { parseCommand, run, safeDiagnostic } from './cli.js'
import { operatorConnection, connectOperator, readFreeze, verifyContract, observe } from './database.js'
import { observeHttp } from './http-check.js'
import { maintenanceResponse } from '../../vercel/maintenance-page.ts'

async function main() {
  const target = ['--environment', 'local', '--project', 'my-local']
  const connection = operatorConnection()
  const { client: admin, identity } = await connectOperator(connection)
  const url = new URL(connection)
  url.username = 'authenticator'
  const ordinary = new pg.Client({ connectionString: url.href, statement_timeout: 10_000, application_name: 'my-maintenance-test' })
  ordinary.on('error', () => undefined)
  let installed = false
  let server
  let httpClosed = false
  let origin
  let scenarios = 0
  const pass = name => { scenarios++; console.log(`PASS ${name}`) }
  const command = (name, revision, extra = []) => parseCommand(['--command', name, ...target,
    ...(revision === undefined ? [] : ['--expect-system-id', identity.system_id, '--expect-revision', revision]), ...extra])
  const bound = async (name, extra = []) => run(command(name, (await readFreeze(admin)).revision, extra))
  const pending = promise => promise.then(result => ({ result })).catch(error => ({ error }))
  async function snapshot() {
    const result = {}
    const relations = (await admin.query(`select format('%I.%I',n.nspname,c.relname) relation
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
        and ((n.nspname in ('public','private') and c.oid<>'private.business_write_freeze'::regclass) or c.oid='auth.users'::regclass) order by 1`)).rows
    for (const { relation } of relations) {
      result[relation] = (await admin.query(`select count(*)::text count,
        encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') hash from ${relation} t`)).rows[0]
    }
    result.sequences = (await admin.query(`select sequencename,last_value::text from pg_sequences where schemaname='public' order by sequencename`)).rows
    result.security = (await admin.query(`select encode(sha256(convert_to(jsonb_build_object(
      'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind in ('r','p','S')),
      'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl) order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and a.attnum>0),
      'roles',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) order by rolname) from pg_roles),
      'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proacl,p.prosrc,p.proowner,p.prosecdef,p.proconfig) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
      'triggers',(select jsonb_agg(jsonb_build_array(t.oid,t.tgtype,t.tgenabled,t.tgfoid) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth')),
      'policies',(select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p))::text,'UTF8')),'hex') hash`)).rows[0].hash
    return result
  }
  async function session() {
    await ordinary.query('begin')
    await ordinary.query('set local role authenticated')
    // Same reserved synthetic AAL2 SQL fixtures as PROD.2; not a real MFA/browser proof.
    await ordinary.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
  }
  async function waitFor(predicate) {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await delay(20)
    }
    throw new Error('expected_observation_missing')
  }
  function child(args, env = process.env) {
    const processChild = spawn(process.execPath, ['scripts/maintenance/cli.js', ...args], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = ''
    processChild.stdout.on('data', chunk => { output += chunk })
    processChild.stderr.on('data', chunk => { errors += chunk })
    const done = once(processChild, 'exit').then(([code]) => ({ code, output, errors }))
    return { processChild, done, output: () => output }
  }
  const initial = await readFreeze(admin)
  assert.equal(initial.frozen, false, 'Never reopen a pre-existing freeze')
  await admin.query('select pg_advisory_lock(830011)')
  const before = await snapshot()
  mkdirSync('.cache/prod3', { recursive: true })
  writeFileSync('.cache/prod3/before.json', JSON.stringify(before, null, 2))
  try {
    await ordinary.connect()
    await install(admin)
    installed = true
    await admin.query('insert into public.user_preferences(user_id) values ($1)', [users[0]])
    const preflight = await run(command('preflight'))
    assert.equal(preflight.state.frozen, false)
    assert.equal(preflight.contract.migrations, 52)
    assert.equal(preflight.backup_authorized, false)
    pass('initial open, exact target, private controls and 52 migrations')

    // Local frontend harness, not Global Config or a real Vercel deployment.
    server = createServer(async (request, response) => {
      const result = httpClosed ? maintenanceResponse(new Request('http://localhost' + request.url, { method: request.method }))
        : new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } })
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(request.method === 'HEAD' ? '' : await result.text())
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    origin = `http://127.0.0.1:${server.address().port}`
    assert.equal((await observeHttp(origin, ['/', '/dashboard'], 'open')).sampled_HTTP_verified, true)

    await assert.rejects(run({ ...command('close', initial.revision), systemId: '1' }), { message: 'unexpected_postgresql_system' })
    for (const configured of ['postgresql://authenticator:secret@127.0.0.1:55322/postgres',
      'postgresql://service_role:secret@127.0.0.1:55322/postgres', 'postgresql://postgres:secret@remote.invalid:55322/postgres']) {
      const result = await child(['--command', 'preflight', ...target], { ...process.env, MY_MAINTENANCE_DATABASE_URL: configured }).done
      assert.equal(result.code, 1)
      assert.ok(!result.output.includes('secret'))
      assert.equal(result.errors, '')
    }
    await assert.rejects(verifyContract(ordinary), error => safeDiagnostic(error) === 'postgresql_permissions_insufficient')
    pass('unexpected system, remote URL, wrong operators and insufficient SQL rights refused')

    await session()
    const priorReceipt = (await ordinary.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3) result",
      [parent(), item(1), operation(991)])).rows[0].result
    await ordinary.query('commit')
    const revision = (await readFreeze(admin)).revision
    httpClosed = true // Explicit frontend first; ordinary in-flight writer still needs draining.
    assert.equal((await observeHttp(origin, ['/', '/dashboard', '/assets/example.js'], 'closed')).sampled_HTTP_verified, true)
    await session()
    await ordinary.query('update public.user_preferences set binder_default_format=binder_default_format where user_id=$1', [users[0]])
    const phases = []
    const closing = pending(run(command('close', revision), event => phases.push(event)))
    await waitFor(async () => (await observe(admin)).admission_locks.some(l => l.mode === 'ExclusiveLock' && !l.granted))
    const observed = await observe(admin)
    assert.ok(observed.admission_locks.some(l => l.mode === 'ShareLock' && l.granted))
    assert.ok(observed.admission_locks.some(l => l.mode === 'ExclusiveLock' && !l.granted && l.blockers.length))
    assert.equal((await readFreeze(admin)).frozen, false)
    assert.ok(!phases.some(e => e.recorded === 'commit_acknowledged'))
    await assert.rejects(run(command('verify-closed', revision, ['--timeout-ms', '100'])), error => error.code === '57014')
    await ordinary.query('commit')
    const closed = await closing
    assert.ok(!closed.error, safeDiagnostic(closed.error))
    assert.equal(closed.result.verified, true)
    assert.equal(closed.result.independent_read, true)
    assert.deepEqual(phases.map(e => e.recorded), ['unknown', 'provisional_before_commit', 'commit_acknowledged'])
    assert.equal(closed.result.state.revision, (BigInt(revision) + 1n).toString())
    pass('ordinary in-flight commit delays closure; lock evidence replaces arbitrary sleep; independent committed read')

    const attestation = await bound('verify-closed')
    assert.equal(attestation.ordinary_writes, 'closed_and_drained')
    assert.equal(attestation.backup_authorized, false)
    assert.equal(attestation.global_closure, 'not_attested')
    const completedClose = await child(['--command', 'close', ...target, '--expect-system-id', identity.system_id,
      '--expect-revision', (await readFreeze(admin)).revision]).done
    assert.equal(completedClose.code, 0)
    assert.equal(completedClose.errors, '')
    assert.equal(JSON.parse(completedClose.output.trim().split('\n').at(-1)).verified, true)
    assert.equal((await readFreeze(admin)).frozen, true, 'Successful CLI terminal exit never reopens')
    await session()
    const read = await ordinary.query('select public.get_collection_content_v2($1) content', [parent()])
    assert.ok(read.rows[0].content)
    const recovered = (await ordinary.query('select public.get_collection_operation_result($1,$2) result',
      [parent(), operation(991)])).rows[0].result
    assert.deepEqual(recovered, priorReceipt)
    await assert.rejects(ordinary.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3)", [parent(), item(1), operation(990)]), { code: 'PT503' })
    await ordinary.query('rollback')
    pass('authenticated/service_role statement writes and Phase 8 RPC refused; reader retained; no Production backup attestation')

    // Failure injections are transaction-local. No committed trigger/ACL/state change.
    await admin.query('begin')
    await admin.query('delete from private.business_write_freeze')
    await assert.rejects(readFreeze(admin), { code: 'PT503' })
    await admin.query('rollback')
    await admin.query('begin')
    await admin.query('create table private.prod3_uncovered_probe(id integer)')
    await assert.rejects(verifyContract(admin), { message: 'table_guards_incomplete' })
    await admin.query('rollback')
    await admin.query('begin')
    await admin.query('grant execute on function private.get_business_write_freeze() to authenticated')
    await assert.rejects(verifyContract(admin), { message: 'permissions_incomplete' })
    await admin.query('rollback')
    await admin.query('begin')
    await admin.query("create or replace function private.is_super_admin() returns boolean language sql stable security definer set search_path='' as $$select true$$")
    await assert.rejects(verifyContract(admin), { message: 'function_contract_incomplete' })
    await admin.query('rollback')
    await admin.query('begin')
    await admin.query('grant select on private.app_role_assignments to authenticated')
    await assert.rejects(verifyContract(admin), { message: 'permissions_incomplete' })
    await admin.query('rollback')
    pass('missing state, uncovered table, altered role predicate and broadened freeze/role permissions rejected; injections rolled back')

    // A setter return in another uncommitted transaction cannot attest a new state.
    const provisional = await connectOperator(connection)
    try {
      await provisional.client.query('begin')
      await provisional.client.query('select private.set_business_write_freeze(false)::text')
      assert.equal((await readFreeze(provisional.client)).frozen, false)
      assert.equal((await readFreeze(admin)).frozen, true)
      await assert.rejects(bound('verify-closed', ['--timeout-ms', '100']), error => error.code === '57014')
      await provisional.client.query('rollback')
    } finally { await provisional.client.end() }
    assert.equal((await readFreeze(admin)).frozen, true)
    pass('provisional setter return is not committed closure/reopening evidence')

    await admin.query('begin')
    await admin.query('select pg_advisory_xact_lock_shared(771403)')
    await assert.rejects(bound('verify-closed'), { message: 'drainage_uncertain_inspect_observe' })
    await assert.rejects(bound('reopen', ['--authorize-reopen', '--timeout-ms', '100']), error => error.code === '57014')
    const interruptRevision = (await readFreeze(admin)).revision
    const interrupted = child(['--command', 'reopen', ...target, '--expect-system-id', identity.system_id,
      '--expect-revision', interruptRevision, '--authorize-reopen'])
    await waitFor(async () => (await observe(admin)).admission_locks.some(l => l.mode === 'ExclusiveLock' && !l.granted))
    interrupted.processChild.kill('SIGTERM')
    await interrupted.done
    await admin.query('rollback')
    assert.equal((await readFreeze(admin)).frozen, true)
    assert.equal((await readFreeze(admin)).revision, interruptRevision)
    const failed = await child(['--command', 'verify-closed', ...target, '--expect-system-id', identity.system_id,
      '--expect-revision', '0']).done
    assert.equal(failed.code, 1)
    assert.equal(JSON.parse(failed.output).backup_authorized, false)
    assert.equal((await readFreeze(admin)).frozen, true)
    pass('uncertain drain, timeout, terminal interruption and stale revision never reopen')

    const refused = child(['--command', 'preflight', ...target], { ...process.env,
      MY_MAINTENANCE_DATABASE_URL: 'postgresql://postgres:prod3-not-a-password@127.0.0.1:55322/postgres' })
    const unavailable = await refused.done
    assert.equal(unavailable.code, 1)
    assert.ok(!unavailable.output.includes('prod3-not-a-password'))
    assert.equal((await readFreeze(admin)).frozen, true)
    pass('connection failure sanitized and persistent closure retained')

    assert.equal((await observeHttp(origin, ['/', '/dashboard', '/assets/example.js'], 'closed')).sampled_HTTP_verified, true)
    assert.equal((await observeHttp(origin, ['/'], 'open')).sampled_HTTP_verified, false)
    pass('real Local HTTP GET/HEAD stays closed through failures; incompatible state rejected; no Vercel claim')

    await assert.rejects(run(command('reopen', '0', ['--authorize-reopen'])), { message: 'freeze_revision_changed' })
    const reopened = await bound('reopen', ['--authorize-reopen'])
    assert.equal(reopened.state.frozen, false)
    assert.equal(reopened.independent_read, true)
    const resumed = await bound('verify-open')
    assert.equal(resumed.ordinary_writes, 'open_zero_row_probe_verified')
    await session()
    await ordinary.query("update public.user_preferences set binder_default_format='2x2' where user_id=$1", [users[0]])
    await ordinary.query('commit')
    await session()
    assert.equal((await ordinary.query('select binder_default_format from public.user_preferences where user_id=$1', [users[0]])).rows[0].binder_default_format, '2x2')
    await ordinary.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3)", [parent(), item(1), operation(990)])
    await ordinary.query('commit')
    await session()
    const replay = (await ordinary.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3) result",
      [parent(), item(1), operation(991)])).rows[0].result
    assert.deepEqual(replay, priorReceipt)
    await ordinary.query('commit')
    httpClosed = false // Explicit frontend last, after backend independent read and legitimate write.
    assert.equal((await observeHttp(origin, ['/', '/dashboard'], 'open')).sampled_HTTP_verified, true)
    pass('explicit authorized reopening, fresh read, legitimate persisted write and same Phase 8 operation resume')
  } finally {
    await ordinary.query('rollback').catch(() => undefined)
    await admin.query('rollback').catch(() => undefined)
    if (installed) await cleanup(admin) // Exact reserved fixtures only; never toggle freeze in cleanup.
    await ordinary.end().catch(() => undefined)
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    const after = await snapshot()
    writeFileSync('.cache/prod3/after.json', JSON.stringify(after, null, 2))
    const finalState = await readFreeze(admin)
    await admin.end()
    assert.deepEqual(after, before, 'Personal/catalogue/Auth data, sequences and security must be identical')
    console.log(JSON.stringify({ scenarios, data_sequences_security_identical: true, final_frozen: finalState.frozen,
      final_revision: finalState.revision, Cloud_verified: false, backup_authorized: false }))
  }
}

await main().catch(error => {
  console.error(JSON.stringify({ outcome: 'local_test_failed', diagnostic: safeDiagnostic(error), backup_authorized: false,
    next: 'inspect_preflight_no_automatic_reopen' }))
  process.exit(1) // Close only test sockets. A failed rehearsal never reopens the persistent state.
})
