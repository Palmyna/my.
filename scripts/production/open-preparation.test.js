import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { prepareOpen } from './open-preparation.js'
import { createSession, saveSession, record, loadSession, exists, guardedSession } from './session.js'
import { ProductionError } from './config.js'
import { prepareChangelog, inspectRelease, githubReader } from './release.js'
import { readPublicationDatabase, openPreparationAPI } from './open-api.js'
import { createVercelMaintenance } from '../maintenance/vercel.js'
import { restrictDirectory, verifyPrivatePaths } from '../backup/secure-files.js'
import { fileHash } from '../backup/secure-files.js'
import { archiveFingerprint } from './archive.js'

const project = 'xvtiwhxvtfxvvokquttu', source = 'a'.repeat(40), merge = 'b'.repeat(40), digest = 'c'.repeat(64)
const revision = '9007199254740999'
const verification = { outcome: 'capture_integrity_verified', restore_proven: false, publication_authorized: false }
const vercelTarget = { format: 'my-vercel-maintenance-target-v1', environment: 'production', project: 'my',
  domain: 'my.collectrealm.com', project_id: 'prj_Test', team_id: 'team_Test', global_config_id: 'ecfg_Test', global_config_slug: 'my_test' }
const payload = { publication_key: 'my.release.0.8.33', category: 'changelog', app_version: '0.8.33',
  title: 'Version 0.8.33', body: 'Améliorations de MY.', action: { kind: 'notification_content' }, requires_action: false,
  include_new_users: false, expires_at: null, publication_context: { reason: 'Publication de la version.', include_new_users_justification: null } }
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real HTTP forbidden in AUTO.4A tests') })
  t.mock.method(pg.Client.prototype, 'connect', () => { throw new Error('Real PostgreSQL forbidden in AUTO.4A tests') })
})
async function temporary(t) {
  const folder = await fs.mkdtemp(join(tmpdir(), 'my-auto4a-'))
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/') + 'my-auto4a-'))
    await fs.rm(folder, { recursive: true, force: true })
  })
  return folder
}
async function fixture(t) {
  const root = await temporary(t), sessions = join(root, 'sessions'), backups = join(root, 'backups')
  await fs.mkdir(sessions); await fs.mkdir(backups)
  await restrictDirectory(sessions)
  const bundle = { config: { project, sessions_directory: sessions }, fingerprint: digest,
    target: { environment: 'cloud', project, database: 'postgres', system_id: '12345678901234567890' }, vercel: vercelTarget }
  const repository = { project, environment: 'cloud', branch: 'dev', dirty: false, head: source, version: '0.8.33' }
  const state = await createSession(sessions, repository, digest, project), { session, folder } = state
  const directory = join(backups, `backup-${randomUUID()}`)
  await fs.mkdir(directory)
  const freeze = await record(folder, session, 'freeze', 'AUTO1_commit_and_independent_read', {
    verified: true, independent_read: true, state: { frozen: true, revision } })
  const attestation = await record(folder, session, 'closure_attestation', 'operator_declaration_not_automatic_measurement', {
    authenticated_http_503: true, privileged_writers_excluded_until_end: true, ddl_roles_configuration_excluded_until_end: true,
    http_checked_at: new Date().toISOString() })
  const drainage = await record(folder, session, 'drainage', 'PROD4_requireClosed_fresh_TLS_transaction', { state: { frozen: true, revision } })
  const evidence = { freeze_revision: revision, maintenance_evidence: attestation.id, privileged_coordination_evidence: attestation.id,
    maintenance_checked_at: attestation.value.http_checked_at, freeze_committed_evidence: freeze.id, ordinary_writes_drained_evidence: drainage.id }
  await record(folder, session, 'capture_evidence', 'observations_and_explicit_operator_declarations', evidence)
  session.stage = 'verified'; session.freeze_revision = revision
  session.attempts.push({ id: randomUUID(), directory, capture: 'complete', verify: 'complete', freeze_revision: revision,
    manifest_sha256: digest, verified_at: new Date().toISOString() })
  await record(folder, session, 'verified_archive', 'PROD4_verify_independent_call', { directory, manifest_sha256: digest, verification })
  const archive = { verification: structuredClone(verification), manifest_sha256: digest, evidence, manifest: { environment: 'cloud', project,
    identity: { system_id: bundle.target.system_id }, target: bundle.target, repository } }
  const release = { source, merge, previous_main: 'd'.repeat(40), version: '0.8.33',
    migrations: [{ version: '20261015123024', name: 'prod7b22_superadmin_freeze', sha256: digest }],
    changelog: prepareChangelog(Buffer.from(JSON.stringify(payload)), '0.8.33', 'scripts/notifications/releases/0.8.33.json') }
  const remote = { github: { repository: 'Palmyna/my.', main: merge, merge, source, pull_request: 17 },
    maintenance: { identity: vercelTarget, verified: true, control_plane_confirmed: true, state: { maintenance_production: true }, checkpoint: digest },
    database: { identity: { system_id: bundle.target.system_id, session_user: 'postgres', database: 'postgres' },
      state: { frozen: true, revision }, migrations: release.migrations.map(({ version, name }) => ({ version, name })) },
    deployment: { identity: vercelTarget, deployment_id: 'dpl_Test', commit: merge, target: 'production', ready: true,
      domain_assignment: 'confirmed_by_fresh_alias_reads' } }
  const controller = new AbortController(), calls = []
  const read = key => async () => { calls.push(key); return structuredClone(remote[key]) }
  const api = { signal: controller.signal, backupRoot: backups, lockDirectory: join(root, 'locks'),
    checkConfiguration() {}, prepare: async () => {}, verify: async () => { calls.push('verify'); return structuredClone(archive) },
    github: read('github'), maintenance: read('maintenance'), database: read('database'), deployment: read('deployment'),
    release: async () => { calls.push('release'); return structuredClone(release) }, archiveHash: async () => digest }
  const io = { attachEvidence: async challenge => ({ format: 'my-production-open-evidence-v1', provenance: 'operator_verified',
    run_id: challenge.run_id, session_id: challenge.session_id, checkpoint: challenge.checkpoint, checked_at: new Date().toISOString(),
    reference: 'operator.control.17', domain: 'my.collectrealm.com', deployment_id: 'dpl_Test', served_commit: merge, served_version: '0.8.33',
    checks: { github_review_and_merge: true, supabase_deployment_logs_success: true, backend_compatibility: true,
      promoted_same_production_build_without_rebuild: true, served_version_and_commit: true,
      authenticated_GET_HEAD_503_headers_routes_assets: true, compatible_deployments_and_propagation: true,
      publication_recovery_prerequisites: true, no_backup_in_progress_and_privileged_writers_coordinated: true } }) }
  const input = { pull_request: 17, deployment_id: 'dpl_Test' }
  const run = () => prepareOpen(bundle, input, io, api)
  const changeSession = async mutate => { const current = await loadSession(sessions); mutate(current.session); await saveSession(folder, current.session) }
  return { root, sessions, folder, session, bundle, archive, release, remote, api, io, input, run, calls, controller, changeSession }
}

