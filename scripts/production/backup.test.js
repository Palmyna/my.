import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { runBackup } from './backup.js'
import { loadSession, exists, lockSession } from './session.js'
import { configurationBundle, configSchema, outsideFile } from './config.js'
import { safeDiagnostic, readDrainage } from './cli.js'
import { BackupError } from '../backup/contract.js'
import pg from 'pg'

const project = 'xvtiwhxvtfxvvokquttu'
const revision = '9007199254740997'
const head = 'a'.repeat(40)
const verification = { outcome: 'capture_integrity_verified', restore_proven: false, publication_authorized: false }
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real HTTP forbidden in AUTO.3 tests') })
  t.mock.method(pg.Client.prototype, 'connect', () => { throw new Error('Real PostgreSQL forbidden in AUTO.3 tests') })
})

async function fixture(t, { maintenance = false, frozen = false } = {}) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'my-auto3-test-'))
  t.after(async () => {
    assert.equal(resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/') + 'my-auto3-test-'), true)
    await fs.rm(directory, { recursive: true, force: true })
  })
  const sessions = join(directory, 'sessions'), backups = join(directory, 'backups')
  await fs.mkdir(sessions); await fs.mkdir(backups)
  const target = { environment: 'cloud', project, system_id: '12345678901234567890' }
  const bundle = { config: { sessions_directory: sessions, project, encrypted_volume_evidence: 'synthetic.volume' },
    fingerprint: 'b'.repeat(64), target, external: {}, baseEvidence: {
      format: 'my-backup-evidence-v1', auth_consistency: 'postgresql_snapshot_external_keys_separate_sessions_reauth_required',
      storage_and_vault_expected_empty: true, storage_configuration_evidence: 'synthetic.storage',
      protected_storage_evidence: 'synthetic.acl', unsynchronized_destination: true, key_saved_separately_evidence: 'synthetic.key',
    } }
  const calls = [], messages = [], manifests = new Map()
  const controller = new AbortController()
  const state = { maintenance, frozen, revision, checkpoint: 'c'.repeat(64), vercelWrites: 0, freezeWrites: 0, capture: 0, verify: 0 }
  const repository = { head, version: '0.8.33', branch: 'dev', dirty: false, project, environment: 'cloud' }
  const vercelRead = () => ({ verified: true, control_plane_confirmed: true,
    state: { maintenance_production: state.maintenance }, checkpoint: state.checkpoint, observed_at: new Date().toISOString() })
  const freezeRead = () => ({ identity: { system_id: target.system_id }, state: { frozen: state.frozen, revision: state.revision } })
  const io = { progress: value => messages.push(value), confirm: async kind => { calls.push(`consent:${kind}`); return true },
    attest: async () => ({ deployment_id: 'dpl_Synthetic', http_checked_at: new Date().toISOString(), authenticated_http_503: true,
      propagation_and_coverage: true, ordinary_api_refusals: true, privileged_writers_excluded_until_end: true,
      ddl_roles_configuration_excluded_until_end: true }) }
  const api = { signal: controller.signal, backupRoot: backups, lockDirectory: join(directory, 'locks'),
    repository: () => ({ ...repository }), checkConfiguration() {}, prepare: async () => calls.push('prepare'),
    vercel: () => ({ preflight: async () => { calls.push('vercel:preflight'); return vercelRead() },
      setMaintenance: async (action, consent) => {
        calls.push(`vercel:${action}`)
        assert.equal(action, 'close'); assert.equal(consent.authorizeClose, true)
        assert.equal(consent.exclusiveWriter, true); assert.equal(consent.checkpoint, state.checkpoint)
        if (!state.maintenance) { state.vercelWrites++; state.maintenance = true; state.checkpoint = 'd'.repeat(64) }
        return vercelRead()
      } }),
    freeze: async (command, expected) => {
      calls.push(`freeze:${command}`)
      if (command !== 'preflight') assert.equal(expected, state.revision)
      if (command === 'close' && !state.frozen) { state.freezeWrites++; state.frozen = true; state.revision = (BigInt(state.revision) + 1n).toString() }
      return { ...freezeRead(), verified: true, independent_read: true }
    },
    drainage: async expected => { calls.push('technical:drainage'); assert.equal(expected, state.revision); return freezeRead() },
    capture: async (evidence, dest) => {
      calls.push('engine:capture'); state.capture++
      await fs.mkdir(dest) // Existing destinations fail like PROD.4.
      await fs.writeFile(join(dest, 'INCOMPLETE'), 'synthetic')
      const manifest = { environment: 'cloud', project, target, identity: { system_id: target.system_id }, repository: { ...repository } }
      manifests.set(dest, { manifest, evidence, verification, manifest_sha256: 'e'.repeat(64) })
      await fs.writeFile(join(dest, 'manifest.myb'), 'synthetic encrypted archive reference')
      await fs.unlink(join(dest, 'INCOMPLETE'))
      return verification
    },
    verify: async dest => { calls.push('engine:verify'); state.verify++; assert.equal(await exists(join(dest, 'INCOMPLETE')), false); return structuredClone(manifests.get(dest)) },
  }
  return { directory, sessions, backups, bundle, api, io, calls, messages, state, controller, manifests, repository }
}

