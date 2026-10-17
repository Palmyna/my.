import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fork, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createVercelMaintenance, decodeTarget, readTarget, safeDiagnostic, unknownResult,
  operatorLockPath, VercelMaintenanceError } from './vercel.js'
import { parseCommand, run } from './vercel-cli.js'

const token = 'synthetic-secret-DO-NOT-LOG'
const target = { format: 'my-vercel-maintenance-target-v1', environment: 'production', project: 'my',
  domain: 'my.collectrealm.com', project_id: 'prj_Test', team_id: 'team_Test',
  global_config_id: 'ecfg_Test', global_config_slug: 'my-maintenance' }
const baseArgs = ['--environment', 'production', '--project', 'my', '--authorize-vercel-connect']
const cli = fileURLToPath(new URL('./vercel-cli.js', import.meta.url))
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'my-auto2-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}
function environment(t, name, value) {
  const previous = process.env[name]
  process.env[name] = value
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous })
}
function fixture(t, value = true) {
  const directory = temporary(t)
  const state = { value, version: 1, preview: false, other: { confidential: token }, calls: [], patches: [] }
  const project = { id: target.project_id, name: 'my', accountId: target.team_id,
    ssoProtection: { deploymentType: 'all' }, env: [{ key: 'GLOBAL_CONFIG', target: ['production'],
      edgeConfigId: target.global_config_id, value: `https://global-config.vercel.com/${target.global_config_id}?token=${token}` }] }
  const domain = { name: target.domain, projectId: target.project_id, verified: true }
  const config = { id: target.global_config_id, ownerId: target.team_id, slug: target.global_config_slug }
  const reply = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  const fetchImpl = async (url, options) => {
    assert.equal(url.origin, 'https://api.vercel.com', 'test refuses every other network destination')
    assert.equal(url.search, '?teamId=team_Test')
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    state.calls.push({ path: url.pathname, method: options.method })
    await state.hook?.(url, options)
    if (options.method === 'PATCH') {
      assert.equal(url.pathname, '/v1/global-config/ecfg_Test/items')
      const body = JSON.parse(options.body)
      assert.deepEqual(body, { items: [{ operation: 'update', key: 'maintenance_production', value: body.items[0].value }] })
      assert.equal(typeof body.items[0].value, 'boolean')
      state.patches.push(body)
      state.value = body.items[0].value
      state.version++
      await state.afterPatch?.()
      return reply({ status: 'ok' })
    }
    assert.equal(options.method, 'GET')
    if (url.pathname === '/v9/projects/prj_Test') return reply(project)
    if (url.pathname === '/v9/projects/prj_Test/domains/my.collectrealm.com') return reply(domain)
    if (url.pathname === '/v1/global-config/ecfg_Test') return reply({ ...config, digest: `digest-${state.version}`, updatedAt: state.version })
    if (url.pathname === '/v1/global-config/ecfg_Test/items') return reply([
      { key: 'maintenance_production', value: state.value, edgeConfigId: target.global_config_id, createdAt: 1, updatedAt: state.version },
      { key: 'maintenance_preview', value: state.preview, edgeConfigId: target.global_config_id, createdAt: 1, updatedAt: 1 },
      { key: 'other', value: state.other, edgeConfigId: target.global_config_id, createdAt: 1, updatedAt: 1 },
    ])
    assert.fail(`unexpected test endpoint ${url.pathname}`)
  }
  const operator = createVercelMaintenance(target, token, { authorizeConnect: true, fetchImpl, lockDirectory: directory })
  const consent = async action => ({ checkpoint: (await operator.preflight()).checkpoint, exclusiveWriter: true,
    authorizeClose: action === 'close', authorizeReopen: action === 'reopen' })
  return { directory, state, project, domain, config, fetchImpl, operator, consent, reply }
}

