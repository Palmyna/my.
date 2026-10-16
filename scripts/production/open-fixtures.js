import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { prepareOpen } from './open-preparation.js'
import { createSession, saveSession, record, loadSession } from './session.js'
import { prepareChangelog } from './release.js'
import { restrictDirectory } from '../backup/secure-files.js'

const project = 'xvtiwhxvtfxvvokquttu', source = 'a'.repeat(40), merge = 'b'.repeat(40), digest = 'c'.repeat(64)
const revision = '9007199254740999'
const verification = { outcome: 'capture_integrity_verified', restore_proven: false, publication_authorized: false }
const vercelTarget = { format: 'my-vercel-maintenance-target-v1', environment: 'production', project: 'my',
  domain: 'my.collectrealm.com', project_id: 'prj_Test', team_id: 'team_Test', global_config_id: 'ecfg_Test', global_config_slug: 'my_test' }
const payload = { publication_key: 'my.release.0.8.33', category: 'changelog', app_version: '0.8.33',
  title: 'Version 0.8.33', body: 'Améliorations de MY.', action: { kind: 'notification_content' }, requires_action: false,
  include_new_users: false, expires_at: null, publication_context: { reason: 'Publication de la version.', include_new_users_justification: null } }
export async function temporary(t) {
  const folder = await fs.mkdtemp(join(tmpdir(), 'my-auto4a-'))
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/') + 'my-auto4a-'))
    await fs.rm(folder, { recursive: true, force: true })
  })
  return folder
}
export async function fixture(t) {
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

export { project, source, merge, digest, revision, payload, vercelTarget }
