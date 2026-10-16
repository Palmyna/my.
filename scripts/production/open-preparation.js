import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { hashBytes } from '../backup/secure-files.js'
import { requireProduction, ProductionError } from './config.js'
import { loadSession, guardedSession, lockSession, sessionRecords } from './session.js'
import { verifyArchiveBinding } from './archive.js'
import { githubRepository } from './release.js'

const sha = z.string().regex(/^[a-f0-9]{40}$/), hash = z.string().regex(/^[a-f0-9]{64}$/)
const revision = z.string().regex(/^(0|[1-9]\d*)$/)
const optionsSchema = z.strictObject({ pull_request: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deployment_id: z.string().regex(/^dpl_[a-zA-Z0-9]+$/) })
export const operatorEvidenceSchema = z.strictObject({
  format: z.literal('my-production-open-evidence-v1'), provenance: z.literal('operator_verified'),
  run_id: z.uuid(), session_id: z.uuid(), checkpoint: hash, checked_at: z.iso.datetime(),
  reference: z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/).refine(v => !/REPLACE|synthetic/i.test(v)),
  domain: z.literal('my.collectrealm.com'), deployment_id: z.string().regex(/^dpl_[a-zA-Z0-9]+$/),
  served_commit: sha, served_version: z.string(),
  checks: z.strictObject({ github_review_and_merge: z.literal(true), supabase_deployment_logs_success: z.literal(true),
    backend_compatibility: z.literal(true), promoted_same_production_build_without_rebuild: z.literal(true),
    served_version_and_commit: z.literal(true), authenticated_GET_HEAD_503_headers_routes_assets: z.literal(true),
    compatible_deployments_and_propagation: z.literal(true), publication_recovery_prerequisites: z.literal(true),
    no_backup_in_progress_and_privileged_writers_coordinated: z.literal(true) }),
})
// Only AUTO.4C, recovering a durable opening intent, can prepare with an
// already-open frontend. Never ask an operator to attest a nonexistent 503.
export const openOperatorEvidenceSchema = operatorEvidenceSchema.extend({ checks: operatorEvidenceSchema.shape.checks
  .omit({ authenticated_GET_HEAD_503_headers_routes_assets: true })
  .extend({ authenticated_GET_HEAD_open_routes_assets: z.literal(true) }) })

const blocked = new Set(['session_missing', 'session_incomplete', 'session_identity_invalid', 'session_archive_ambiguous',
  'session_configuration_changed_review_required', 'session_backup_path_invalid', 'session_ambiguous',
  'session_evidence_duplicate', 'session_invalid', 'session_evidence_file_missing', 'session_evidence_file_invalid',
  'session_evidence_hash_mismatch', 'session_evidence_reference_invalid', 'session_evidence_reference_mismatch',
  'session_pointer_invalid', 'session_pointer_missing_review_required', 'session_reparse_path_refused', 'session_completion_unverified',
  'session_changed_during_preparation', 'configuration_changed_during_session', 'archive_incomplete',
  'independent_verify_failed', 'archive_session_binding_mismatch', 'archive_evidence_provenance_missing',
  'archive_changed_during_verify', 'archive_record_contradictory', 'github_publication_contradictory',
  'github_source_or_main_unexpected', 'git_commit_invalid', 'git_repository_unexpected', 'git_history_incomplete',
  'git_merge_source_unexpected', 'git_main_changes_not_in_source', 'git_production_tree_unexpected',
  'git_release_versions_mismatch', 'git_release_version_invalid', 'git_migration_filename_invalid', 'git_migrations_ambiguous',
  'changelog_invalid', 'changelog_expired', 'changelog_version_or_category_mismatch', 'changelog_committed_file_missing',
  'changelog_worktree_differs_from_release', 'changelog_reparse_path_refused', 'release_version_unexpected',
  'maintenance_prematurely_open_or_unverified', 'freeze_prematurely_open_or_changed', 'database_identity_unexpected',
  'migration_history_unexpected', 'deployment_unexpected', 'release_binding_changed', 'operator_evidence_missing',
  'operator_evidence_invalid_or_historical', 'remote_state_changed_during_preparation', 'preparation_options_invalid'])