test('complete session: distinct merge SHA, fresh proof, pinned changelog and no mutation capabilities', async t => {
  const f = await fixture(t), result = await f.run()
  assert.equal(result.outcome, 'ready'); assert.notEqual(result.binding.source, result.binding.merge)
  assert.equal(result.publication_authorized, false); assert.equal(result.reopen_authorized, false)
  const { session } = await loadSession(f.sessions)
  assert.equal(session.stage, 'verified'); assert.equal(session.open_preparation.binding.changelog.content_hash, f.release.changelog.content_hash)
  assert.equal(session.records.filter(r => r.kind === 'open_operator_evidence').length, 1)
  for (const key of ['github', 'maintenance', 'database', 'deployment', 'release']) assert.equal(f.calls.filter(c => c === key).length, 2)
  assert.deepEqual(Object.keys(f.api).sort(), ['archiveHash','backupRoot','checkConfiguration','database','deployment','github','lockDirectory','maintenance','prepare','release','signal','verify'].sort())
})
for (const [name, mutate, diagnostic] of [
  ['incomplete', f => f.changeSession(s => { s.stage = 'capturing' }), 'session_incomplete'],
  ['archive hash', f => { f.archive.manifest_sha256 = 'f'.repeat(64) }, 'archive_session_binding_mismatch'],
  ['archive source', f => { f.archive.manifest.repository.head = merge }, 'archive_session_binding_mismatch'],
  ['archive verify', f => { f.archive.verification.outcome = 'unknown' }, 'independent_verify_failed'],
  ['archive revision', f => { f.archive.evidence.freeze_revision = '2' }, 'archive_session_binding_mismatch'],
  ['configuration', f => { f.bundle.fingerprint = 'f'.repeat(64) }, 'session_configuration_changed_review_required'],
  ['unexpected main', f => { f.remote.github.main = 'f'.repeat(40) }, 'github_source_or_main_unexpected'],
  ['wrong source', f => { f.remote.github.source = merge }, 'github_source_or_main_unexpected'],
  ['build not promoted', f => { f.remote.deployment.domain_assignment = 'unconfirmed' }, 'deployment_unexpected'],
  ['wrong deployed commit', f => { f.remote.deployment.commit = source }, 'deployment_unexpected'],
  ['migration missing', f => { f.remote.database.migrations = [] }, 'migration_history_unexpected'],
  ['migration unexpected', f => { f.remote.database.migrations.push({version:'29990101000000',name:'surprise'}) }, 'migration_history_unexpected'],
  ['wrong project', f => { f.remote.database.identity.system_id = '9' }, 'database_identity_unexpected'],
  ['freeze open', f => { f.remote.database.state.frozen = false }, 'freeze_prematurely_open_or_changed'],
  ['freeze revision', f => { f.remote.database.state.revision = '9007199254741000' }, 'freeze_prematurely_open_or_changed'],
  ['maintenance open', f => { f.remote.maintenance.state.maintenance_production = false }, 'maintenance_prematurely_open_or_unverified'],
  ['wrong delivered version', f => { f.release.version = '0.8.34' }, 'release_version_unexpected'],
]) test(`${name} blocks readiness`, async t => {
  const f = await fixture(t); await mutate(f)
  const result = await f.run()
  assert.equal(result.outcome, 'blocked'); assert.equal(result.diagnostic, diagnostic)
  assert.equal(result.reopen_authorized, false)
})

