import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { hashBytes } from '../backup/secure-files.js'
import { VercelMaintenanceError, safeDiagnostic as vercelDiagnostic } from '../maintenance/vercel.js'
import { MaintenanceError } from '../maintenance/database.js'
import { requireProduction, ProductionError } from './config.js'
import { loadSession, lockSession, guardedSession, sessionRecords } from './session.js'
import { preparationFailure, validateOpenSession } from './open-preparation.js'
import { publishOpenChangelog, publicationIsVerified, revalidatePublishedChangelog, publicationDiagnostic } from './open-publication.js'

const now = () => new Date().toISOString()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/).refine(v => !/REPLACE|synthetic/i.test(v))
const optionsSchema = z.strictObject({ pull_request: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deployment_id: z.string().regex(/^dpl_[a-zA-Z0-9]+$/), visibility_user_id: z.uuid() })
export const finalEvidenceSchema = z.strictObject({ format: z.literal('my-production-online-evidence-v1'),
  provenance: z.literal('operator_verified_authenticated_application'), session_id: z.uuid(), run_id: z.uuid(),
  checkpoint: hash, checked_at: z.iso.datetime(), reference, domain: z.literal('my.collectrealm.com'),
  deployment_id: z.string().regex(/^dpl_[a-zA-Z0-9]+$/), served_commit: z.string().regex(/^[a-f0-9]{40}$/), served_version: z.string(),
  checks: z.strictObject({ authenticated_GET_HEAD_200_routes_assets: z.literal(true), served_version_and_commit: z.literal(true),
    auth_mfa: z.literal(true), authorized_reads_and_mutations: z.literal(true), notification_available: z.literal(true),
    phase8_recovery: z.literal(true) }) })
const diagnostics = new Set(['open_options_invalid', 'open_connection_authorization_required', 'open_resume_review_required',
  'open_supabase_authorization_required', 'open_vercel_authorization_required', 'open_remote_identity_invalid',
  'open_freeze_revision_changed', 'open_premature_or_unattributed', 'open_checkpoint_changed', 'open_intent_invalid',
  'open_binding_changed', 'open_publication_not_verified', 'open_freeze_commit_unverified', 'open_vercel_commit_unverified',
  'open_final_evidence_missing_or_invalid', 'open_final_evidence_historical_or_mismatched', 'vercel_lock_requires_operator_review',
  'operator_lock_changed', 'operator_busy_or_interrupted_review_exact_lock', 'session_changed_or_result_not_persisted', 'interrupted_state_unknown'])
export function openDiagnostic(error, interrupted = false) {
  if (interrupted) return 'interrupted_state_unknown'
  if (error instanceof ProductionError && diagnostics.has(error.message)) return error.message
  if (publicationDiagnostic(error)) return publicationDiagnostic(error)
  const preparation = preparationFailure(error, false)
  if (preparation.outcome === 'blocked') return preparation.diagnostic
  if (error instanceof VercelMaintenanceError) return `vercel:${vercelDiagnostic(error)}`
  if (error instanceof MaintenanceError && ['freeze_revision_changed', 'committed_state_unverified', 'freeze_state_unexpected',
    'unexpected_postgresql_system', 'freeze_state_changed', 'drainage_uncertain_inspect_observe'].includes(error.message)) return `supabase:${error.message}`
  return 'open_unverified_details_suppressed'
}

function remoteIdentity(remote, bundle) {
  requireProduction(remote.database.identity?.system_id === bundle.target.system_id
    && remote.database.identity?.database === bundle.target.database && remote.database.identity?.session_user === 'postgres'
    && typeof remote.database.state?.frozen === 'boolean' && /^(0|[1-9]\d*)$/.test(remote.database.state.revision)
    && remote.maintenance.verified === true && remote.maintenance.control_plane_confirmed === true
    && remote.maintenance.identity?.project_id === bundle.vercel.project_id
    && remote.maintenance.identity?.team_id === bundle.vercel.team_id
    && typeof remote.maintenance.state?.maintenance_production === 'boolean'
    && hash.safeParse(remote.maintenance.checkpoint).success, 'open_remote_identity_invalid')
}
const expectation = remote => ({ database_state: structuredClone(remote.database.state),
  maintenance_production: remote.maintenance.state.maintenance_production, maintenance_checkpoint: remote.maintenance.checkpoint })
const states = remote => ({ supabase: remote.database.state.frozen ? 'closed' : 'open',
  vercel: remote.maintenance.state.maintenance_production ? 'closed' : 'open' })