export function preparationFailure(error, interrupted) {
  if (interrupted) return { outcome: 'unknown', diagnostic: 'interrupted_state_unknown' }
  if (error instanceof ProductionError && blocked.has(error.message)) return { outcome: 'blocked', diagnostic: error.message }
  // No provider errors, paths from exceptions, response bodies or credentials.
  return { outcome: 'unknown', diagnostic: 'preparation_unobservable_details_suppressed' }
}
const limits = { publication_authorized: false, reopen_authorized: false, remote_writes: false,
  validity: 'observation_only_fresh_revalidation_required_before_any_action' }
const stable = value => {
  const rest = { ...value }
  delete rest.observed_at
  return rest
}

export function validateOpenSession(session, bundle, backupRoot, completed = false) {
  requireProduction(session.project === bundle.config.project && session.repository?.project === session.project
    && session.repository.environment === 'cloud' && session.repository.branch === 'dev' && session.repository.dirty === false
    && sha.safeParse(session.repository.head).success && typeof session.repository.version === 'string'
    && revision.safeParse(session.freeze_revision).success, 'session_identity_invalid')
  requireProduction(session.fingerprint === bundle.fingerprint, 'session_configuration_changed_review_required')
  const last = session.attempts.at(-1)
  requireProduction((session.stage === 'verified' || (completed && session.stage === 'completed')) && last?.verify === 'complete'
    && ['complete', 'recovered_by_independent_verify'].includes(last.capture)
    && !['running', 'failed_or_unknown'].includes(last.recheck)
    && hash.safeParse(last.manifest_sha256).success && revision.safeParse(last.freeze_revision).success
    && last.freeze_revision === session.freeze_revision && z.iso.datetime().safeParse(last.verified_at).success, 'session_incomplete')
  requireProduction(session.attempts.filter(a => a.verify === 'complete').length === 1, 'session_archive_ambiguous')
  requireProduction(session.attempts.every(a => typeof a.directory === 'string' && dirname(a.directory) === backupRoot
    && /[\\/]backup-[a-zA-Z0-9-]+$/.test(a.directory)), 'session_backup_path_invalid')
  return last
}

function validateRemote(remote, session, bundle, release, options, protections) {
  const { maintenance, database, deployment, github } = remote
  requireProduction(github.repository === githubRepository && github.source === session.repository.head
    && github.main === github.merge && github.merge === release.merge
    && github.pull_request === options.pull_request, 'github_source_or_main_unexpected')
  requireProduction(maintenance.verified === true && maintenance.control_plane_confirmed === true
    && maintenance.state?.maintenance_production === (protections?.maintenance_production ?? true)
    && (!protections || maintenance.checkpoint === protections.maintenance_checkpoint)
    && hash.safeParse(maintenance.checkpoint).success
    && maintenance.identity?.project_id === bundle.vercel.project_id
    && maintenance.identity?.team_id === bundle.vercel.team_id, 'maintenance_prematurely_open_or_unverified')
  requireProduction(database.identity?.system_id === bundle.target.system_id && database.identity?.session_user === 'postgres'
    && database.identity?.database === bundle.target.database, 'database_identity_unexpected')
  requireProduction(protections ? isDeepStrictEqual(database.state, protections.database_state)
    : database.state?.frozen === true && database.state.revision === session.freeze_revision, 'freeze_prematurely_open_or_changed')
  requireProduction(isDeepStrictEqual(database.migrations, release.migrations.map(({ version, name }) => ({ version, name }))), 'migration_history_unexpected')
  requireProduction(deployment.deployment_id === options.deployment_id && deployment.commit === release.merge
    && deployment.identity?.project_id === bundle.vercel.project_id && deployment.identity?.team_id === bundle.vercel.team_id
    && deployment.identity?.domain === 'my.collectrealm.com' && deployment.target === 'production'
    && deployment.ready === true && deployment.domain_assignment === 'confirmed_by_fresh_alias_reads', 'deployment_unexpected')
}