test('missing pointer/session and ambiguous second session are refused', async t => {
  const f = await fixture(t)
  await fs.unlink(join(f.sessions, 'current.json'))
  assert.equal((await f.run()).outcome, 'blocked')
  await fs.writeFile(join(f.sessions, 'current.json'), JSON.stringify({ id: f.session.id }))
  await fs.mkdir(join(f.sessions, randomUUID()))
  assert.equal((await f.run()).diagnostic, 'session_ambiguous')
  assert.deepEqual(f.calls, [])
  const empty = join(f.root, 'empty'); await fs.mkdir(empty); f.bundle.config.sessions_directory = empty
  assert.equal((await f.run()).diagnostic, 'session_missing')
})
test('record content hash detects same metadata with corrupted proof', async t => {
  const f = await fixture(t), ref = f.session.records[0], file = join(f.folder, `${ref.id}.json`)
  const entry = JSON.parse(await fs.readFile(file, 'utf8')); entry.value.verified = false
  await fs.writeFile(file, JSON.stringify(entry))
  assert.equal((await f.run()).diagnostic, 'session_evidence_hash_mismatch')
})
test('legacy AUTO.3 records without hashes still require authenticated archive binding', async t => {
  const f = await fixture(t)
  await f.changeSession(s => { s.records.forEach(r => { delete r.sha256 }) })
  assert.equal((await f.run()).outcome, 'ready')
})
test('missing operator proof is blocked; historical proof cannot validate another run', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = undefined
  assert.equal((await f.run()).diagnostic, 'operator_evidence_missing')
  let old
  f.io.attachEvidence = async c => { old = await attach(c); return old }
  assert.equal((await f.run()).outcome, 'ready')
  f.io.attachEvidence = async () => old
  assert.equal((await f.run()).diagnostic, 'operator_evidence_invalid_or_historical')
  f.io.attachEvidence = async c => ({ ...await attach(c), checked_at: '2000-01-01T00:00:00Z' })
  assert.equal((await f.run()).outcome, 'blocked')
})
test('ready on previous run never masks a newly open protection', async t => {
  const f = await fixture(t); assert.equal((await f.run()).outcome, 'ready')
  f.remote.maintenance.state.maintenance_production = false
  assert.equal((await f.run()).outcome, 'blocked')
  assert.equal((await loadSession(f.sessions)).session.open_preparation.outcome, 'blocked')
})
test('pinned file, key, raw fingerprint and normalized hash cannot drift on resume', async t => {
  const f = await fixture(t); assert.equal((await f.run()).outcome, 'ready')
  for (const field of ['file', 'publication_key', 'file_sha256', 'content_hash']) {
    const old = f.release.changelog[field]; f.release.changelog[field] = 'changed'
    assert.equal((await f.run()).diagnostic, 'release_binding_changed'); f.release.changelog[field] = old
  }
})
test('interruption retains exact shared lock; review then resume rechecks everything', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = async () => { f.controller.abort(); throw new Error('SECRET_TOKEN') }
  assert.equal((await f.run()).outcome, 'unknown')
  const lock = join(f.api.lockDirectory, 'prod-backup.lock')
  assert.equal(await exists(lock), true)
  f.api.signal = new AbortController().signal
  assert.equal((await f.run()).outcome, 'unknown')
  await fs.unlink(lock) // Exact synthetic marker, after explicit test review.
  f.io.attachEvidence = attach; f.calls.length = 0
  assert.equal((await f.run()).outcome, 'ready'); assert.ok(f.calls.includes('verify'))
  assert.equal((await fs.readFile(join(f.folder, 'session.json'), 'utf8')).includes('SECRET_TOKEN'), false)
})
test('concurrent caller cannot enter; external session edit never overwritten with ready', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = async c => {
    assert.equal((await f.run()).outcome, 'unknown')
    await f.changeSession(s => { s.external_edit = true })
    return attach(c)
  }
  assert.equal((await f.run()).outcome, 'unknown')
  const { session } = await loadSession(f.sessions)
  assert.equal(session.external_edit, true); assert.equal(session.open_preparation.outcome, 'unknown')
})
test('state change during operator checks and provider error never authorize opening or leak secrets', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = async c => { f.remote.maintenance.checkpoint = 'f'.repeat(64); return attach(c) }
  assert.equal((await f.run()).diagnostic, 'remote_state_changed_during_preparation')
  f.api.github = async () => { throw new Error('SECRET_PASSWORD_AND_TOKEN') }
  const result = await f.run()
  assert.equal(result.outcome, 'unknown')
  const files = await fs.readdir(f.folder)
  for (const file of files) assert.equal((await fs.readFile(join(f.folder, file), 'utf8')).includes('SECRET_PASSWORD_AND_TOKEN'), false)
})

