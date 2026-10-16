import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import pg from 'pg'
import { hashBytes } from '../backup/secure-files.js'
import { publicationSchema, publicationHash, publishedResult } from '../notifications/contract.ts'
import { notificationDate, notificationInstant } from '../../src/lib/notification-scalars.ts'
import { requireProduction, ProductionError } from './config.js'
import { loadSession, guardedSession, lockSession } from './session.js'
import { prepareOpenInSession, preparationFailure } from './open-preparation.js'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const inputSchema = z.strictObject({ pull_request: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  deployment_id: z.string().regex(/^dpl_[a-zA-Z0-9]+$/), visibility_user_id: z.uuid() })
const reference = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/).refine(v => !/REPLACE|synthetic/i.test(v))
export const visibilityEvidenceSchema = z.strictObject({
  format: z.literal('my-production-changelog-visibility-v1'), provenance: z.literal('operator_verified_real_authenticated_RPC'),
  session_id: z.uuid(), run_id: z.uuid(), checkpoint: hash, checked_at: z.iso.datetime(), reference,
  project: z.string().regex(/^[a-z]{20}$/), user_id: z.uuid(), aal: z.literal('aal2'),
  announcement_id: z.uuid(), publication_key: z.string(), content_hash: hash, app_version: z.string(),
  checks: z.strictObject({ real_session_identity_and_aal2: z.literal(true), get_notification_center_all_pages: z.literal(true),
    get_notification_unread_count_consistent: z.literal(true), get_notification_content_exact: z.literal(true),
    exactly_one_expected_notification: z.literal(true), no_mark_read_or_process: z.literal(true) }),
})
const stateSchema = z.object({ identity: z.object({ system_id: z.string(), session_user: z.literal('postgres'), database: z.literal('postgres') }),
  observed_at: notificationDate,
  announcements: z.array(z.strictObject({ announcement_id: z.uuid(), content_hash: hash,
    published_by: z.literal('my_notification_publisher'), published_at: notificationDate, withdrawn_at: notificationDate.nullable(),
    publication: publicationSchema })),
  reader: z.strictObject({ user_id: z.uuid(), registered_at: notificationDate, profile_exists: z.boolean(),
    read_at: notificationDate.nullable(), processed_at: notificationDate.nullable() }).nullable(),
})
const receiptSchema = z.strictObject({ identity: z.strictObject({ project: z.string(), system_id: z.string(), database: z.literal('postgres'),
  session_user: z.literal('my_notification_publisher'), current_user: z.literal('my_notification_publisher'),
  tls_verified: z.literal(true), permissions_verified: z.literal(true) }), receipt: publishedResult })
const limits = { reopen_authorized: false, protections_changed: false,
  validity: 'observation_only_fresh_revalidation_required_before_reopen' }
const now = () => new Date().toISOString()
const diagnostics = new Set(['publication_options_invalid', 'cloud_connect_authorization_required', 'publish_authorization_required',
  'publication_receipt_invalid', 'publication_read_invalid', 'publication_duplicate_release', 'publication_content_conflict',
  'publication_receipt_row_mismatch', 'publication_withdrawn', 'publication_not_active', 'publication_expired',
  'publication_binding_changed', 'publication_dispatch_contract_invalid', 'publication_receipt_changed', 'publication_absent',
  'visibility_identity_ineligible', 'visibility_evidence_missing_or_invalid', 'visibility_evidence_historical_or_mismatched',
  'visibility_identity_or_state_changed', 'publisher_target_changed', 'publisher_target_differs_from_session', 'publication_secret_channels_not_consumed'])

function validateReceipt(value, binding, bundle) {
  const parsed = receiptSchema.safeParse(value)
  requireProduction(parsed.success, 'publication_receipt_invalid')
  const { identity, receipt } = parsed.data
  requireProduction(identity.project === bundle.config.project && identity.system_id === bundle.target.system_id
    && receipt.publication_key === binding.changelog.publication_key
    && receipt.content_hash === binding.changelog.content_hash, 'publication_receipt_invalid')
  return parsed.data
}