for (const [maintenance, frozen] of [[false, false], [true, true], [true, false], [false, true]]) {
  test(`close sequence and exact idempotence: maintenance=${maintenance}, frozen=${frozen}`, async t => {
    const f = await fixture(t, { maintenance, frozen })
    const result = await runBackup(f.bundle, f.io, f.api)
    assert.equal(result.verify, 'complete'); assert.equal(result.restore_proven, false)
    assert.equal(result.publication_authorized, false)
    assert.equal(f.state.vercelWrites, maintenance ? 0 : 1)
    assert.equal(f.state.freezeWrites, frozen ? 0 : 1)
    assert.equal(f.state.revision, frozen ? revision : (BigInt(revision) + 1n).toString())
    assert.ok(f.calls.indexOf('vercel:close') < f.calls.indexOf('freeze:close'))
    assert.ok(f.calls.indexOf('technical:drainage') < f.calls.indexOf('engine:capture'))
    assert.ok(f.calls.indexOf('engine:capture') < f.calls.indexOf('engine:verify'))
    const { session } = await loadSession(f.sessions)
    assert.equal(session.stage, 'verified'); assert.equal(session.attempts.length, 1)
    assert.equal(session.attempts[0].manifest_sha256, 'e'.repeat(64))
    assert.ok(session.records.some(r => r.provenance === 'operator_declaration_not_automatic_measurement'))
  })
}

for (const refused of ['connect', 'close', 'export']) {
  test(`missing ${refused} authorization stops dependent work`, async t => {
    const f = await fixture(t)
    f.io.confirm = async kind => kind !== refused
    await assert.rejects(runBackup(f.bundle, f.io, f.api), /explicit_authorization_missing/)
    assert.equal(f.state.capture, 0)
    if (refused === 'connect') assert.equal(f.calls.some(c => c.startsWith('vercel:') || c.startsWith('freeze:')), false)
    if (refused === 'close') { assert.equal(f.state.maintenance, false); assert.equal(f.state.frozen, false) }
    if (refused === 'export') { assert.equal(f.state.maintenance, true); assert.equal(f.state.frozen, true) }
  })
}