// Caller owns the existing AUTO.3 lock and guarded session for the entire
// operation. AUTO.4B keeps both through publication and independent reads.
export async function prepareOpenInSession(bundle, input, io, api, { state, store, guard, protections, completed = false }) {
  const parsed = optionsSchema.safeParse(input)
  requireProduction(parsed.success, 'preparation_options_invalid')
  const options = parsed.data
  const { session, folder } = state
  const run = { format: 'my-production-open-preparation-v1', run_id: randomUUID(), started_at: new Date().toISOString(),
    outcome: 'unknown', diagnostic: 'running_or_interrupted', binding: session.open_preparation?.binding, ...limits }
  session.open_preparation = run
  await store.save()
  const attempt = validateOpenSession(session, bundle, api.backupRoot, completed)
  await guard()
  const verified = await api.verify(attempt.directory)
  verifyArchiveBinding(verified, session, attempt, bundle)
  const records = await sessionRecords(folder, session)
  requireProduction(records.some(r => ['verified_archive', 'verified_archive_rechecked', 'verified_archive_recovered'].includes(r.kind)
    && r.value.directory === attempt.directory && r.value.manifest_sha256 === attempt.manifest_sha256
    && r.value.verification?.outcome === 'capture_integrity_verified')
    && records.some(r => r.kind === 'capture_evidence' && isDeepStrictEqual(r.value, verified.evidence))
    && records.some(r => r.id === verified.evidence.freeze_committed_evidence
      && r.provenance === 'AUTO1_commit_and_independent_read' && r.value.verified === true
      && r.value.independent_read === true && r.value.state?.frozen === true
      && r.value.state.revision === attempt.freeze_revision), 'archive_record_contradictory')
  const attestation = records.find(r => r.id === verified.evidence.maintenance_evidence)
  const drainage = records.find(r => r.id === verified.evidence.ordinary_writes_drained_evidence)
  requireProduction(attestation?.kind === 'closure_attestation'
    && attestation.provenance === 'operator_declaration_not_automatic_measurement'
    && attestation.id === verified.evidence.privileged_coordination_evidence
    && attestation.value.authenticated_http_503 === true && attestation.value.privileged_writers_excluded_until_end === true
    && attestation.value.ddl_roles_configuration_excluded_until_end === true
    && attestation.value.http_checked_at === verified.evidence.maintenance_checked_at
    && drainage?.kind === 'drainage' && drainage.provenance === 'PROD4_requireClosed_fresh_TLS_transaction'
    && drainage.value.state?.frozen === true && drainage.value.state.revision === attempt.freeze_revision,
  'archive_record_contradictory')
  await guard()
  const github = await api.github(options.pull_request)
  requireProduction(github.source === session.repository.head && github.main === github.merge, 'github_source_or_main_unexpected')
  const release = await api.release(session.repository.head, github.merge)
  requireProduction(release.version === session.repository.version, 'release_version_unexpected')
  const readRemote = async gh => ({ github: gh ?? await api.github(options.pull_request),
    maintenance: await api.maintenance(), database: await api.database(), deployment: await api.deployment(options.deployment_id) })
  const before = await readRemote(github)
  validateRemote(before, session, bundle, release, options, protections)
  await guard()
  const binding = { source: session.repository.head, merge: release.merge, version: release.version,
    pull_request: options.pull_request, deployment_id: options.deployment_id, changelog: release.changelog }
  requireProduction(!run.binding || isDeepStrictEqual(run.binding, binding), 'release_binding_changed')
  run.binding = binding
  await store.save()
  const checkpoint = hashBytes(JSON.stringify({ session_id: session.id, archive: attempt.manifest_sha256,
    binding, remote: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, stable(v)])) }))
  const challenge = { run_id: run.run_id, session_id: session.id, checkpoint, started_at: run.started_at, binding,
    ...(protections ? { protections } : {}) }
  await store.record('open_automatic_checks', 'AUTO4A_fresh_reads_and_PROD4_verify', { ...challenge, remote: before, release })
  const evidence = await io.attachEvidence?.(structuredClone(challenge))
  await guard()
  requireProduction(evidence, 'operator_evidence_missing')
  const decoded = (protections?.maintenance_production === false ? openOperatorEvidenceSchema : operatorEvidenceSchema).safeParse(evidence)
  requireProduction(decoded.success, 'operator_evidence_invalid_or_historical')
  const proof = decoded.data
  requireProduction(proof.run_id === run.run_id && proof.session_id === session.id && proof.checkpoint === checkpoint
    && Date.parse(proof.checked_at) >= Date.parse(run.started_at) && Date.parse(proof.checked_at) <= Date.now()
    && proof.served_version === release.version && proof.served_commit === release.merge
    && proof.deployment_id === options.deployment_id, 'operator_evidence_invalid_or_historical')
  await store.record('open_operator_evidence', 'operator_verified_not_automatic', proof)
  // Human checks can take time: re-read all changing facts afterward. No
  // historical record supplies a new remote fact, including on resume.
  const after = await readRemote()
  validateRemote(after, session, bundle, release, options, protections)
  requireProduction(isDeepStrictEqual(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, stable(v)])),
    Object.fromEntries(Object.entries(after).map(([k, v]) => [k, stable(v)])))
    && isDeepStrictEqual(await api.release(session.repository.head, github.merge), release)
    && await api.archiveHash(attempt.directory, verified.manifest) === attempt.manifest_sha256, 'remote_state_changed_during_preparation')
  await guard()
  await store.permissions()
  Object.assign(run, { outcome: 'ready', diagnostic: 'preconditions_observed_next_steps_require_authorization',
    checked_at: new Date().toISOString(), checkpoint })
  await store.record('open_preparation_result', 'AUTO4A_observation_not_open_authorization', run)
  await guard()
  // Reuse the historical/archive proof once, but never reuse volatile facts.
  const revalidate = async (expectedProtections = protections) => {
    await guard()
    validateOpenSession(session, bundle, api.backupRoot, completed)
    const current = await readRemote()
    validateRemote(current, session, bundle, release, options, expectedProtections)
    // Changes owned by AUTO.4C must be supplied as exact independently read
    // states. Everything else, including identities/contract/migrations, stays pinned.
    const expected = structuredClone(after)
    if (expectedProtections) {
      expected.database.state = expectedProtections.database_state
      expected.maintenance.state = { maintenance_production: expectedProtections.maintenance_production }
      expected.maintenance.checkpoint = expectedProtections.maintenance_checkpoint
    }
    requireProduction(isDeepStrictEqual(Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, stable(v)])),
      Object.fromEntries(Object.entries(current).map(([k, v]) => [k, stable(v)])))
      && isDeepStrictEqual(await api.release(session.repository.head, github.merge), release), 'remote_state_changed_during_preparation')
    await store.permissions()
    await guard()
    return current
  }
  return { run, release, revalidate }
}