// Classification uses the actual row, never an idempotent historical receipt.
// Two matches suffice to reject another key for the same release version.
function inspectState(value, publication, binding, bundle, receipt) {
  const parsed = stateSchema.safeParse(value)
  requireProduction(parsed.success && parsed.data.identity.system_id === bundle.target.system_id, 'publication_read_invalid')
  const state = parsed.data, rows = state.announcements
  if (rows.length === 0) return { state, row: undefined, diagnostic: 'publication_absent' }
  if (rows.length !== 1) return { state, row: rows[0], diagnostic: 'publication_duplicate_release' }
  const row = rows[0]
  if (!isDeepStrictEqual(row.publication, publication) || row.content_hash !== publicationHash(row.publication)
    || row.content_hash !== binding.changelog.content_hash) return { state, row, diagnostic: 'publication_content_conflict' }
  if (receipt && (row.announcement_id !== receipt.receipt.announcement_id
    || notificationInstant(row.published_at) !== notificationInstant(receipt.receipt.published_at))) {
    return { state, row, diagnostic: 'publication_receipt_row_mismatch' }
  }
  if (row.withdrawn_at !== null) return { state, row, diagnostic: 'publication_withdrawn' }
  const at = notificationInstant(state.observed_at)
  if (notificationInstant(row.published_at) > at) return { state, row, diagnostic: 'publication_not_active' }
  if (row.publication.expires_at !== null && (notificationInstant(row.publication.expires_at) <= at
    || notificationInstant(row.publication.expires_at) <= BigInt(Date.now()) * 1000n)) return { state, row, diagnostic: 'publication_expired' }
  return { state, row, diagnostic: 'publication_active_exact' }
}