for (const failure of ['vercel', 'supabase', 'reread', 'drainage', 'attestation', 'source', 'configuration']) {
  test(`${failure} failure refuses capture and never reopens`, async t => {
    const f = await fixture(t)
    const originalFreeze = f.api.freeze
    if (failure === 'vercel') f.api.vercel = () => ({ preflight: async () => ({ control_plane_confirmed: true, checkpoint: 'c'.repeat(64) }), setMaintenance: async () => { throw new Error('synthetic') } })
    if (failure === 'supabase') f.api.freeze = async (...args) => { if (args[0] === 'close') throw new Error('synthetic'); return originalFreeze(...args) }
    if (failure === 'reread') f.api.freeze = async (...args) => { const r = await originalFreeze(...args); if (args[0] === 'verify-closed') r.state.revision = '3'; return r }
    if (failure === 'drainage') f.api.drainage = async () => { throw new BackupError('ordinary_drainage_uncertain') }
    if (failure === 'attestation') f.io.attest = async () => ({ authenticated_http_503: false })
    if (failure === 'source') f.repository.dirty = true
    if (failure === 'configuration') f.api.checkConfiguration = () => { throw new Error('changed') }
    await assert.rejects(runBackup(f.bundle, f.io, f.api))
    assert.equal(f.state.capture, 0)
    assert.equal(f.calls.some(c => /reopen|restore/.test(c)), false)
    if (['supabase', 'reread', 'drainage', 'attestation'].includes(failure)) assert.equal(f.state.maintenance, true)
  })
}

for (const reason of ['failure', 'timeout', 'interruption']) {
  test(`capture ${reason}: incomplete retained, distinct destination on explicit resume`, async t => {
    const f = await fixture(t)
    const actualCapture = f.api.capture
    f.api.capture = async (_e, dir) => {
      await fs.mkdir(dir); await fs.writeFile(join(dir, 'INCOMPLETE'), 'synthetic')
      if (reason === 'interruption') f.controller.abort()
      if (reason === 'timeout') throw new BackupError('postgresql_tool_timeout')
      throw new Error(`SYNTHETIC_PASSWORD_${reason}`)
    }
    await assert.rejects(runBackup(f.bundle, f.io, f.api))
    let { session } = await loadSession(f.sessions)
    const abandoned = session.attempts[0].directory
    assert.equal(session.attempts[0].capture, 'failed_or_unknown')
    assert.equal(session.attempts[0].verify, 'not_started')
    assert.equal(f.state.maintenance, true); assert.equal(f.state.frozen, true)
    const serialized = await fs.readFile(join(f.sessions, session.id, 'session.json'), 'utf8')
    assert.equal(serialized.includes('SYNTHETIC_PASSWORD'), false)
    if (reason === 'interruption') {
      assert.equal(await exists(join(f.api.lockDirectory, 'prod-backup.lock')), true)
      // Explicit test operator review of this exact synthetic marker only.
      await fs.unlink(join(f.api.lockDirectory, 'prod-backup.lock'))
      f.api.signal = new AbortController().signal
    }
    f.api.capture = actualCapture
    const result = await runBackup(f.bundle, f.io, f.api)
    assert.notEqual(result.backup, abandoned)
    assert.equal(await exists(join(abandoned, 'INCOMPLETE')), true)
    session = (await loadSession(f.sessions)).session
    assert.equal(session.attempts.length, 2); assert.equal(session.attempts[0].capture, 'incomplete_not_reused')
    assert.equal(f.state.freezeWrites, 1); assert.equal(f.state.vercelWrites, 1)
    assert.ok(f.calls.includes('consent:resume'))
  })
}

test('independent verify failure resumes same complete archive without capture or export consent', async t => {
  const f = await fixture(t), actualVerify = f.api.verify
  f.api.verify = async () => { throw new Error('SYNTHETIC_TOKEN') }
  await assert.rejects(runBackup(f.bundle, f.io, f.api))
  const { session } = await loadSession(f.sessions)
  assert.equal(session.attempts[0].capture, 'complete'); assert.equal(session.attempts[0].verify, 'failed_or_unknown')
  f.api.verify = actualVerify
  f.calls.length = 0
  f.io.attest = () => { throw new Error('Completed capture must not repeat closure attestation') }
  const result = await runBackup(f.bundle, f.io, f.api)
  assert.equal(result.reused, true); assert.equal(f.state.capture, 1)
  assert.equal(f.calls.includes('consent:export'), false)
  assert.equal(f.calls.includes('consent:close'), false)
})

test('source changed during operator export consent blocks capture', async t => {
  const f = await fixture(t), confirm = f.io.confirm
  f.io.confirm = async (...args) => { if (args[0] === 'export') f.repository.head = 'f'.repeat(40); return confirm(...args) }
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /source_changed_before_capture/)
  assert.equal(f.state.capture, 0); assert.equal(f.state.maintenance, true); assert.equal(f.state.frozen, true)
})