// Internal foundation shared with the prod:open orchestrator.
// api contains reads exclusively. io.attachEvidence may return no evidence;
// readiness then stays blocked while all automatic results remain reviewable.
export async function prepareOpen(bundle, input, io, api) {
  let releaseLock, store, state, run, result
  const guard = async () => {
    requireProduction(!api.signal?.aborted, 'interrupted_state_unknown')
    api.checkConfiguration()
    if (store) await store.check()
  }
  try {
    const parsed = optionsSchema.safeParse(input)
    requireProduction(parsed.success, 'preparation_options_invalid')
    const options = parsed.data
    await api.prepare()
    await guard()
    releaseLock = await lockSession(api.lockDirectory)
    state = await loadSession(bundle.config.sessions_directory)
    requireProduction(state, 'session_missing')
    store = await guardedSession(bundle.config.sessions_directory, state)
    const prepared = await prepareOpenInSession(bundle, options, io, api, { state, store, guard })
    run = prepared.run
    result = { session_id: state.session.id, ...run }
  } catch (error) {
    result = { ...(state ? { session_id: state.session.id } : {}),
      ...limits, ...preparationFailure(error, api.signal?.aborted), checked_at: new Date().toISOString() }
    run ??= state?.session.open_preparation
    if (run && store) {
      Object.assign(run, result)
      try { await store.record('open_preparation_result', 'AUTO4A_observation_not_open_authorization', run) }
      catch { result = { ...limits, outcome: 'unknown', diagnostic: 'session_changed_or_result_not_persisted' } }
    }
  } finally {
    if (releaseLock && !api.signal?.aborted) {
      try { await releaseLock() }
      catch {
        result = { ...limits, outcome: 'unknown', diagnostic: 'operator_lock_changed_review_required' }
        if (run && store) {
          Object.assign(run, result)
          await store.record('open_preparation_result', 'AUTO4A_observation_not_open_authorization', run).catch(() => undefined)
        }
      }
    }
  }
  return result
}
