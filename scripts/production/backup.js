import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { decodeEvidence } from '../backup/contract.js'
import { requireProduction } from './config.js'
import { exists, loadSession, createSession, lockSession, completedSession, guardedSession,
  planSuccession, commitSuccession, incompleteSnapshot } from './session.js'
import { isDeepStrictEqual } from 'node:util'
import { verifyArchiveBinding } from './archive.js'

function closedVercel(result) {
  requireProduction(result.verified === true && result.control_plane_confirmed === true
    && result.state.maintenance_production === true, 'maintenance_closure_unverified')
}
function closedFreeze(result, revision) {
  requireProduction(result.state?.frozen === true && result.state.revision === revision,
    'freeze_reread_contradictory')
}
// Dependencies are internal APIs, replaced only by isolated test callers. The
// operator CLI has no selectable transport, fixture hook, or consent bypass.
export async function runBackup(bundle, io, api) {
  const { config } = bundle
  let release, store, sourcePin
  const guard = async () => {
    requireProduction(!api.signal?.aborted, 'interrupted_state_unknown')
    api.checkConfiguration()
    if (release) await release.check()
    if (store) await store.check()
    if (sourcePin) {
      requireProduction(isDeepStrictEqual(api.repository(), repository), 'source_changed_during_succession')
      requireProduction(isDeepStrictEqual(await api.validateSource(repository), sourcePin), 'source_changed_during_succession')
    }
  }
  const consent = async (kind, message, phrase) => {
    await guard()
    requireProduction(await io.confirm(kind, message, phrase) === true, 'explicit_authorization_missing')
    await guard()
  }
  const repository = api.repository()
  requireProduction(repository.branch === 'dev' && repository.dirty === false, 'clean_committed_dev_source_required')
  await api.prepare()
  await guard()
  release = await lockSession(api.lockDirectory)
  let state
  try {
    const previous = await loadSession(config.sessions_directory, { allowPendingSuccession: true })
    const freshSession = !previous || completedSession(previous.session)
    if (freshSession) {
      await api.validateSource(repository)
      await guard()
      state = await createSession(config.sessions_directory, repository, bundle.fingerprint, config.project, previous)
    } else {
      requireProduction(previous.session.project === config.project && previous.session.fingerprint === bundle.fingerprint,
        'session_configuration_changed_review_required')
      requireProduction(previous.session.attempts.every(a => typeof a.directory === 'string' && dirname(a.directory) === api.backupRoot
        && /[\\/]backup-[a-zA-Z0-9-]+$/.test(a.directory)), 'session_backup_path_invalid')
      requireProduction(previous.session.attempts.every(a => a.verify !== 'complete'
        || ['complete', 'recovered_by_independent_verify'].includes(a.capture)), 'session_invalid')
      if (previous.pending || previous.session.repository.head !== repository.head) {
        const last = previous.session.attempts.at(-1)
        const candidate = last && await exists(join(last.directory, 'manifest.myb'))
        // Complete archives retain their original source; independent verify is
        // still the sole recovery path. A pending intent cannot adopt dev again.
        if (previous.pending || (last?.verify !== 'complete' && !candidate)) {
          const sourceRelease = await api.validateSource(repository)
          const plan = await planSuccession(config.sessions_directory, previous, repository, sourceRelease,
            api.backupRoot, bundle.fingerprint, config.project)
          const revalidate = async () => {
            await guard()
            requireProduction(isDeepStrictEqual(api.repository(), repository), 'source_changed_during_succession')
            requireProduction(isDeepStrictEqual(await api.validateSource(repository), sourceRelease), 'source_changed_during_succession')
            const current = await loadSession(config.sessions_directory, { allowPendingSuccession: true })
            requireProduction(isDeepStrictEqual(current?.session, previous.session)
              && (!current.pending || (isDeepStrictEqual(current.pending.entry, plan.entry)
                && isDeepStrictEqual(current.pending.successor, plan.successor)))
              && isDeepStrictEqual(await incompleteSnapshot(current, api.backupRoot), plan.entry.value.predecessor),
            'session_succession_predecessor_changed')
            await guard()
          }
          await revalidate()
          io.progress(`Succession ${previous.pending ? 'à reprendre' : 'proposée'} · projet ${config.project} · configuration ${bundle.fingerprint}`)
          io.progress(`Prédécesseur ${previous.session.id} · source ${previous.session.repository.version} ${previous.session.repository.head} · stage ${previous.session.stage}`)
          io.progress(`Successeur prévu ${plan.successor.id} · source ${repository.version} ${repository.head}`)
          io.progress('Motif : correctif d’outillage après capture incomplète. Ancienne session et archives INCOMPLETE conservées ; nouvelle capture dans un dossier neuf.')
          await consent('succession', 'Après examen indépendant et arrêt des anciens processus/enfants, autoriser uniquement cette succession. Aucun état distant ni ancien consentement ne sera présumé actuel.', 'AUTORISER SUCCESSION')
          await revalidate()
          state = await commitSuccession(config.sessions_directory, previous, plan, revalidate)
        }
      }
      state ??= previous
    }
    store = await guardedSession(config.sessions_directory, state)
    const { folder, session } = state
    requireProduction(session.project === config.project && session.fingerprint === bundle.fingerprint,
      'session_configuration_changed_review_required')
    requireProduction(session.attempts.every(a => typeof a.directory === 'string' && dirname(a.directory) === api.backupRoot
      && /[\\/]backup-[a-zA-Z0-9-]+$/.test(a.directory)), 'session_backup_path_invalid')
    const last = session.attempts.at(-1)
    const archiveCandidate = last && await exists(join(last.directory, 'manifest.myb'))
      && !await exists(join(last.directory, 'INCOMPLETE'))
    if (last?.verify !== 'complete' && !archiveCandidate) requireProduction(session.repository.head === repository.head
      && session.repository.version === repository.version, 'incomplete_session_requires_original_source')
    if (last?.verify !== 'complete' && !archiveCandidate) sourcePin = session.source_release
    io.progress(`Projet ${config.project} · my.collectrealm.com · source ${session.repository.version} ${session.repository.head}`)
    io.progress(`Session ${folder} · volume M: identifié · chiffrement référencé : ${config.encrypted_volume_evidence}`)
    await consent('connect', 'Autoriser les connexions Vercel et Supabase Cloud au projet affiché (aucun export).', 'AUTORISER CONNEXIONS')
    await store.record('connection_authorization', 'operator_explicit_consent', { vercel: true, cloud: true })
    if (session.stage !== 'prepared' && last?.verify !== 'complete') {
      await consent('resume', 'Reprise : processus précédents et éventuels enfants examinés et terminés ; writers toujours coordonnés. Les protections restent fermées.', 'REPRENDRE SESSION')
    }
    const vercel = await api.vercel()
    await guard()
    const beforeVercel = await vercel.preflight()
    requireProduction(beforeVercel.control_plane_confirmed === true, 'maintenance_state_unknown')
    const beforeFreeze = await api.freeze('preflight')
    requireProduction(beforeFreeze.identity?.system_id === bundle.target.system_id
      && typeof beforeFreeze.state?.frozen === 'boolean', 'freeze_identity_unverified')
    await guard()

    // Authenticate any finished archive before considering another capture,
    // including a lost acknowledgement. A validated session is never duplicated.
    if (last?.verify === 'complete' || archiveCandidate) {
      closedVercel(beforeVercel)
      closedFreeze(beforeFreeze, last.freeze_revision)
      closedFreeze(await api.freeze('verify-closed', last.freeze_revision), last.freeze_revision)
      await guard()
      const recheck = last.verify === 'complete'
      session.stage = recheck ? 'rechecking' : 'verifying'
      if (recheck) last.recheck = 'running'
      else last.verify = 'running'
      await store.save()
      io.progress('Archive existante : vérification indépendante, aucun nouvel export ni nouvelle fermeture.')
      const verified = await api.verify(last.directory)
      await guard()
      verifyArchiveBinding(verified, session, last, bundle)
      const after = await vercel.preflight()
      closedVercel(after)
      requireProduction(after.checkpoint === beforeVercel.checkpoint, 'maintenance_changed_during_verify')
      const drainage = await api.drainage(last.freeze_revision)
      closedFreeze(drainage, last.freeze_revision)
      await guard()
      await store.record('post_verify_closure', 'AUTO2_read_and_PROD4_drainage', { maintenance: after, drainage })
      session.stage = 'verified'
      if (recheck) last.recheck = 'complete'
      if (last.capture !== 'complete') last.capture = 'recovered_by_independent_verify'
      last.verify = 'complete'
      last.manifest_sha256 = verified.manifest_sha256
      last.verified_at = new Date().toISOString()
      await store.record(recheck ? 'verified_archive_rechecked' : 'verified_archive_recovered', 'PROD4_verify', { directory: last.directory,
        manifest_sha256: verified.manifest_sha256, verification: verified.verification })
      await guard()
      return { session: folder, backup: last.directory, reused: true, capture: last.capture, verify: 'complete',
        repository: session.repository, restore_proven: false, publication_authorized: false }
    }

    if (!freshSession) { await api.validateSource(repository); await guard() }
    await consent('close', 'Autoriser fermeture Vercel puis gel Supabase. Exclure tous les autres writers Global Config pendant lecture, écriture et relecture ; aucune précondition CAS distante.', 'FERMER MY')
    await store.record('close_authorization', 'operator_explicit_consent', { close: true, exclusive_vercel_writer: true })
    session.stage = 'closing_vercel'
    await store.save()
    io.progress('1/4 · Maintenance Vercel Production.')
    await guard()
    const maintenance = await vercel.setMaintenance('close', { authorizeClose: true, exclusiveWriter: true, checkpoint: beforeVercel.checkpoint })
    closedVercel(maintenance)
    const maintenanceRecord = await store.record('maintenance', 'AUTO2_control_plane_only', maintenance)
    await guard()
    session.stage = 'closing_freeze'
    await store.save()
    io.progress('2/4 · Gel Supabase Cloud et relecture indépendante.')
    const freeze = await api.freeze('close', beforeFreeze.state.revision)
    requireProduction(freeze.verified === true && freeze.independent_read === true && freeze.state?.frozen === true,
      'committed_freeze_unverified')
    const revision = freeze.state.revision
    session.freeze_revision = revision
    session.maintenance = { maintenance_production: true, checkpoint: maintenance.checkpoint,
      observed_at: maintenance.observed_at, evidence: maintenanceRecord.id }
    const freezeRecord = await store.record('freeze', 'AUTO1_commit_and_independent_read', freeze)
    await guard()
    const verifiedFreeze = await api.freeze('verify-closed', revision)
    closedFreeze(verifiedFreeze, revision)

    io.progress('3/4 · Preuves opérateur puis drainage technique obligatoire.')
    io.progress('HTTP anonyme 302 vers SSO : admission Vercel requise. Utiliser session normalement authentifiée, sans bypass.')
    const declaration = await io.attest()
    await guard()
    requireProduction(declaration?.authenticated_http_503 === true && declaration.propagation_and_coverage === true
      && declaration.ordinary_api_refusals === true && declaration.privileged_writers_excluded_until_end === true
      && declaration.ddl_roles_configuration_excluded_until_end === true
      && /^dpl_[a-zA-Z0-9]+$/.test(declaration.deployment_id ?? '')
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(declaration.http_checked_at ?? '')
      && Date.parse(declaration.http_checked_at) >= Date.parse(maintenance.observed_at)
      && Date.parse(declaration.http_checked_at) <= Date.now(), 'closure_attestation_missing')
    // Keep a closed allowlist: arbitrary operator text never enters reports.
    const attestation = await store.record('closure_attestation', 'operator_declaration_not_automatic_measurement', {
      authenticated_http_503: true, propagation_and_coverage: true, ordinary_api_refusals: true,
      privileged_writers_excluded_until_end: true, ddl_roles_configuration_excluded_until_end: true,
      deployment_id: declaration.deployment_id, http_checked_at: declaration.http_checked_at, worldwide_propagation_verified: false,
      scope: 'operator_authenticated_GET_HEAD_MY503_headers_routes_assets_domain_and_compatible_deployments',
    })
    await guard()
    const rereadMaintenance = await vercel.preflight()
    closedVercel(rereadMaintenance)
    requireProduction(rereadMaintenance.checkpoint === maintenance.checkpoint, 'maintenance_changed_during_closure')
    const drainage = await api.drainage(revision)
    closedFreeze(drainage, revision)
    const drainageRecord = await store.record('drainage', 'PROD4_requireClosed_fresh_TLS_transaction', drainage)
    const evidence = decodeEvidence({ ...bundle.baseEvidence, format: 'my-backup-evidence-v1', environment: 'cloud',
      project: config.project, system_id: bundle.target.system_id, freeze_revision: revision,
      maintenance_checked_at: declaration.http_checked_at, maintenance_evidence: attestation.id,
      freeze_committed_evidence: freezeRecord.id, ordinary_writes_drained_evidence: drainageRecord.id,
      privileged_writers_excluded_until_end: true, privileged_coordination_evidence: attestation.id,
      ddl_roles_configuration_excluded_until_end: true }, bundle.target)
    await store.record('capture_evidence', 'observations_and_explicit_operator_declarations', evidence)
    session.stage = 'closed'
    await store.save()
    await guard()

    // INCOMPLETE is never reused. Complete candidates were handled above;
    // every remaining attempt needs a fresh destination and fresh consent.
    if (last) {
      last.capture = 'incomplete_not_reused'
      await store.save()
    }
    await consent('export', 'Autoriser séparément export sensible intégral (données personnelles, Auth/MFA), chiffré sous M:\\MY-backups. Connexion Cloud déjà autorisée.', 'AUTORISER EXPORT SENSIBLE')
    await store.record('export_authorization', 'operator_explicit_consent_distinct_from_cloud_connection', { sensitive_export: true })
    // Reread after potentially long human interaction; PROD.4 repeats these
    // checks around its snapshot, and checks sequence bounds during export.
    await guard()
    await store.permissions()
    const beforeCapture = await vercel.preflight()
    closedVercel(beforeCapture)
    requireProduction(beforeCapture.checkpoint === maintenance.checkpoint, 'maintenance_changed_before_capture')
    closedFreeze(await api.drainage(revision), revision)
    requireProduction(JSON.stringify(api.repository()) === JSON.stringify(repository), 'source_changed_before_capture')
    const attempt = { id: randomUUID(), directory: join(api.backupRoot, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`),
      freeze_revision: revision, capture: 'running', verify: 'not_started', started_at: new Date().toISOString() }
    session.attempts.push(attempt)
    session.stage = 'capturing'
    await store.save()
    io.progress('4/4 · Capture chiffrée PROD.4 puis verify indépendant.')
    await guard()
    const capture = await api.capture(evidence, attempt.directory)
    await guard()
    requireProduction(capture?.outcome === 'capture_integrity_verified', 'capture_not_verified')
    attempt.capture = 'complete'
    await store.record('capture_result', 'PROD4_capture', capture)
    session.stage = 'verifying'
    attempt.verify = 'running'
    await store.save()
    await guard()
    const verified = await api.verify(attempt.directory)
    await guard()
    verifyArchiveBinding(verified, session, attempt, bundle)
    const finalMaintenance = await vercel.preflight()
    closedVercel(finalMaintenance)
    requireProduction(finalMaintenance.checkpoint === maintenance.checkpoint, 'maintenance_changed_during_capture')
    const finalDrainage = await api.drainage(revision)
    closedFreeze(finalDrainage, revision)
    await guard()
    await store.record('post_verify_closure', 'AUTO2_read_and_PROD4_drainage', { maintenance: finalMaintenance, drainage: finalDrainage })
    attempt.verify = 'complete'
    attempt.manifest_sha256 = verified.manifest_sha256
    attempt.verified_at = new Date().toISOString()
    session.stage = 'verified'
    await store.record('verified_archive', 'PROD4_verify_independent_call', { directory: attempt.directory,
      manifest_sha256: attempt.manifest_sha256, verification: verified.verification })
    await store.permissions()
    await guard()
    return { session: folder, backup: attempt.directory, reused: attempt === last, capture: attempt.capture,
      verify: 'complete', repository: session.repository, restore_proven: false, publication_authorized: false }
  } catch (error) {
    if (state) {
      // Save only fixed diagnostics at the CLI boundary. Raw provider errors or
      // arbitrary exception text never become session evidence.
      state.session.last_failure = { at: new Date().toISOString(), stage: state.session.stage,
        outcome: api.signal?.aborted ? 'interrupted_state_unknown' : 'incomplete_or_unverified',
        next: 'keep_protections_review_session_and_locks_then_rerun' }
      const attempt = state.session.attempts.at(-1)
      if (attempt && state.session.stage === 'capturing') attempt.capture = 'failed_or_unknown'
      if (attempt && state.session.stage === 'verifying') attempt.verify = 'failed_or_unknown'
      if (attempt && state.session.stage === 'rechecking') {
        attempt.recheck = 'failed_or_unknown'
        state.session.stage = 'unverified_after_recheck'
      }
      if (store) await store.save()
    }
    throw error
  } finally {
    // A signal/forced stop retains its marker for independent operator review.
    if (!api.signal?.aborted) await release()
  }
}