test('configuration changed during operator export consent blocks capture', async t => {
  const f = await fixture(t), confirm = f.io.confirm
  let changed = false
  f.io.confirm = async (...args) => { if (args[0] === 'export') changed = true; return confirm(...args) }
  f.api.checkConfiguration = () => { if (changed) throw new Error('changed configuration') }
  await assert.rejects(runBackup(f.bundle, f.io, f.api))
  assert.equal(f.state.capture, 0); assert.equal(f.state.maintenance, true); assert.equal(f.state.frozen, true)
})

test('maintenance change during capture prevents successful final result', async t => {
  const f = await fixture(t), capture = f.api.capture
  f.api.capture = async (...args) => { const result = await capture(...args); f.state.checkpoint = 'f'.repeat(64); return result }
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /maintenance_changed_during_capture/)
  const { session } = await loadSession(f.sessions)
  assert.equal(session.attempts[0].verify, 'failed_or_unknown')
  assert.equal(f.state.maintenance, true); assert.equal(f.state.frozen, true)
})

for (const http_checked_at of ['2000-01-01T00:00:00Z', '2999-01-01T00:00:00Z', 'unknown']) {
  test(`operator HTTP timestamp ${http_checked_at} never becomes contemporary proof`, async t => {
    const f = await fixture(t), attest = f.io.attest
    f.io.attest = async () => ({ ...await attest(), http_checked_at })
    await assert.rejects(runBackup(f.bundle, f.io, f.api), /closure_attestation_missing/)
    assert.equal(f.state.capture, 0)
  })
}

test('missing active pointer refuses a duplicate capture and preserves existing session', async t => {
  const f = await fixture(t)
  await runBackup(f.bundle, f.io, f.api)
  await fs.unlink(join(f.sessions, 'current.json'))
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /session_pointer_missing_review_required/)
  assert.equal(f.state.capture, 1)
})

test('missing referenced session proof blocks revalidation without duplicate capture', async t => {
  const f = await fixture(t)
  await runBackup(f.bundle, f.io, f.api)
  const { session, folder } = await loadSession(f.sessions)
  await fs.unlink(join(folder, `${session.records.find(r => r.kind === 'closure_attestation').id}.json`))
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /session_evidence_file_missing/)
  assert.equal(f.state.capture, 1)
})

test('lost capture acknowledgement recovers only through independent verify', async t => {
  const f = await fixture(t), actualCapture = f.api.capture
  f.api.capture = async (...args) => { await actualCapture(...args); throw new Error('lost acknowledgement') }
  await assert.rejects(runBackup(f.bundle, f.io, f.api))
  f.api.capture = actualCapture
  const result = await runBackup(f.bundle, f.io, f.api)
  assert.equal(f.state.capture, 1); assert.equal(result.capture, 'recovered_by_independent_verify')
})

test('validated session never duplicates backup, including after dev advances', async t => {
  const f = await fixture(t)
  const initial = await runBackup(f.bundle, f.io, f.api)
  f.repository.head = 'f'.repeat(40)
  f.calls.length = 0
  const again = await runBackup(f.bundle, f.io, f.api)
  assert.equal(initial.backup, again.backup); assert.equal(again.repository.head, head)
  assert.equal(f.state.capture, 1); assert.equal(f.state.verify, 2)
  assert.equal(f.calls.some(c => /:close|consent:export|consent:close/.test(c)), false)
})

test('completed session with reopened protection refuses any implicit reclosure', async t => {
  const f = await fixture(t)
  await runBackup(f.bundle, f.io, f.api)
  f.state.maintenance = false
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /maintenance_closure_unverified/)
  assert.equal(f.state.maintenance, false); assert.equal(f.state.capture, 1)
})