test('PROD.6 validation, audience, expiration, normalization and raw file fingerprint', () => {
  const check = p => prepareChangelog(Buffer.from(JSON.stringify(p)), '0.8.33', 'release.json')
  for (const p of [{...payload, category:'announcement'}, {...payload, app_version:'0.8.34'},
    {...payload, include_new_users:true}, {...payload, expires_at:'2000-01-01T00:00:00Z'}, {...payload, body:'<script>'}]) assert.throws(() => check(p), ProductionError)
  const first = check(payload), reformatted = prepareChangelog(Buffer.from(JSON.stringify(payload,null,2)), '0.8.33', 'release.json')
  assert.equal(first.content_hash, reformatted.content_hash); assert.notEqual(first.file_sha256, reformatted.file_sha256)
})

test('real isolated Git graph: classic merge accepted; unexpected main/conflict/tree refused; missing changelog refused', async t => {
  const dir = await temporary(t)
  const git = args => execFileSync('git', args, {cwd:dir,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],
    env: {...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform === 'win32'?'NUL':'/dev/null'}}).trim()
  git(['init','-b','main']); git(['config','user.email','test@example.invalid']); git(['config','user.name','AUTO4A test'])
  git(['config','commit.gpgsign','false'])
  git(['remote','add','origin','https://github.com/Palmyna/my..git'])
  await fs.writeFile(join(dir,'package.json'),JSON.stringify({version:'0.8.33'}))
  await fs.writeFile(join(dir,'package-lock.json'),JSON.stringify({version:'0.8.33',packages:{'':{version:'0.8.33'}}}))
  await fs.mkdir(join(dir,'scripts/notifications/releases'),{recursive:true}); await fs.mkdir(join(dir,'supabase/migrations'),{recursive:true})
  await fs.writeFile(join(dir,'supabase/migrations/20261015123024_example.sql'),'select 1;')
  git(['add','.']); git(['commit','-m','base']); git(['switch','-c','dev'])
  await fs.writeFile(join(dir,'scripts/notifications/releases/0.8.33.json'),JSON.stringify(payload))
  git(['add','.']); git(['commit','-m','release']); let src = git(['rev-parse','HEAD'])
  git(['switch','main']); git(['merge','--no-ff','dev','-m','classic merge']); let merged = git(['rev-parse','HEAD'])
  assert.notEqual(src,merged); assert.equal(inspectRelease(src,merged,dir).version,'0.8.33')
  git(['switch','dev']); await fs.writeFile(join(dir,'delivered.txt'),'Next delivery without merging main into dev.')
  git(['add','.']); git(['commit','-m','next release']); src = git(['rev-parse','HEAD'])
  git(['switch','main']); git(['merge','--no-ff','dev','-m','next classic merge']); merged = git(['rev-parse','HEAD'])
  assert.equal(inspectRelease(src,merged,dir).version,'0.8.33')
  await fs.writeFile(join(dir,'scripts/notifications/releases/0.8.33.json'),JSON.stringify({...payload,body:'Changed.'}))
  assert.throws(()=>inspectRelease(src,merged,dir),/changelog_worktree_differs_from_release/)
  git(['add','.']); git(['commit','--amend','--no-edit']); const changed = git(['rev-parse','HEAD'])
  assert.throws(()=>inspectRelease(src,changed,dir),/git_production_tree_unexpected/)
  assert.throws(()=>inspectRelease(merged,changed,dir),/git_merge_source_unexpected/)
  git(['switch','dev']); await fs.unlink(join(dir,'scripts/notifications/releases/0.8.33.json'))
  git(['add','.']); git(['commit','-m','missing changelog']); const missing = git(['rev-parse','HEAD'])
  git(['switch','-c','missing-main',src]); git(['merge','--no-ff','dev','-m','missing merge'])
  assert.throws(()=>inspectRelease(missing,git(['rev-parse','HEAD']),dir),/changelog_committed_file_missing/)
})