test('strict explicit target, connection consent and distinct action authorizations', () => {
  const read = ['--command', 'preflight', ...baseArgs, '--target', 'external.json']
  assert.equal(parseCommand(read).command, 'preflight')
  for (const action of ['close', 'reopen']) {
    const valid = ['--command', action, ...baseArgs, '--target', 'external.json', '--expect-checkpoint', 'a'.repeat(64),
      '--confirm-exclusive-writer', `--authorize-${action}`]
    assert.equal(parseCommand(valid).command, action)
    for (const missing of ['--confirm-exclusive-writer', `--authorize-${action}`, '--authorize-vercel-connect']) {
      assert.throws(() => parseCommand(valid.filter(v => v !== missing)), VercelMaintenanceError)
    }
    assert.throws(() => parseCommand([...valid, `--authorize-${action === 'close' ? 'reopen' : 'close'}`]))
  }
  for (const args of [[...read, '--authorize-reopen'], [...read, '--confirm-exclusive-writer'], [...read, '--project', 'other'],
    [...read, '--token', token], [...read, '--timeout-ms', 'Infinity'], [...read, '--timeout-ms', '99'],
    read.map(v => v === 'production' ? 'preview' : v), read.map(v => v === 'my' ? 'other' : v)]) {
    assert.throws(() => parseCommand(args), VercelMaintenanceError)
  }
  assert.throws(() => createVercelMaintenance(target, token), { message: 'authorization_required' })
  for (const delta of [{ project: 'other' }, { domain: 'evil.invalid' }, { environment: 'preview' },
    { global_config_id: 'ecfg_Test/../evil' }, { token }, { key: 'maintenance_preview' }, { project_id: 'prj_REPLACE' }]) {
    assert.throws(() => decodeTarget({ ...target, ...delta }), VercelMaintenanceError)
  }
})

test('Global Config slug accepts the Vercel format and rejects malformed values', () => {
  for (const slug of ['my-maintenance', 'my_test', 'MyConfig1', 'config-2_test', '123', '_config', '-config', 'a'.repeat(64)]) {
    assert.equal(decodeTarget({ ...target, global_config_slug: slug }).global_config_slug, slug)
  }
  for (const slug of ['', 'my maintenance', ' my-maintenance', 'my-maintenance ', 'my.config', '../config',
    'my/config', 'my\\config', 'https://example.invalid', 'config?token=value', 'config#fragment', 'éconfig',
    'config\n', 'config\r', 'config\t', 'config\0', 'a'.repeat(65), 'REPLACE', 'my-REPLACE']) {
    assert.throws(() => decodeTarget({ ...target, global_config_slug: slug }), { message: 'target_invalid' })
  }
  for (const field of ['project_id', 'team_id', 'global_config_id']) {
    for (const value of ['', target[field] + '-suffix', target[field] + '/other', target[field] + ' ', 'REPLACE']) {
      assert.throws(() => decodeTarget({ ...target, [field]: value }), { message: 'target_invalid' })
    }
  }
})

test('target is outside repository, bounded, strict and without credentials', t => {
  const file = join(temporary(t), 'target.json')
  writeFileSync(file, JSON.stringify(target))
  assert.deepEqual(readTarget(file), target)
  for (const value of ['{', JSON.stringify({ ...target, token }), ' '.repeat(16_385)]) {
    writeFileSync(file, value)
    assert.throws(() => readTarget(file), VercelMaintenanceError)
  }
  assert.throws(() => readTarget('scripts/maintenance/examples/vercel-target.json'), VercelMaintenanceError)
  assert.throws(() => readTarget(fileURLToPath(new URL('./examples/vercel-target.json', import.meta.url))), VercelMaintenanceError)
})

for (const value of [true, false, 'false', null]) test(`read distinguishes ${JSON.stringify(value)}, with no HTTP/global proof`, async t => {
  const { operator, state } = fixture(t, value)
  const result = await operator.preflight()
  assert.equal(result.state.maintenance_production, typeof value === 'boolean' ? value : 'invalid')
  assert.equal(result.verified, typeof value === 'boolean')
  assert.equal(result.worldwide_propagation_verified, false)
  assert.equal(result.backup_authorized, false)
  assert.equal(result.global_closure, 'not_attested')
  assert.match(result.middleware_http, /not_observed/)
  assert.ok(!JSON.stringify(result).includes(token))
  assert.equal(state.patches.length, 0)
})