for (const tamper of ['revision', 'source', 'manifest', 'provenance']) {
  test(`archive ${tamper} mismatch refuses success without new capture`, async t => {
    const f = await fixture(t)
    const first = await runBackup(f.bundle, f.io, f.api)
    const proof = f.manifests.get(first.backup)
    if (tamper === 'revision') proof.evidence.freeze_revision = '42'
    if (tamper === 'source') proof.manifest.repository.head = 'f'.repeat(40)
    if (tamper === 'manifest') proof.manifest_sha256 = 'f'.repeat(64)
    if (tamper === 'provenance') proof.evidence.maintenance_evidence = 'unrelated.reference'
    await assert.rejects(runBackup(f.bundle, f.io, f.api), /archive_/)
    assert.equal(f.state.capture, 1)
  })
}

test('local lock never reclaimed by TTL/PID and another operator cannot enter', async t => {
  const f = await fixture(t)
  const release = await lockSession(f.api.lockDirectory)
  await assert.rejects(runBackup(f.bundle, f.io, f.api), /operator_busy_or_interrupted/)
  assert.equal(f.state.capture, 0); assert.equal(f.calls.includes('vercel:preflight'), false)
  await release()
})

for (const category of ['privileged', 'ordinary', 'unclassified', 'auth_internal', 'lock', 'prepared', 'changed_revision']) {
  test(`real PROD.4 drainage reader: ${category}`, async () => {
    const queries = []
    const client = { query: async sql => {
      queries.push(sql)
      if (sql.includes('get_business_write_freeze')) return { rows: [{ frozen: true, revision: category === 'changed_revision' ? '1' : revision, changed_at: new Date().toISOString(), changed_by: 'postgres' }] }
      if (sql.includes('pg_stat_activity')) return { rows: ['privileged', 'ordinary', 'unclassified', 'auth_internal'].includes(category) ? [{ category }] : [] }
      if (sql.includes('from pg_locks')) return { rows: category === 'lock' ? [{ granted: true }] : [] }
      if (sql.includes('pg_prepared_xacts')) return { rows: [{ count: category === 'prepared' ? '1' : '0', oldest: null }] }
      return { rows: [] }
    } }
    if (category === 'auth_internal') {
      const result = await readDrainage(client, revision)
      assert.equal(result.state.revision, revision)
      assert.equal(result.privileged_writer_exclusion, 'operator_declaration_required_not_proven_by_sample')
      assert.ok(queries.includes('select pg_advisory_xact_lock_shared(771403)'))
    } else await assert.rejects(readDrainage(client, revision))
  })
}

test('diagnostics suppress arbitrary secrets and strict config rejects implicit/extra targets', async () => {
  assert.equal(safeDiagnostic(new Error('SYNTHETIC_PASSWORD_TOKEN')), 'configuration_or_operation_failed_details_suppressed')
  assert.equal(configSchema.safeParse({}).success, false)
  assert.throws(() => outsideFile(fileURLToPath(new URL('../../package.json', import.meta.url))), /outside_git/)
})