test('GitHub adapter makes fixed GETs, observes merged dev->main, suppresses private response fields', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push(url); assert.equal(options.method,'GET'); assert.equal(options.redirect,'error'); assert.equal(options.cache,'no-store')
    assert.equal(options.headers['X-GitHub-Api-Version'],'2022-11-28')
    return Response.json(url.endsWith('/heads/main') ? {ref:'refs/heads/main',object:{type:'commit',sha:merge}} : {
      number:17,merged:true,state:'closed',merge_commit_sha:merge,head:{ref:'dev',sha:source,repo:{full_name:'Palmyna/my.'}},
      base:{ref:'main',repo:{full_name:'Palmyna/my.'}},body:'SECRET_PRIVATE_BODY'})
  }
  const read = githubReader('SECRET_TOKEN',{fetchImpl}), result = await read(17)
  assert.equal(result.main,merge); assert.equal(JSON.stringify(result).includes('SECRET'),false)
  assert.deepEqual(calls,['https://api.github.com/repos/Palmyna/my./git/ref/heads/main','https://api.github.com/repos/Palmyna/my./pulls/17'])
})

test('Vercel read-only alias/deployment adapter distinguishes READY from assignment and strips secrets', async () => {
  let assigned = true
  const fetchImpl = async (url, options) => {
    assert.equal(options.method,'GET'); assert.equal(url.origin,'https://api.vercel.com')
    const path = url.pathname
    const value = path === '/v9/projects/prj_Test' ? {id:'prj_Test',name:'my',accountId:'team_Test',ssoProtection:{deploymentType:'all'},
      env:[{key:'GLOBAL_CONFIG',target:['production'],edgeConfigId:'ecfg_Test',value:'SECRET_CONFIG'}]} :
      path.includes('/domains/') ? {name:vercelTarget.domain,projectId:'prj_Test',verified:true} :
      path.startsWith('/v4/aliases/') ? {alias:vercelTarget.domain,projectId:'prj_Test',deploymentId:assigned?'dpl_Test':'dpl_Other'} :
      {id:'dpl_Test',projectId:'prj_Test',target:'production',readyState:'READY',aliasAssigned:true,alias:[vercelTarget.domain],
        gitSource:{sha:merge,ref:'main'},env:{secret:'SECRET_VALUE'}}
    return Response.json(value)
  }
  const api = createVercelMaintenance(vercelTarget,'SECRET_TOKEN',{authorizeConnect:true,fetchImpl})
  const result = await api.publication('dpl_Test'); assert.equal(result.commit,merge)
  assert.equal(JSON.stringify(result).includes('SECRET'),false)
  assigned = false; await assert.rejects(api.publication('dpl_Test'),/production_deployment_unconfirmed/)
})