for (const action of ['close', 'reopen']) test(`${action} changes only Production, rereads, then resumes idempotently`, async t => {
  const { operator, state, consent, directory } = fixture(t, action === 'reopen')
  const events = []
  const first = await operator.setMaintenance(action, await consent(action), event => events.push(event))
  assert.equal(first.state.maintenance_production, action === 'close')
  assert.equal(first.changed, true)
  assert.equal(first.independent_read, true)
  assert.deepEqual(events.map(e => [e.recorded, e.verified]), [['unknown', false], ['api_acknowledged', false]])
  assert.equal(state.calls.at(-1).method, 'GET')
  const second = await operator.setMaintenance(action, await consent(action))
  assert.equal(second.idempotent, true)
  assert.equal(second.changed, false)
  assert.equal(state.version, 2)
  assert.equal(state.patches.length, 1)
  assert.equal(state.preview, false)
  assert.deepEqual(state.other, { confidential: token })
  assert.ok(!existsSync(operatorLockPath(target, directory)))
  assert.ok(!JSON.stringify([first, second, events]).includes(token))
})

test('direct engine cannot bypass action consent or exclusive writer condition', async t => {
  const { operator, state } = fixture(t)
  for (const action of ['close', 'reopen', 'anything']) {
    for (const consent of [{}, { checkpoint: 'a'.repeat(64), authorizeReopen: true },
      { checkpoint: 'a'.repeat(64), exclusiveWriter: true, authorizeReopen: true, authorizeClose: true }]) {
      await assert.rejects(operator.setMaintenance(action, consent), { message: 'authorization_required' })
    }
  }
  assert.equal(state.calls.length, 0)
})

for (const [name, mutate] of [
  ['project', f => { f.project.id = 'prj_Wrong' }], ['team', f => { f.project.accountId = 'team_Wrong' }],
  ['SSO', f => { f.project.ssoProtection.deploymentType = 'preview' }],
  ['binding', f => { f.project.env[0].edgeConfigId = 'ecfg_Wrong' }],
  ['binding absent', f => { delete f.project.env }], ['domain', f => { f.domain.projectId = 'prj_Wrong' }],
  ['domain redirect', f => { f.domain.redirect = 'evil.invalid' }], ['store', f => { f.config.ownerId = 'team_Wrong' }],
  ['store ID', f => { f.config.id = 'ecfg_Wrong' }], ['store slug', f => { f.config.slug = 'other-maintenance' }],
]) test(`wrong ${name} blocks before PATCH`, async t => {
  const f = fixture(t, false)
  const consent = await f.consent('close')
  mutate(f)
  await assert.rejects(f.operator.setMaintenance('close', consent), VercelMaintenanceError)
  assert.equal(f.state.patches.length, 0)
})

test('invalid value blocks reopening rather than repairing configuration', async t => {
  const f = fixture(t, 'false')
  const consent = await f.consent('reopen')
  await assert.rejects(f.operator.setMaintenance('reopen', consent), { message: 'maintenance_value_invalid' })
  assert.equal(f.state.patches.length, 0)
})

test('missing key is invalid; duplicate keys and mixed-store items are rejected', async t => {
  const f = fixture(t)
  for (const items of [[], [{ key: 'maintenance_production', value: true, edgeConfigId: 'ecfg_Wrong' }],
    Array(2).fill({ key: 'maintenance_production', value: true, edgeConfigId: 'ecfg_Test' })]) {
    const operator = createVercelMaintenance(target, token, { authorizeConnect: true, lockDirectory: f.directory,
      fetchImpl: (url, options) => url.pathname.endsWith('/items') ? f.reply(items) : f.fetchImpl(url, options) })
    if (items.length === 0) assert.equal((await operator.preflight()).state.maintenance_production, 'invalid')
    else await assert.rejects(operator.preflight(), { message: 'api_response_invalid' })
  }
})

test('invalid credentials and disabled TLS fail before any request', t => {
  const f = fixture(t)
  for (const invalid of [undefined, '', 'secret\nvalue', 'x'.repeat(4097)]) {
    assert.throws(() => createVercelMaintenance(target, invalid, { authorizeConnect: true }), { message: 'token_missing_or_invalid' })
  }
  environment(t, 'NODE_TLS_REJECT_UNAUTHORIZED', '0')
  assert.throws(() => createVercelMaintenance(target, token, { authorizeConnect: true }), { message: 'unsafe_tls_environment' })
  assert.equal(f.state.calls.length, 0)
})