// The single local AUTO.3 lock spans publication, human evidence, both changes,
// final checks and durable completion. It is not a distributed lock. AUTO.1's
// database CAS and AUTO.2's checkpoint/exclusive writer rules remain mandatory.
export async function runOpen(bundle, io, api) {
  let releaseLock, state, store, run, publication, result, connectionAuthorized = false
  const guard = async () => {
    requireProduction(!api.signal?.aborted, 'interrupted_state_unknown')
    api.checkConfiguration()
    if (releaseLock) await releaseLock.check()
    if (store) await store.check()
  }
  const persist = () => store.record('open_reopening_result', 'AUTO4C_confirmed_states_not_distributed_availability', run)
  const read = async () => {
    await guard()
    const remote = { database: await api.database(), maintenance: await api.maintenance() }
    remoteIdentity(remote, bundle)
    run.states = states(remote)
    run.observed = { database: { identity: remote.database.identity, state: remote.database.state }, maintenance: remote.maintenance }
    await guard()
    return remote
  }
  const consent = async (kind, callback, challenge) => {
    await guard()
    requireProduction(await callback?.(structuredClone(challenge)) === true, `open_${kind}_authorization_required`)
    await guard()
    run.authorizations[kind] = true
    await store.record('open_reopening_authorization', 'explicit_operator_consent_distinct_from_publication',
      { session_id: state.session.id, run_id: run.run_id, kind, ...challenge, granted_at: now() })
  }
  try {
    await api.prepare()
    await guard()
    releaseLock = await lockSession(api.lockDirectory)
    state = await loadSession(bundle.config.sessions_directory)
    requireProduction(state, 'session_missing')
    store = await guardedSession(bundle.config.sessions_directory, state)
    const { session } = state, previous = session.open_reopening
    requireProduction(session.project === bundle.config.project && session.fingerprint === bundle.fingerprint,
      'session_configuration_changed_review_required')
    validateOpenSession(session, bundle, api.backupRoot, session.stage === 'completed')
    await io.summary?.({ session_id: session.id, project: session.project, repository: session.repository,
      backup: session.attempts.at(-1), previous, system_id: bundle.target.system_id, vercel: bundle.vercel })
    const selected = await io.identify?.(structuredClone(session.open_publication?.binding ?? session.open_preparation?.binding ?? {}))
    const parsed = optionsSchema.safeParse(selected)
    requireProduction(parsed.success, 'open_options_invalid')
    const input = parsed.data
    run = { format: 'my-production-reopening-v1', session_id: session.id, run_id: randomUUID(), started_at: now(),
      outcome: 'incomplete', diagnostic: 'running_or_interrupted', states: { supabase: 'unknown', vercel: 'unknown' },
      authorizations: {}, binding: previous?.binding, freeze_intent: previous?.freeze_intent, vercel_intent: previous?.vercel_intent,
      open_checkpoint: previous?.open_checkpoint, final_evidence: undefined, restore_proven: false, production_recovery_proven: false }
    session.open_reopening = run
    await store.save()
    await consent('connection', io.authorizeCloudConnect, { session_id: session.id, project: session.project,
      configuration_fingerprint: bundle.fingerprint })
    connectionAuthorized = true
    const remote = await read()
    const revision = session.freeze_revision
    requireProduction(/^(0|[1-9]\d*)$/.test(revision ?? ''), 'open_freeze_revision_changed')
    const openRevision = (BigInt(revision) + 1n).toString()
    const records = await sessionRecords(state.folder, session)
    for (const [field, kind] of [['freeze_intent', 'open_freeze_intent'], ['vercel_intent', 'open_vercel_intent']]) {
      if (!run[field]) continue
      const entry = records.find(r => r.id === run[field].evidence)
      requireProduction(entry?.kind === kind && isDeepStrictEqual(entry.value, run[field].value)
        && isDeepStrictEqual(run[field].value.binding, previous.binding)
        && run[field].value.session_id === session.id, 'open_intent_invalid')
    }
    if (run.freeze_intent) requireProduction(run.freeze_intent.value.expected_revision === revision
      && run.freeze_intent.value.open_revision === openRevision
      && records.some(r => r.kind === 'open_reopening_authorization' && r.value.kind === 'supabase'
        && r.value.run_id === run.freeze_intent.value.run_id && r.value.session_id === session.id)
      && session.open_publication?.receipt && isDeepStrictEqual(previous.binding, session.open_publication.binding), 'open_intent_invalid')
    if (run.vercel_intent) requireProduction(run.freeze_intent
      && records.some(r => r.kind === 'open_reopening_authorization' && r.value.kind === 'vercel'
        && r.value.run_id === run.vercel_intent.value.run_id && r.value.session_id === session.id)
      && run.vercel_intent.value.freeze_revision === openRevision
      && run.vercel_intent.value.checkpoint === run.freeze_intent.value.maintenance_checkpoint, 'open_intent_invalid')
    requireProduction(remote.database.state.frozen ? remote.database.state.revision === revision
      : remote.database.state.revision === openRevision, 'open_freeze_revision_changed')
    requireProduction(remote.database.state.frozen || run.freeze_intent, 'open_premature_or_unattributed')
    requireProduction(remote.maintenance.state.maintenance_production || (run.vercel_intent && !remote.database.state.frozen),
      'open_premature_or_unattributed')
    if (run.freeze_intent && remote.maintenance.state.maintenance_production) requireProduction(
      remote.maintenance.checkpoint === run.freeze_intent.value.maintenance_checkpoint, 'open_checkpoint_changed')
    if (!remote.maintenance.state.maintenance_production && run.open_checkpoint) requireProduction(
      remote.maintenance.checkpoint === run.open_checkpoint, 'open_checkpoint_changed')
    if (previous && previous.outcome !== 'completed') {
      requireProduction(await io.authorizeRecovery?.({ session_id: session.id, states: run.states,
        uncertain_vercel_checkpoint: !remote.maintenance.state.maintenance_production && !run.open_checkpoint }) === true,
      'open_resume_review_required')
      await guard()
      await store.record('open_resume_review', 'operator_process_lock_and_remote_change_review_not_atomic_proof',
        { session_id: session.id, run_id: run.run_id, states: run.states, checked_at: now() })
    }
    let expected = expectation(remote)
    // Existing durable opening intent means publication already has a durable
    // receipt. Recovery only re-reads it; it never dispatches another publish.
    const context = { state, store, guard, protections: expected, completed: session.stage === 'completed',
      verifyOnly: Boolean(run.freeze_intent) }
    publication = await publishOpenChangelog(bundle, input, { ...io, authorizeCloudConnect: async () => connectionAuthorized }, api, context)
    requireProduction(publicationIsVerified(publication, session.open_publication.run_id), 'open_publication_not_verified')
    requireProduction(!run.binding || isDeepStrictEqual(run.binding, publication.binding), 'open_binding_changed')
    run.binding = publication.binding
    run.publication_run_id = publication.run_id
    run.notification = publication.receipt.receipt
    await persist()
    const fresh = async () => {
      await guard()
      const current = await context.prepared.revalidate(expected)
      const notification = await revalidatePublishedChangelog(bundle, publication, api)
      await guard()
      run.states = states(current)
      run.observed = { database: { identity: current.database.identity, state: current.database.state }, maintenance: current.maintenance }
      await store.record('open_fresh_validation', 'AUTO4A_and_AUTO4B_fresh_independent_reads',
        { session_id: session.id, run_id: run.run_id, states: run.states, protections: expected, notification })
      return current
    }
    await fresh()
    const challenge = { session_id: session.id, run_id: run.run_id, binding: run.binding, states: run.states,
      freeze_revision: expected.database_state.revision, maintenance_checkpoint: expected.maintenance_checkpoint,
      publication_run_id: publication.run_id }
    // Distinct from publishing and from each other; exclusion lasts through all
    // final reads. Slow human confirmations are always followed by fresh reads.
    if (expected.database_state.frozen) await consent('supabase', io.authorizeUnfreeze, challenge)
    if (expected.maintenance_production) await consent('vercel', io.authorizeVercelReopen, challenge)
    await fresh()
    if (expected.database_state.frozen) {
      const value = { session_id: session.id, run_id: run.run_id, binding: run.binding, expected_revision: revision,
        open_revision: openRevision, maintenance_checkpoint: expected.maintenance_checkpoint, publication_run_id: publication.run_id }
      const entry = await store.record('open_freeze_intent', 'authorized_before_AUTO1_dispatch_state_may_be_unknown', value)
      run.freeze_intent = { evidence: entry.id, value }
      run.states.supabase = 'unknown'
      await persist()
      await guard()
      const opened = await api.freeze('reopen', revision, { authorizeReopen: true })
      requireProduction(opened.verified === true && opened.independent_read === true
        && opened.identity?.system_id === bundle.target.system_id && opened.state?.frozen === false
        && opened.state.revision === openRevision, 'open_freeze_commit_unverified')
      expected.database_state = opened.state
      run.states.supabase = 'open'
      await store.record('open_freeze_confirmed', 'AUTO1_commit_and_independent_read', opened)
      await guard()
      const verified = await api.freeze('verify-open', openRevision)
      requireProduction(verified.identity?.system_id === bundle.target.system_id
        && isDeepStrictEqual(verified.state, opened.state), 'open_freeze_commit_unverified')
    }
    await fresh()
    if (expected.maintenance_production) {
      // No new checkpoint is silently adopted between consent and PATCH.
      const value = { session_id: session.id, run_id: run.run_id, binding: run.binding, freeze_revision: openRevision,
        checkpoint: expected.maintenance_checkpoint, publication_run_id: publication.run_id }
      const entry = await store.record('open_vercel_intent', 'authorized_before_AUTO2_dispatch_state_may_be_unknown', value)
      run.vercel_intent = { evidence: entry.id, value }
      run.states.vercel = 'unknown'
      await persist()
      await guard()
      const opened = await api.reopenMaintenance({ authorizeReopen: true, exclusiveWriter: true, checkpoint: expected.maintenance_checkpoint })
      requireProduction(opened.verified === true && opened.independent_read === true && opened.control_plane_confirmed === true
        && opened.identity?.project_id === bundle.vercel.project_id && opened.identity?.team_id === bundle.vercel.team_id
        && opened.state?.maintenance_production === false && hash.safeParse(opened.checkpoint).success, 'open_vercel_commit_unverified')
      expected.maintenance_production = false
      expected.maintenance_checkpoint = opened.checkpoint
      run.open_checkpoint = opened.checkpoint
      run.states.vercel = 'open'
      await store.record('open_vercel_confirmed', 'AUTO2_independent_read_control_plane_only', opened)
    }
    const online = await fresh()
    run.open_checkpoint = online.maintenance.checkpoint
    const checkpoint = hashBytes(JSON.stringify({ session_id: session.id, run_id: run.run_id, binding: run.binding,
      protections: expected, notification: run.notification }))
    const finalChallenge = { session_id: session.id, run_id: run.run_id, checkpoint, started_at: now(),
      domain: 'my.collectrealm.com', deployment_id: run.binding.deployment_id, served_commit: run.binding.merge, served_version: run.binding.version }
    await store.record('open_final_challenge', 'authenticated_application_checks_required_not_control_plane_availability', finalChallenge)
    const decoded = finalEvidenceSchema.safeParse(await io.attachFinalEvidence?.(structuredClone(finalChallenge)))
    await guard()
    requireProduction(decoded.success, 'open_final_evidence_missing_or_invalid')
    const proof = decoded.data
    requireProduction(Object.entries(finalChallenge).every(([k, v]) => k === 'started_at' || proof[k] === v)
      && Date.parse(proof.checked_at) >= Date.parse(finalChallenge.started_at) && Date.parse(proof.checked_at) <= Date.now(),
    'open_final_evidence_historical_or_mismatched')
    const entry = await store.record('open_final_evidence', 'operator_verified_not_automatic_authenticated_application', proof)
    await fresh()
    await store.permissions()
    run.final_evidence = entry.id
    run.outcome = 'completed'
    run.diagnostic = 'protections_open_and_authenticated_application_checks_attested'
    run.completed_at = now()
    run.reused = previous?.outcome === 'completed'
    session.stage = 'completed'
    session.completed_at = run.completed_at
    await persist()
    await guard()
    result = structuredClone(run)
  } catch (error) {
    if (run) {
      run.outcome = 'incomplete'
      run.diagnostic = error instanceof ProductionError && error.message === 'open_publication_not_verified'
        ? publication?.diagnostic ?? 'open_publication_not_verified' : openDiagnostic(error, api.signal?.aborted)
      // After uncertain dispatch never claim both protections remain closed.
      // A bounded fresh read may resolve a lost acknowledgement, never a write.
      if (connectionAuthorized && !api.signal?.aborted) {
        try { await read() } catch { run.states = { supabase: 'unknown', vercel: 'unknown' } }
      }
      run.failed_at = now()
      try { await persist() } catch { run.diagnostic = 'session_changed_or_result_not_persisted' }
      result = structuredClone(run)
    } else result = { outcome: 'incomplete', diagnostic: openDiagnostic(error, api.signal?.aborted),
      states: { supabase: 'unknown', vercel: 'unknown' } }
  } finally {
    if (releaseLock && !api.signal?.aborted) {
      try { await releaseLock() }
      catch {
        result.outcome = 'incomplete'; result.diagnostic = 'operator_lock_changed'
        if (run) { Object.assign(run, result); await persist().catch(() => undefined) }
      }
    }
  }
  return result
}