// Internal AUTO.4B entry, no prod:open command. A single shared AUTO.3 lock spans
// preparation, consents, dispatch, independent reads and operator evidence.
export async function publishOpenChangelog(bundle, input, io, api) {
  let releaseLock, store, state, run, result, prepared
  const guard = async () => {
    requireProduction(!api.signal?.aborted, 'interrupted_state_unknown')
    api.checkConfiguration()
    if (store) await store.check()
  }
  const persist = async () => {
    run.checked_at = now()
    await store.record('open_publication_result', 'AUTO4B_actual_status_not_reopen_authorization', run)
  }
  try {
    const options = inputSchema.safeParse(input)
    requireProduction(options.success, 'publication_options_invalid')
    await api.prepare()
    await guard()
    releaseLock = await lockSession(api.lockDirectory)
    state = await loadSession(bundle.config.sessions_directory)
    requireProduction(state, 'session_missing')
    store = await guardedSession(bundle.config.sessions_directory, state)
    const { session } = state, previous = session.open_publication
    run = { format: 'my-production-open-publication-v1', session_id: session.id, run_id: randomUUID(), started_at: now(),
      ...limits, outcome: previous?.receipt ? 'existing_ineligible' : previous?.dispatch_started ? 'uncertain' : 'not_published',
      diagnostic: 'running_or_interrupted', existence: previous?.receipt ? 'present' : 'unobserved',
      binding: previous?.binding, receipt: previous?.receipt, dispatch_started: previous?.dispatch_started === true,
      authorizations: { cloud_connect: false, publish: false }, visibility_verified: false }
    session.open_publication = run
    await store.save()
    const consent = async (kind, callback, challenge) => {
      requireProduction(await callback?.(structuredClone(challenge)) === true, `${kind}_authorization_required`)
      await guard()
      run.authorizations[kind] = true
      await store.record('open_publication_authorization', 'explicit_operator_consent_not_backup_consent',
        { session_id: session.id, run_id: run.run_id, kind, granted_at: now(), ...challenge })
    }
    await consent('cloud_connect', io.authorizeCloudConnect, { session_id: session.id, run_id: run.run_id,
      project: bundle.config.project, configuration_fingerprint: bundle.fingerprint })
    prepared = await prepareOpenInSession(bundle, { pull_request: options.data.pull_request, deployment_id: options.data.deployment_id },
      io, api, { state, store, guard })
    const binding = { ...prepared.run.binding, visibility_user_id: options.data.visibility_user_id }
    requireProduction(!run.binding || isDeepStrictEqual(run.binding, binding), 'publication_binding_changed')
    run.binding = binding
    run.preparation_run_id = prepared.run.run_id
    run.preparation_checkpoint = prepared.run.checkpoint
    if (run.receipt) run.receipt = validateReceipt(run.receipt, binding, bundle)
    await store.save()
    const publication = publicationSchema.parse(await api.publication(structuredClone(binding)))
    requireProduction(publicationHash(publication) === binding.changelog.content_hash
      && publication.app_version === binding.version && publication.publication_key === binding.changelog.publication_key,
    'publication_binding_changed')
    const read = async () => {
      await guard()
      const inspected = inspectState(await api.readPublication(structuredClone(binding)), publication, binding, bundle, run.receipt)
      const { state: observed, row, diagnostic } = inspected
      run.existence = row ? 'present' : 'absent'
      if (row) run.outcome = 'existing_ineligible'
      run.last_read = { observed_at: observed.observed_at, diagnostic, matches: observed.announcements.length,
        identity: { system_id: observed.identity.system_id, session_user: observed.identity.session_user, database: observed.identity.database },
        reader: observed.reader,
        ...(row ? { announcement_id: row.announcement_id, content_hash: row.content_hash, app_version: row.publication.app_version,
          published_by: row.published_by, published_at: row.published_at, withdrawn_at: row.withdrawn_at,
          expires_at: row.publication.expires_at, include_new_users: row.publication.include_new_users } : {}) }
      await store.record('open_publication_read', 'AUTO1_independent_read_only_connection_actual_rows',
        { session_id: session.id, run_id: run.run_id, ...run.last_read })
      return inspected
    }
    const before = await read()
    requireProduction(!before.row || before.diagnostic === 'publication_active_exact', before.diagnostic)
    await consent('publish', io.authorizePublish, { session_id: session.id, run_id: run.run_id,
      preparation_checkpoint: prepared.run.checkpoint, binding })
    // Connect/verify publisher first. Only this callback records possible SQL
    // dispatch; connection failures before it cannot have inserted a new row.
    const envelope = await api.publish(structuredClone(publication), async () => {
      await prepared.revalidate()
      requireProduction(isDeepStrictEqual(await api.publication(structuredClone(binding)), publication), 'publication_binding_changed')
      await guard()
      run.dispatch_started = true
      run.outcome = 'uncertain'
      run.diagnostic = 'dispatch_started_receipt_not_durable'
      await store.record('open_publication_dispatch', 'PROD6_same_file_key_hash_before_SQL',
        { session_id: session.id, run_id: run.run_id, binding, started_at: now() })
      await guard()
    })
    requireProduction(run.dispatch_started, 'publication_dispatch_contract_invalid')
    const receipt = validateReceipt(envelope, binding, bundle)
    requireProduction(!run.receipt || isDeepStrictEqual(run.receipt, receipt), 'publication_receipt_changed')
    run.receipt = receipt
    await guard()
    await store.record('open_publication_receipt', 'PROD6_verified_TLS_identity_ACL_and_PostgreSQL_receipt',
      { session_id: session.id, run_id: run.run_id, binding, ...receipt })
    const after = await read()
    requireProduction(after.row && after.diagnostic === 'publication_active_exact', after.diagnostic)
    const reader = after.state.reader
    requireProduction(reader?.user_id === binding.visibility_user_id && reader.profile_exists && reader.processed_at === null
      && (publication.include_new_users || notificationInstant(reader.registered_at) <= notificationInstant(after.row.published_at)),
    'visibility_identity_ineligible')
    const checkpoint = hashBytes(JSON.stringify({ session_id: session.id, run_id: run.run_id, binding, receipt, read: run.last_read, reader }))
    const challenge = { session_id: session.id, run_id: run.run_id, checkpoint, started_at: now(),
      project: bundle.config.project, user_id: binding.visibility_user_id, announcement_id: receipt.receipt.announcement_id,
      publication_key: binding.changelog.publication_key, content_hash: binding.changelog.content_hash, app_version: binding.version }
    await store.record('open_publication_visibility_challenge', 'fresh_read_bound_operator_RPC_challenge', challenge)
    const decoded = visibilityEvidenceSchema.safeParse(await io.attachVisibilityEvidence?.(structuredClone(challenge)))
    await guard()
    requireProduction(decoded.success, 'visibility_evidence_missing_or_invalid')
    const proof = decoded.data
    requireProduction(Object.entries(challenge).every(([k, v]) => k === 'started_at' || proof[k] === v)
      && Date.parse(proof.checked_at) >= Date.parse(challenge.started_at) && Date.parse(proof.checked_at) <= Date.now(),
    'visibility_evidence_historical_or_mismatched')
    const evidence = await store.record('open_publication_visibility', 'operator_verified_not_automatic_authenticated_RPC', proof)
    // A person can take time. Never finish with a historical active row or a
    // protection/release observation made before the person's checks.
    await prepared.revalidate()
    requireProduction(isDeepStrictEqual(await api.publication(structuredClone(binding)), publication), 'publication_binding_changed')
    const final = await read()
    requireProduction(final.row && final.diagnostic === 'publication_active_exact', final.diagnostic)
    requireProduction(isDeepStrictEqual(final.state.reader, reader), 'visibility_identity_or_state_changed')
    await guard()
    await store.permissions()
    run.outcome = 'verified'
    run.diagnostic = 'publication_and_eligible_visibility_verified'
    run.visibility_verified = true
    run.visibility_evidence = evidence.id
    run.visibility_checkpoint = checkpoint
    await persist()
    result = structuredClone(run)
  } catch (error) {
    // Exact allowlisted diagnostics only. Never persist provider messages,
    // response bodies, exception paths, credentials or arbitrary callbacks.
    let diagnostic = 'publication_unobservable_details_suppressed'
    if (error instanceof pg.DatabaseError && error.code === '23505' && error.message === 'publication_key_conflict') {
      diagnostic = 'publication_content_conflict'
      if (run) { run.outcome = 'existing_ineligible'; run.existence = 'present' }
    } else if (error instanceof ProductionError && diagnostics.has(error.message)) diagnostic = error.message
    else {
      const failure = preparationFailure(error, api.signal?.aborted)
      if (failure.outcome === 'blocked') diagnostic = failure.diagnostic
    }
    if (api.signal?.aborted) diagnostic = 'interrupted_state_unknown'
    if (run) {
      if (run.outcome === 'verified') run.outcome = 'existing_ineligible'
      run.visibility_verified = false
      run.diagnostic = diagnostic
      if (!prepared && state?.session.open_preparation) {
        Object.assign(state.session.open_preparation, { outcome: 'unknown', diagnostic: 'publication_preparation_not_completed' })
      }
      try { await persist() }
      catch { run.outcome = 'uncertain'; run.diagnostic = 'session_changed_or_result_not_persisted' }
      result = structuredClone(run)
    } else result = { ...limits, outcome: 'uncertain', visibility_verified: false, diagnostic, checked_at: now() }
  } finally {
    if (releaseLock && !api.signal?.aborted) {
      try { await releaseLock() }
      catch {
        if (run) {
          run.outcome = 'uncertain'; run.visibility_verified = false; run.diagnostic = 'operator_lock_changed_review_required'
          await persist().catch(() => undefined)
          result = structuredClone(run)
        } else result = { ...limits, outcome: 'uncertain', visibility_verified: false, diagnostic: 'operator_lock_changed_review_required' }
      }
    }
  }
  return result
}

// AUTO.4C must require the result of its current invocation, then perform its
// own fresh checks before reopening. This predicate grants no opening rights.
export function publicationIsVerified(result, currentRunId) {
  return result?.format === 'my-production-open-publication-v1' && result.run_id === currentRunId
    && z.uuid().safeParse(currentRunId).success && result.outcome === 'verified' && result.visibility_verified === true
    && typeof result.visibility_evidence === 'string' && hash.safeParse(result.visibility_checkpoint).success
    && result.reopen_authorized === false && result.protections_changed === false
}