for (const status of [401, 403]) test(`read API ${status} has fixed diagnostic and unknown state`, async t => {
  const f = fixture(t)
  const operator = createVercelMaintenance(target, token, { authorizeConnect: true, lockDirectory: f.directory,
    fetchImpl: async () => new Response(token, { status }) })
  await assert.rejects(operator.preflight(), error => {
    assert.equal(unknownResult(error).diagnostic, status === 401 ? 'authentication_failed' : 'permissions_insufficient')
    assert.ok(!JSON.stringify(unknownResult(error)).includes(token))
    return true
  })
})

for (const status of [401, 403, 409, 412, 429, 500, 302]) test(`API ${status}: fixed diagnostic, unknown state, no retries or leaked body`, async t => {
  const f = fixture(t, false)
  const consent = await f.consent('close')
  const operator = createVercelMaintenance(target, token, { authorizeConnect: true, lockDirectory: f.directory,
    fetchImpl: async (url, options) => options.method === 'PATCH' ? new Response(`secret ${token}`, { status }) : f.fetchImpl(url, options) })
  let failure
  try { await operator.setMaintenance('close', consent) } catch (error) { failure = unknownResult(error) }
  assert.equal(failure.state.maintenance_production, 'unknown')
  assert.equal(failure.verified, false)
  assert.ok(!JSON.stringify(failure).includes(token))
  assert.equal(f.state.patches.length, 0)
  assert.equal(existsSync(operatorLockPath(target, f.directory)), true)
  if (status === 401) assert.equal(failure.diagnostic, 'authentication_failed')
  if (status === 403) assert.equal(failure.diagnostic, 'permissions_insufficient')
})

test('network error and unreadable bodies are never exposed; unknown errors use fixed vocabulary', async t => {
  const f = fixture(t)
  for (const fetchImpl of [async () => { throw new Error(token) }, async () => new Response(token),
    async () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    async () => new Response('x'.repeat(2_097_153), { headers: { 'Content-Type': 'application/json' } })]) {
    const operator = createVercelMaintenance(target, token, { authorizeConnect: true, fetchImpl, lockDirectory: f.directory })
    await assert.rejects(operator.preflight(), error => !JSON.stringify(unknownResult(error)).includes(token))
  }
  assert.equal(safeDiagnostic(new VercelMaintenanceError(token)), 'network_or_timeout_state_unknown')
})

test('deadline covers stalled fetch and stalled response body', async t => {
  const directory = temporary(t)
  for (const fetchImpl of [() => new Promise(() => undefined), async () => new Response(new ReadableStream(),
    { headers: { 'Content-Type': 'application/json' } })]) {
    const operator = createVercelMaintenance(target, token, { authorizeConnect: true, fetchImpl, timeout: 100, lockDirectory: directory })
    await assert.rejects(operator.preflight(), { message: 'network_or_timeout_state_unknown' })
  }
})

test('stale checkpoint blocks even an already-satisfied action', async t => {
  const f = fixture(t)
  const consent = await f.consent('close')
  f.state.version++
  await assert.rejects(f.operator.setMaintenance('close', consent), { message: 'configuration_changed_fresh_read_required' })
  assert.equal(f.state.patches.length, 0)
})

test('configuration change during read or final pre-write read blocks', async t => {
  for (const duringWrite of [false, true]) {
    const f = fixture(t, false)
    const consent = await f.consent('close')
    let reads = 0
    f.state.hook = url => {
      if (url.pathname.endsWith('/items') && ++reads === (duringWrite ? 2 : 1)) f.state.version++
    }
    await assert.rejects(duringWrite ? f.operator.setMaintenance('close', consent) : f.operator.preflight(),
      { message: 'configuration_changed_fresh_read_required' })
    assert.equal(f.state.patches.length, 0)
  }
})

test('local concurrent operators cannot both mutate, even via different instances', async t => {
  const f = fixture(t, false)
  const consent = await f.consent('close')
  let entered
  const started = new Promise(resolve => { entered = resolve })
  let resume
  const pause = new Promise(resolve => { resume = resolve })
  let first = true
  f.state.hook = async () => { if (first) { first = false; entered(); await pause } }
  const pending = f.operator.setMaintenance('close', consent)
  await started
  const second = createVercelMaintenance({ ...target }, token, { authorizeConnect: true, fetchImpl: f.fetchImpl, lockDirectory: f.directory })
  await assert.rejects(second.setMaintenance('close', consent), { message: 'local_operator_busy_or_interrupted' })
  resume()
  await pending
  assert.equal(f.state.patches.length, 1)
})