test('configuration binds existing inventories, target identities and permanent volume provenance', async t => {
  const f = await fixture(t)
  const write = async (name, value) => { const file = join(f.directory, name); await fs.writeFile(file, JSON.stringify(value)); return file }
  const target = JSON.parse(await fs.readFile(new URL('../backup/examples/target.json', import.meta.url), 'utf8'))
  Object.assign(target, { project, environment: 'cloud', host: `db.${project}.supabase.co`, port: 5432,
    system_id: '12345678901234567890', ca_file: join(f.directory, 'root.crt'), ca_sha256: 'a'.repeat(64),
    client_image: `sha256:${'a'.repeat(64)}`, isolated_container: null })
  const maintenance = { format: 'my-maintenance-target-v1', environment: 'cloud', project, connection: 'direct',
    host: target.host, port: 5432, database: 'postgres', user: 'postgres', system_id: target.system_id, server_port: 5432,
    ca_file: target.ca_file, ca_sha256: target.ca_sha256 }
  const vercel = { format: 'my-vercel-maintenance-target-v1', environment: 'production', project: 'my', domain: 'my.collectrealm.com',
    project_id: 'prj_Synthetic', team_id: 'team_Synthetic', global_config_id: 'ecfg_Synthetic', global_config_slug: 'synthetic' }
  const external = JSON.parse((await fs.readFile(new URL('../backup/examples/external.json', import.meta.url), 'utf8')).replaceAll('REPLACE', 'synthetic'))
  external.project = project; external.configuration.edge.deployed_source_sha256 = 'a'.repeat(64)
  external.records = { synthetic: { test_only: true }, 'synthetic.volume': { volume_serial: '1234ABCD', encrypted_at_rest: true,
    unsynchronized_destination: true, provenance: 'operator_verified', recorded_at: new Date().toISOString() } }
  const config = { format: 'my-production-backup-v1', project,
    maintenance_target: await write('maintenance.json', maintenance), vercel_target: await write('vercel.json', vercel),
    backup_target: await write('target.json', target), evidence: await write('evidence.json', f.bundle.baseEvidence),
    external: await write('external.json', external), key_file: await write('key.dpapi', {}), sessions_directory: f.sessions,
    volume_serial: '1234ABCD', encrypted_volume_evidence: 'synthetic.volume' }
  const configFile = await write('production.json', config)
  const loaded = configurationBundle(configFile)
  assert.equal(loaded.target.system_id, target.system_id)
  maintenance.system_id = '2'; await write('maintenance.json', maintenance)
  assert.throws(() => configurationBundle(configFile), /targets_differ/)
  maintenance.system_id = target.system_id; await write('maintenance.json', maintenance)
  external.records['synthetic.volume'].encrypted_at_rest = false; await write('external.json', external)
  assert.throws(() => configurationBundle(configFile), /volume_operator_record_missing/)
})

test('DPAPI wrapper ProductionBackup exercised with masked synthetic secrets, no secret in argv/output', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  const quote = s => `'${s.replaceAll("'", "''")}'`
  const wrapper = fileURLToPath(new URL('../backup/secrets.ps1', import.meta.url))
  const key = Buffer.alloc(32, 7).toString('base64'), password = 'SYNTHETIC_DB_PASSWORD', token = 'SYNTHETIC_VERCEL_TOKEN'
  const runner = join(f.directory, 'wrapper.ps1'), keyFile = join(f.directory, 'key.dpapi')
  await fs.writeFile(runner, `$ErrorActionPreference='Stop'\n$k=ConvertTo-SecureString ${quote(key)} -AsPlainText -Force\nConvertFrom-SecureString $k | Set-Content -LiteralPath ${quote(keyFile)}\nfunction Read-Host { param($Prompt,[switch]$AsSecureString); if ($Prompt -match 'Vercel') { ConvertTo-SecureString ${quote(token)} -AsPlainText -Force } else { ConvertTo-SecureString ${quote(password)} -AsPlainText -Force } }\nfunction node { if ($env:MY_BACKUP_KEY -ne ${quote(key)} -or $env:MY_BACKUP_DATABASE_PASSWORD -ne ${quote(password)} -or $env:MY_VERCEL_MAINTENANCE_TOKEN -ne ${quote(token)}) { throw 'channel_missing' }; if (($args -join ' ') -match 'SYNTHETIC') { throw 'secret_in_arguments' }; $global:LASTEXITCODE=0; Write-Output 'synthetic_channels_verified' }\n& ${quote(wrapper)} -Action Run -KeyFile ${quote(keyFile)} -Tool ProductionBackup -BackupArgs @('--config','production.json')\nif ($env:MY_BACKUP_KEY -or $env:MY_BACKUP_DATABASE_PASSWORD -or $env:MY_VERCEL_MAINTENANCE_TOKEN) { throw 'secret_retained' }\n`)
  const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-File', runner], {
    windowsHide: true, env: { ...process.env, MY_BACKUP_KEY: '', MY_BACKUP_DATABASE_PASSWORD: '', MY_RESTORE_DATABASE_PASSWORD: '', MY_VERCEL_MAINTENANCE_TOKEN: '' },
  })
  assert.equal(stderr, ''); assert.match(stdout, /synthetic_channels_verified/)
  for (const secret of [key, password, token]) assert.equal(stdout.includes(secret), false)
})
