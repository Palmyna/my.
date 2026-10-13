import { z } from 'zod'
import { readFileSync, realpathSync, lstatSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'

export class BackupError extends Error {}
export function requireBackup(condition, diagnostic) {
  if (!condition) throw new BackupError(diagnostic)
}
export const decimal = z.string().regex(/^(0|[1-9]\d*)$/)
export const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/).refine(v=>!v.includes('REPLACE'))
const absolutePath = z.string().refine(isAbsolute)
export const targetSchema = z.strictObject({
  format: z.literal('my-backup-target-v1'), environment: z.enum(['cloud', 'isolated']),
  project: z.string().regex(/^[a-z0-9-]{3,40}$/), host: z.string(), port: z.number().int(),
  database: z.literal('postgres'), user: z.string(), system_id: decimal,
  postgres_major: z.number().int().min(17).max(18),
  client_image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  ca_file: absolutePath.nullable(), ca_sha256: sha256.nullable(),
  isolated_container: z.string().regex(/^my-prod4-test-[a-f0-9]{12}$/).nullable(),
})
export function decodeTarget(value, environment, project) {
  const parsed = targetSchema.safeParse(value)
  requireBackup(parsed.success, 'target_configuration_invalid')
  const t = parsed.data
  requireBackup(t.environment === environment && t.project === project, 'target_selection_mismatch')
  if (environment === 'cloud') {
    requireBackup(/^[a-z]{20}$/.test(project) && t.port === 5432 && t.ca_file && t.ca_sha256
      && t.isolated_container === null
      && ((t.host === `db.${project}.supabase.co` && t.user === 'postgres')
        || (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(t.host) && t.user === `postgres.${project}`)),
    'cloud_target_requires_direct_or_session_TLS_connection')
  } else {
    requireBackup(environment === 'isolated' && /^my-prod4-test-[a-f0-9]{12}$/.test(project)
      && t.project === t.isolated_container && t.host === '127.0.0.1' && t.port > 1024 && t.port < 65536
      && t.user === 'postgres' && t.ca_file === null && t.ca_sha256 === null, 'isolated_target_required')
  }
  return t
}
export const evidenceSchema = z.strictObject({
  format: z.literal('my-backup-evidence-v1'), environment: z.enum(['cloud', 'isolated']), project: z.string(),
  system_id: decimal, freeze_revision: decimal, maintenance_checked_at: z.iso.datetime(),
  maintenance_evidence: reference, freeze_committed_evidence: reference,
  ordinary_writes_drained_evidence: reference, privileged_writers_excluded_until_end: z.literal(true),
  privileged_coordination_evidence: reference, ddl_roles_configuration_excluded_until_end: z.literal(true),
  auth_consistency: z.literal('postgresql_snapshot_external_keys_separate_sessions_reauth_required'),
  storage_and_vault_expected_empty: z.literal(true), storage_configuration_evidence: reference,
  protected_storage_evidence: reference, unsynchronized_destination: z.literal(true),
  key_saved_separately_evidence: reference,
})
export function decodeEvidence(value, target) {
  const parsed = evidenceSchema.safeParse(value)
  requireBackup(parsed.success, 'closure_evidence_missing_or_invalid')
  const e = parsed.data
  requireBackup(e.environment === target.environment && e.project === target.project && e.system_id === target.system_id,
    'closure_evidence_target_mismatch')
  requireBackup(Date.parse(e.maintenance_checked_at) <= Date.now(), 'closure_evidence_future_bound_invalid')
  return e
}
// References locate secrets in a separately protected store. No secret values belong here.
export const externalSchema = z.strictObject({
  format: z.literal('my-backup-external-v1'), project: z.string(),
  configuration: z.strictObject({
    auth: z.strictObject({ site_url: z.url(), redirect_urls: z.array(z.url()), providers: z.array(reference),
      jwt_expiry_seconds: z.number().int().positive(), signup_enabled: z.boolean(), email_confirmation: z.boolean(),
      auth_service_version: reference, configuration_evidence: reference }),
    smtp: z.strictObject({ provider: z.literal('Resend'), host: reference, port: z.number().int().positive(),
      sender_evidence: reference, templates_evidence: reference }),
    mfa: z.strictObject({ totp_enabled: z.boolean(), max_factors: z.number().int().positive(), evidence: reference }),
    data_api: z.strictObject({ schemas: z.array(reference).min(1), settings_evidence: reference }),
    network: z.strictObject({ restrictions_evidence: reference, TLS_certificate_evidence: reference }),
    integrations: z.strictObject({ github_supabase_evidence: reference, vercel_evidence: reference,
      other_writers_inventory_evidence: reference }),
    edge: z.strictObject({ name: z.literal('delete-account'), deployed_source_sha256: sha256,
      deployed_configuration_evidence: reference }),
    encryption: z.strictObject({ vault: z.literal('not_used'), column_encryption: z.literal('not_used'),
      auth_key_reprovisioning_evidence: reference, signing_keys_reprovisioning_evidence: reference }),
    storage: z.strictObject({ usage: z.literal('not_used'), service_configuration_evidence: reference }),
  }),
  secret_store_refs: z.strictObject({ database_password: reference, publisher_password: reference,
    SMTP_Resend: reference, auth_encryption_keys: reference, signing_keys: reference,
    SUPABASE_URL: reference, SUPABASE_ANON_KEY: reference, SUPABASE_SERVICE_ROLE_KEY: reference }),
  records: z.record(reference,z.record(z.string(),z.json()).refine(v=>Object.keys(v).length>0)),
})
export function configurationReferences(configuration) {
  const result=[]
  function visit(object) {
    for (const [key,value] of Object.entries(object)) {
      if (key === 'evidence' || key.endsWith('_evidence')) result.push(value)
      else if (value && typeof value === 'object' && !Array.isArray(value)) visit(value)
    }
  }
  visit(configuration)
  return [...new Set(result)].sort()
}
export function decodeExternal(value, project) {
  const parsed = externalSchema.safeParse(value)
  requireBackup(parsed.success && parsed.data.project === project, 'external_inventory_incomplete')
  requireBackup(configurationReferences(parsed.data.configuration).every(ref=>Object.hasOwn(parsed.data.records,ref)),
    'external_configuration_record_missing')
  return parsed.data
}
export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { throw new BackupError('configuration_unreadable') }
}
export const root = realpathSync(new URL('../../', import.meta.url))
function within(base, path) {
  const r = relative(base, path)
  return !r || (!r.startsWith('..') && !isAbsolute(r))
}
export function protectedParent(path) {
  const parent = realpathSync(path)
  requireBackup(!within(root, parent) && !within(parent, root), 'backup_must_be_outside_repository')
  for (const name of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial', 'GOOGLE_DRIVE']) {
    if (process.env[name]) requireBackup(!within(resolve(process.env[name]), parent), 'synchronized_storage_refused')
  }
  requireBackup(!/(?:^|[\\/])(?:onedrive[^\\/]*|google drive|googledrive|dropbox)(?:[\\/]|$)/i.test(parent),
    'synchronized_storage_refused')
  requireBackup(lstatSync(parent).isDirectory(), 'backup_parent_not_directory')
  return parent
}
export function diagnostic(error) {
  return error instanceof BackupError ? error.message : 'backup_failed_details_suppressed'
}