test('database read opens a read-only transaction and cleans up on contract error, no mutation SQL', async () => {
  const sql = []
  const client = {query:async text=>{ sql.push(text); if(text.includes('from pg_proc')) throw new Error('SECRET_DATABASE'); return {rows:[]} },end:async()=>sql.push('end')}
  await assert.rejects(readPublicationDatabase({}, {}, async()=>({client,identity:{}})),/SECRET_DATABASE/)
  assert.equal(sql[0],'begin isolation level repeatable read read only')
  assert.equal(sql.at(-2),'rollback'); assert.equal(sql.at(-1),'end')
  assert.equal(sql.some(s=>/^(insert|update|delete|alter|create|drop|grant|select private\.set)/i.test(s)),false)
  assert.throws(()=>openPreparationAPI({}, {}, {}),/read_connections_authorization_required/)
})

test('existing operator ACLs must remain private; no silent repair', async t => {
  const dir = await temporary(t)
  await restrictDirectory(dir)
  await verifyPrivatePaths([dir])
  if (process.platform === 'win32') execFileSync('icacls',[dir,'/grant','*S-1-1-0:(R)'],{windowsHide:true,stdio:'pipe'})
  else await fs.chmod(dir,0o755)
  await assert.rejects(verifyPrivatePaths([dir]),/operator_storage_permissions_unverified/)
})

test('last archive check hashes every encrypted file, refusing tampering and INCOMPLETE', async t => {
  const dir = await temporary(t)
  await fs.writeFile(join(dir,'manifest.myb'),'opaque manifest')
  await fs.writeFile(join(dir,'database.dump.myb'),'opaque database')
  const manifest = {files:[{name:'database.dump.myb',...await fileHash(join(dir,'database.dump.myb'))}]}
  assert.equal(await archiveFingerprint(dir,manifest),(await fileHash(join(dir,'manifest.myb'))).sha256)
  await fs.writeFile(join(dir,'database.dump.myb'),'altered database')
  await assert.rejects(archiveFingerprint(dir,manifest),/archive_changed_during_verify/)
  await fs.writeFile(join(dir,'INCOMPLETE'),'incomplete')
  await assert.rejects(archiveFingerprint(dir,manifest),/archive_incomplete/)
  await assert.rejects(archiveFingerprint(dir,{files:[{...manifest.files[0],name:'../outside.myb'}]}),/archive_session_binding_mismatch/)
})

test('lock modification and ACL widening during evidence checks yield unknown, never ready', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = async c => {
    await fs.writeFile(join(f.api.lockDirectory,'prod-backup.lock'),JSON.stringify({nonce:randomUUID()}))
    return attach(c)
  }
  assert.equal((await f.run()).diagnostic,'operator_lock_changed_review_required')
  assert.equal((await loadSession(f.sessions)).session.open_preparation.outcome,'unknown')
  await fs.unlink(join(f.api.lockDirectory,'prod-backup.lock'))
  f.io.attachEvidence = async c => {
    if (process.platform === 'win32') execFileSync('icacls',[f.sessions,'/grant','*S-1-1-0:(R)'],{windowsHide:true,stdio:'pipe'})
    else await fs.chmod(f.sessions,0o755)
    return attach(c)
  }
  assert.equal((await f.run()).outcome,'unknown')
})

test('initial session load cannot establish a baseline over a newer external state', async t => {
  const f = await fixture(t), stale = await loadSession(f.sessions)
  await f.changeSession(s => { s.external_edit = true })
  await assert.rejects(guardedSession(f.sessions,stale),/session_changed_during_preparation/)
  assert.equal((await loadSession(f.sessions)).session.external_edit,true)
})

test('operator callback cannot mutate the internal publication binding', async t => {
  const f = await fixture(t), attach = f.io.attachEvidence
  f.io.attachEvidence = async c => { c.binding.merge = source; c.binding.changelog.content_hash = 'f'.repeat(64); return attach(c) }
  const result = await f.run()
  assert.equal(result.outcome,'ready'); assert.equal(result.binding.merge,merge)
  assert.equal(result.binding.changelog.content_hash,f.release.changelog.content_hash)
})
