import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

const root = realpathSync(new URL('../../', import.meta.url))
const targetSchema = z.strictObject({
  format: z.literal('my-vercel-maintenance-target-v1'), environment: z.literal('production'),
  project: z.literal('my'), domain: z.literal('my.collectrealm.com'),
  project_id: z.string().regex(/^prj_[a-zA-Z0-9]+$/), team_id: z.string().regex(/^team_[a-zA-Z0-9]+$/),
  global_config_id: z.string().regex(/^ecfg_[a-zA-Z0-9]+$/),
  global_config_slug: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
})

// Only fixed diagnostics cross the operator boundary. Never forward API errors,
// response bodies, request options, env values or arbitrary exception messages.
const diagnostics = new Set(['target_invalid', 'target_unreadable_or_inside_repository', 'arguments_invalid',
  'token_missing_or_invalid', 'unsafe_tls_environment', 'authentication_failed', 'permissions_insufficient',
  'resource_not_found', 'api_conflict_fresh_read_required', 'api_request_rejected', 'network_or_timeout_state_unknown',
  'api_response_invalid', 'unexpected_project_or_protection', 'production_config_binding_unverified',
  'unexpected_domain', 'unexpected_global_config', 'configuration_changed_fresh_read_required',
  'maintenance_value_invalid', 'authorization_required', 'local_operator_busy_or_interrupted',
  'reread_contradicts_update', 'interrupted_state_unknown', 'production_deployment_unconfirmed'])
export class VercelMaintenanceError extends Error {}
export function safeDiagnostic(error) {
  return error instanceof VercelMaintenanceError && diagnostics.has(error.message)
    ? error.message : 'network_or_timeout_state_unknown'
}
export function requireVercel(condition, diagnostic) {
  if (!condition) throw new VercelMaintenanceError(diagnostic)
}
export function decodeTarget(value) {
  const parsed = targetSchema.safeParse(value)
  requireVercel(parsed.success && !JSON.stringify(value).includes('REPLACE'), 'target_invalid')
  return parsed.data
}
export function readTarget(file) {
  try {
    requireVercel(isAbsolute(file), 'target_unreadable_or_inside_repository')
    const path = realpathSync(file)
    const rel = relative(root, path)
    requireVercel(rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      && statSync(path).isFile() && statSync(path).size <= 16_384, 'target_unreadable_or_inside_repository')
    return decodeTarget(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    if (error instanceof VercelMaintenanceError) throw error
    throw new VercelMaintenanceError('target_unreadable_or_inside_repository')
  }
}

export const proofLimits = Object.freeze({
  evidence_scope: 'Vercel_control_plane_only_no_HTTP_or_backend_proof',
  middleware_http: 'not_observed_requires_normal_authenticated_request',
  deployment_coverage: 'not_attested', worldwide_propagation_verified: false,
  supabase_freeze: 'not_observed_or_modified', backup_authorized: false, global_closure: 'not_attested',
})
export function unknownResult(error) {
  return { ...proofLimits, outcome: 'unverified', diagnostic: safeDiagnostic(error),
    state: { maintenance_production: 'unknown' }, recorded: 'unknown', verified: false,
    next: 'fresh_preflight_required_no_automatic_retry_or_reopen' }
}

// Stable per team/store, regardless of target filename or working directory.
// No expiry or stale-PID auto-reclaim: interrupted writes require human review.
export function operatorLockPath(target, directory = join(process.env.LOCALAPPDATA ?? '', 'MY', 'maintenance')) {
  const t = decodeTarget(target)
  requireVercel(isAbsolute(directory), 'local_operator_busy_or_interrupted')
  const key = createHash('sha256').update(`${t.team_id}/${t.global_config_id}`).digest('hex')
  return join(directory, `vercel-${key}.lock`)
}
function acquireLock(target, directory) {
  const file = operatorLockPath(target, directory)
  const nonce = randomUUID()
  let fd
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    fd = openSync(file, 'wx', 0o600)
    writeFileSync(fd, JSON.stringify({ nonce, pid: process.pid, created_at: new Date().toISOString(),
      recovery: 'stop_writers_fresh_preflight_review_then_remove_this_exact_lock' }))
    closeSync(fd)
  } catch {
    if (fd !== undefined) { try { closeSync(fd) } catch { /* Already closed. */ } }
    throw new VercelMaintenanceError('local_operator_busy_or_interrupted')
  }
  return () => {
    requireVercel(JSON.parse(readFileSync(file, 'utf8')).nonce === nonce, 'local_operator_busy_or_interrupted')
    unlinkSync(file)
  }
}