for (const problem of ['contradictory', 'preview_changed', 'other_changed', 'reread_failed', 'lost_ack', 'timeout', 'abort']) {
  test(`after PATCH ${problem}: unknown, retained marker, no compensating toggle`, async t => {
    const f = fixture(t, false)
    const consent = await f.consent('close')
    const controller = new AbortController()
    f.state.afterPatch = () => {
      if (problem === 'contradictory') f.state.value = false
      if (problem === 'preview_changed') f.state.preview = true
      if (problem === 'other_changed') f.state.other.confidential = 'changed'
      if (problem === 'lost_ack') throw new Error(token)
      if (problem === 'timeout') return new Promise(() => undefined)
      if (problem === 'abort') controller.abort()
      if (problem === 'reread_failed') f.state.hook = () => { throw new Error(token) }
    }
    const operator = createVercelMaintenance(target, token, { authorizeConnect: true, fetchImpl: f.fetchImpl,
      lockDirectory: f.directory, timeout: 100, signal: controller.signal })
    await assert.rejects(operator.setMaintenance('close', consent), error => {
      assert.equal(unknownResult(error).state.maintenance_production, 'unknown')
      assert.ok(!JSON.stringify(unknownResult(error)).includes(token))
      return true
    })
    assert.equal(f.state.patches.length, 1)
    assert.equal(existsSync(operatorLockPath(target, f.directory)), true)
    const fresh = await f.operator.preflight().catch(() => undefined)
    if (problem === 'lost_ack') {
      assert.equal(fresh.state.maintenance_production, true)
      await assert.rejects(f.operator.setMaintenance('close', await f.consent('close')), { message: 'local_operator_busy_or_interrupted' })
      // Explicit recovery only after the synthetic writer has ended and state was read.
      rmSync(operatorLockPath(target, f.directory))
      assert.equal((await f.operator.setMaintenance('close', await f.consent('close'))).idempotent, true)
      assert.equal(f.state.patches.length, 1)
    }
  })
}

test('CLI consumes secret before Git, returns repository identity and no sensitive payload', async t => {
  const f = fixture(t)
  const file = join(f.directory, 'target.json')
  writeFileSync(file, JSON.stringify(target))
  t.mock.method(globalThis, 'fetch', f.fetchImpl)
  environment(t, 'MY_VERCEL_MAINTENANCE_TOKEN', token)
  environment(t, 'LOCALAPPDATA', f.directory)
  const result = await run(parseCommand(['--command', 'preflight', ...baseArgs, '--target', file]))
  assert.equal(process.env.MY_VERCEL_MAINTENANCE_TOKEN, undefined)
  assert.equal(result.repository.project, 'my')
  assert.equal(result.repository.environment, 'production')
  assert.ok(!JSON.stringify(result).includes(token))
})

// Child preload is test-only and denies all unrecognized endpoints before DNS.
// No CLI option can select this transport or a non-Vercel base URL.
function childMock(directory) {
  const mock = join(directory, 'mock.mjs')
  writeFileSync(mock, `
import { readFileSync, writeFileSync } from 'node:fs';
const file = ${JSON.stringify(join(directory, 'state.json'))};
process.on('message', message => { if (message === 'interrupt') process.emit('SIGINT'); });
globalThis.fetch = async (url, options) => {
  if (url.origin !== 'https://api.vercel.com' || url.search !== '?teamId=team_Test') throw Error('forbidden test endpoint');
  if (options.headers.Authorization !== 'Bearer ${token}') throw Error('test auth mismatch');
  const state = JSON.parse(readFileSync(file));
  let data;
  if (options.method === 'PATCH' && url.pathname === '/v1/global-config/ecfg_Test/items') {
    const body = JSON.parse(options.body);
    if (JSON.stringify(body) !== JSON.stringify({items:[{operation:'update',key:'maintenance_production',value:true}]})) throw Error('test write forbidden');
    state.items[0].value = true; state.items[0].updatedAt = 2; state.config.digest = 'digest-2'; state.config.updatedAt = 2;
    writeFileSync(file, JSON.stringify(state));
    process.send?.('applied');
    return new Promise(() => {});
  }
  if (options.method !== 'GET') throw Error('test method forbidden');
  if (url.pathname === '/v9/projects/prj_Test') data = state.project;
  else if (url.pathname === '/v9/projects/prj_Test/domains/my.collectrealm.com') data = state.domain;
  else if (url.pathname === '/v1/global-config/ecfg_Test') data = state.config;
  else if (url.pathname === '/v1/global-config/ecfg_Test/items') data = state.items;
  else throw Error('test path forbidden');
  return new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
};`)
  return mock
}