export function createVercelMaintenance(target, token, { authorizeConnect, fetchImpl = globalThis.fetch,
  timeout = 15_000, signal, lockDirectory } = {}) {
  const t = decodeTarget(target)
  requireVercel(authorizeConnect === true, 'authorization_required')
  requireVercel(typeof token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(token), 'token_missing_or_invalid')
  requireVercel(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'unsafe_tls_environment')
  requireVercel(Number.isSafeInteger(timeout) && timeout >= 100 && timeout <= 60_000, 'arguments_invalid')
  const configPath = `/v1/global-config/${t.global_config_id}`
  const projectPath = `/v9/projects/${t.project_id}`
  const identity = { project: t.project, environment: t.environment, project_id: t.project_id,
    team_id: t.team_id, domain: t.domain, global_config_id: t.global_config_id, global_config_slug: t.global_config_slug }

  async function request(path, body) {
    const deadline = new AbortController()
    const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal
    requireVercel(!combined.aborted, 'interrupted_state_unknown')
    const timer = setTimeout(() => deadline.abort(), timeout)
    const url = new URL(path, 'https://api.vercel.com')
    url.searchParams.set('teamId', t.team_id)
    const operation = async () => {
      const response = await fetchImpl(url, { method: body ? 'PATCH' : 'GET', redirect: 'error', cache: 'no-store',
        signal: combined, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (response.status !== 200) {
        // Do not even parse error bodies: they can reflect credentials or config values.
        await response.body?.cancel()
        throw new VercelMaintenanceError(({ 401: 'authentication_failed', 403: 'permissions_insufficient',
          404: 'resource_not_found', 409: 'api_conflict_fresh_read_required', 412: 'api_conflict_fresh_read_required' })[response.status] ?? 'api_request_rejected')
      }
      requireVercel(response.headers.get('content-type')?.includes('application/json'), 'api_response_invalid')
      const reader = response.body.getReader()
      let size = 0
      const chunks = []
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          requireVercel(size <= 2_097_152, 'api_response_invalid')
          chunks.push(value)
        }
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        catch { throw new VercelMaintenanceError('api_response_invalid') }
      } finally { await reader.cancel().catch(() => undefined) }
    }
    let abort
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        abort = () => reject(new VercelMaintenanceError(signal?.aborted ? 'interrupted_state_unknown' : 'network_or_timeout_state_unknown'))
        combined.addEventListener('abort', abort, { once: true })
        if (combined.aborted) abort()
      })])
    } catch (error) {
      if (error instanceof VercelMaintenanceError) throw error
      throw new VercelMaintenanceError(signal?.aborted ? 'interrupted_state_unknown' : 'network_or_timeout_state_unknown')
    } finally {
      clearTimeout(timer)
      if (abort) combined.removeEventListener('abort', abort)
    }
  }

  async function verifyTarget() {
    const project = await request(projectPath)
    requireVercel(project.id === t.project_id && project.name === 'my' && project.accountId === t.team_id
      && project.ssoProtection?.deploymentType === 'all', 'unexpected_project_or_protection')
    const bindings = project.env?.filter(env => env.key === 'GLOBAL_CONFIG'
      && (Array.isArray(env.target) ? env.target.includes('production') : env.target === 'production'))
    requireVercel(bindings?.length === 1 && bindings[0].edgeConfigId === t.global_config_id
      && !bindings[0].gitBranch, 'production_config_binding_unverified')
    const domain = await request(`${projectPath}/domains/${t.domain}`)
    requireVercel(domain.name === t.domain && domain.projectId === t.project_id && domain.verified === true
      && !domain.gitBranch && !domain.redirect && !domain.customEnvironmentId, 'unexpected_domain')
  }
  async function metadata() {
    const value = await request(configPath)
    requireVercel(value.id === t.global_config_id && value.ownerId === t.team_id && value.slug === t.global_config_slug
      && typeof value.digest === 'string' && value.digest.length > 0 && value.digest.length <= 512
      && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0, 'unexpected_global_config')
    // Hash opaque digests instead of logging supplier-controlled content.
    return createHash('sha256').update(JSON.stringify([value.digest, value.updatedAt])).digest('hex')
  }
  async function snapshot() {
    await verifyTarget()
    const before = await metadata()
    const items = await request(`${configPath}/items`)
    requireVercel(Array.isArray(items) && items.every(i => i && i.edgeConfigId === t.global_config_id && typeof i.key === 'string')
      && new Set(items.map(i => i.key)).size === items.length, 'api_response_invalid')
    const after = await metadata()
    requireVercel(before === after, 'configuration_changed_fresh_read_required')
    const item = items.find(i => i.key === 'maintenance_production')
    const valid = typeof item?.value === 'boolean'
    // The checkpoint binds the whole store, not just maintenance. Other values never leave this function.
    const checkpoint = createHash('sha256').update(JSON.stringify([identity, after])).digest('hex')
    const report = { ...proofLimits, identity, state: { maintenance_production: valid ? item.value : 'invalid' },
      checkpoint, control_plane_confirmed: valid, verified: valid, recorded: 'read',
      ...(valid ? {} : { diagnostic: 'maintenance_value_invalid' }), observed_at: new Date().toISOString() }
    return { report, items: items.sort((a, b) => a.key.localeCompare(b.key)) }
  }
  async function preflight() { return (await snapshot()).report }

  // Alias resolution proves current domain assignment, unlike READY alone.
  // Provider responses can contain secrets: expose only these validated fields.
  async function publication(deploymentId) {
    requireVercel(/^dpl_[a-zA-Z0-9]+$/.test(deploymentId), 'arguments_invalid')
    await verifyTarget()
    const aliasPath = `/v4/aliases/${t.domain}`
    const before = await request(aliasPath)
    const deployment = await request(`/v13/deployments/${deploymentId}?withGitRepoInfo=true`)
    const after = await request(aliasPath)
    requireVercel([before, after].every(a => a.alias === t.domain && a.projectId === t.project_id
      && a.deploymentId === deploymentId && (!a.deployment || a.deployment.id === deploymentId)
      && !a.redirect && !a.microfrontends)
      && before.updatedAt === after.updatedAt && deployment.id === deploymentId
      && deployment.projectId === t.project_id && deployment.target === 'production'
      && deployment.readyState === 'READY' && deployment.aliasAssigned === true
      && !deployment.aliasError && deployment.alias?.includes(t.domain)
      && /^[a-f0-9]{40}$/.test(deployment.gitSource?.sha)
      && deployment.gitSource.ref === 'main'
      && (!deployment.meta?.githubCommitSha || deployment.meta.githubCommitSha === deployment.gitSource.sha),
    'production_deployment_unconfirmed')
    return { identity, deployment_id: deploymentId, commit: deployment.gitSource.sha,
      domain_assignment: 'confirmed_by_fresh_alias_reads', target: 'production', ready: true,
      observed_at: new Date().toISOString(), evidence_scope: 'control_plane_not_served_frontend_or_no_rebuild_proof' }
  }

  async function setMaintenance(action, consent, emit = () => undefined) {
    requireVercel(['close', 'reopen'].includes(action) && consent?.exclusiveWriter === true
      && /^[a-f0-9]{64}$/.test(consent?.checkpoint ?? '')
      && (action === 'close' ? consent.authorizeClose === true && consent.authorizeReopen !== true
        : consent.authorizeReopen === true && consent.authorizeClose !== true), 'authorization_required')
    const release = acquireLock(t, lockDirectory)
    // Keep the marker on ANY failure. Never attempt compensation or another PATCH.
    const before = await snapshot()
    requireVercel(before.report.control_plane_confirmed, 'maintenance_value_invalid')
    requireVercel(before.report.checkpoint === consent.checkpoint, 'configuration_changed_fresh_read_required')
    const desired = action === 'close'
    const changed = before.report.state.maintenance_production !== desired
    emit({ ...proofLimits, identity, action, requested: true, recorded: 'unknown', verified: false })
    // Check the complete identity/config again, including idempotent calls.
    // This is detection under declared writer exclusion, NOT atomic CAS.
    const ready = await snapshot()
    requireVercel(ready.report.checkpoint === consent.checkpoint && ready.report.control_plane_confirmed
      && isDeepStrictEqual(ready.items, before.items), 'configuration_changed_fresh_read_required')
    if (changed) {
      const acknowledgement = await request(`${configPath}/items`, { items: [
        { operation: 'update', key: 'maintenance_production', value: desired },
      ] })
      requireVercel(acknowledgement?.status === 'ok', 'api_response_invalid')
      emit({ ...proofLimits, identity, action, requested: true, recorded: 'api_acknowledged', verified: false })
    }
    // New uncached requests, not the mutation response. No automatic retry.
    const after = await snapshot()
    const untouched = items => items.filter(i => i.key !== 'maintenance_production').sort((a, b) => a.key.localeCompare(b.key))
    const productionMetadata = items => {
      const other = { ...items.find(i => i.key === 'maintenance_production') }
      delete other.value
      delete other.updatedAt
      return other
    }
    requireVercel(after.report.control_plane_confirmed && after.report.state.maintenance_production === desired
      && (changed || after.report.checkpoint === consent.checkpoint)
      && isDeepStrictEqual(untouched(before.items), untouched(after.items))
      && isDeepStrictEqual(productionMetadata(before.items), productionMetadata(after.items)), 'reread_contradicts_update')
    release()
    return { ...after.report, action, requested: true, recorded: changed ? 'reread_confirmed' : 'already_satisfied',
      changed, idempotent: !changed, independent_read: true, concurrency: 'local_lock_and_operator_exclusivity_not_atomic_CAS' }
  }

  return { preflight, setMaintenance, publication }
}