for (const forced of [false, true]) test(`actual CLI ${forced ? 'forced stop' : 'handled interruption'} after simulated apply retains recovery marker`, { timeout: 15_000 }, async t => {
  const f = fixture(t, false)
  const file = join(f.directory, 'target.json')
  writeFileSync(file, JSON.stringify(target))
  writeFileSync(join(f.directory, 'state.json'), JSON.stringify({ project: f.project, domain: f.domain,
    config: { ...f.config, digest: 'digest-1', updatedAt: 1 }, items: [
      { key: 'maintenance_production', value: false, edgeConfigId: 'ecfg_Test', createdAt: 1, updatedAt: 1 },
      { key: 'maintenance_preview', value: false, edgeConfigId: 'ecfg_Test', createdAt: 1, updatedAt: 1 },
    ] }))
  const checkpoint = (await f.operator.preflight()).checkpoint
  const child = fork(cli, ['--command', 'close', ...baseArgs, '--target', file, '--expect-checkpoint', checkpoint,
    '--authorize-close', '--confirm-exclusive-writer'], { silent: true, execArgv: ['--import', pathToFileURL(childMock(f.directory)).href],
    env: { ...process.env, MY_VERCEL_MAINTENANCE_TOKEN: token, LOCALAPPDATA: f.directory } })
  t.after(() => { if (child.exitCode === null) child.kill() })
  let output = '', errors = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { errors += data })
  child.on('message', message => { if (message === 'applied') { if (forced) child.kill(); else child.send('interrupt') } })
  const code = await new Promise(resolve => child.on('close', resolve))
  assert.equal(errors, '')
  assert.ok(!output.includes(token))
  const final = JSON.parse(output.trim().split('\n').at(-1))
  if (forced) {
    assert.notEqual(code, 0)
    assert.equal(final.recorded, 'unknown') // Force-stop cannot promise an exit handler ran.
  } else {
    assert.equal(code, 130, errors)
    assert.equal(final.outcome, 'interrupted')
    assert.equal(final.state.maintenance_production, 'unknown')
  }
  assert.equal(final.verified, false)
  assert.equal(existsSync(operatorLockPath(target, join(f.directory, 'MY', 'maintenance'))), true)
  assert.equal(JSON.parse(readFileSync(join(f.directory, 'state.json'))).items[0].value, true)
})

test('Windows protected-input wrapper exercised with synthetic token, no token in argv/output', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(t)
  const file = join(f.directory, 'target.json')
  writeFileSync(file, JSON.stringify(target))
  writeFileSync(join(f.directory, 'state.json'), JSON.stringify({ project: f.project, domain: f.domain,
    config: { ...f.config, digest: 'digest-1', updatedAt: 1 }, items: [
      { key: 'maintenance_production', value: true, edgeConfigId: 'ecfg_Test', createdAt: 1, updatedAt: 1 },
    ] }))
  const mock = childMock(f.directory)
  const runner = join(f.directory, 'wrapper-test.ps1')
  const wrapper = fileURLToPath(new URL('./vercel-secrets.ps1', import.meta.url))
  const quote = s => `'${s.replaceAll("'", "''")}'`
  writeFileSync(runner, `function Read-Host { param($Prompt, [switch]$AsSecureString); ConvertTo-SecureString ${quote(token)} -AsPlainText -Force }\n& ${quote(wrapper)} -VercelArgs @('--command','preflight',${baseArgs.map(quote).join(',')},'--target',${quote(file)})\nexit $LASTEXITCODE`)
  const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoLogo', '-NoProfile', '-File', runner], {
    windowsHide: true, env: { ...process.env, MY_VERCEL_MAINTENANCE_TOKEN: '', LOCALAPPDATA: f.directory,
      NODE_OPTIONS: `--import=${pathToFileURL(mock).href}` },
  })
  assert.equal(stderr, '')
  assert.ok(!stdout.includes(token))
  assert.equal(JSON.parse(stdout.trim()).state.maintenance_production, true)
})
