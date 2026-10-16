import { readFileSync, realpathSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { decodeTarget, decodeExternal, evidenceSchema, protectedParent, root } from '../backup/contract.js'
import { checkedCA, checkedNativePath } from '../backup/native.js'
import { versions } from '../backup/clients.js'
import { cloudProject, readCloudTarget, cloudConnectionConfig } from '../maintenance/cloud.js'
import { readTarget } from '../maintenance/vercel.js'
import { hashBytes } from '../backup/secure-files.js'

export class ProductionError extends Error {}
export function requireProduction(condition, code) {
  if (!condition) throw new ProductionError(code)
}
export const backupRoot = 'M:\\MY-backups'
const path = z.string().refine(isAbsolute)
const reference = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/).refine(v => !v.includes('REPLACE'))
export const configSchema = z.strictObject({
  format: z.literal('my-production-backup-v1'), project: z.literal(cloudProject),
  maintenance_target: path, vercel_target: path, backup_target: path,
  evidence: path, external: path, key_file: path, sessions_directory: path,
  volume_serial: z.string().regex(/^[A-F0-9]{8}$/), encrypted_volume_evidence: reference,
})
// Only these fields can be completed by fresh AUTO.3 observations/consents.
const contemporary = { environment: true, project: true, system_id: true, freeze_revision: true,
  maintenance_checked_at: true, maintenance_evidence: true, freeze_committed_evidence: true,
  ordinary_writes_drained_evidence: true, privileged_writers_excluded_until_end: true,
  privileged_coordination_evidence: true, ddl_roles_configuration_excluded_until_end: true }

export function outsideFile(file) {
  requireProduction(isAbsolute(file), 'configuration_absolute_path_required')
  const actual = realpathSync(file)
  const rel = relative(root, actual)
  requireProduction(rel && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)), 'configuration_must_be_outside_git')
  for (let part = resolve(file); part !== parse(part).root; part = dirname(part)) {
    requireProduction(!lstatSync(part).isSymbolicLink(), 'reparse_path_refused')
  }
  requireProduction(lstatSync(actual).isFile() && lstatSync(actual).size <= 1_048_576, 'configuration_file_invalid')
  return actual
}
export function readConfiguration(file) {
  return JSON.parse(readFileSync(outsideFile(file), 'utf8'))
}
export function configurationBundle(file) {
  const config = configSchema.parse(readConfiguration(file))
  const maintenance = readCloudTarget(outsideFile(config.maintenance_target))
  const vercel = readTarget(outsideFile(config.vercel_target))
  const target = decodeTarget(readConfiguration(config.backup_target), 'cloud', cloudProject)
  requireProduction(['system_id', 'host', 'port', 'database', 'user', 'ca_file', 'ca_sha256']
    .every(k => target[k] === maintenance[k]), 'maintenance_backup_targets_differ')
  const baseEvidence = evidenceSchema.omit(contemporary).parse(Object.fromEntries(
    Object.entries(readConfiguration(config.evidence)).filter(([k]) => !contemporary[k])))
  const external = decodeExternal(readConfiguration(config.external), cloudProject)
  outsideFile(config.key_file)
  const keyRelative = relative(backupRoot, config.key_file)
  requireProduction(keyRelative === '..' || keyRelative.startsWith(`..${sep}`) || isAbsolute(keyRelative), 'key_must_be_separate_from_backup')
  const volume = external.records[config.encrypted_volume_evidence]
  requireProduction(volume?.volume_serial === config.volume_serial && volume.encrypted_at_rest === true
    && volume.unsynchronized_destination === true && volume.provenance === 'operator_verified'
    && z.iso.datetime().safeParse(volume.recorded_at).success && Date.parse(volume.recorded_at) <= Date.now(),
  'encrypted_volume_operator_record_missing')
  const fingerprint = hashBytes(JSON.stringify({ config, maintenance, vercel, target, baseEvidence, external }))
  return { config, maintenance, vercel, target, baseEvidence, external, fingerprint }
}

export function verifyMountedVolume(config) {
  checkedNativePath(backupRoot, true)
  protectedParent(backupRoot)
  // Mounted-volume identity is automatic. Encryption provenance remains an
  // explicit, permanent operator record; a drive letter does not prove encryption.
  const serial = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference='Stop'; $v=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='M:'\"; if (!$v -or $v.DriveType -ne 3) { exit 1 }; $v.VolumeSerialNumber"],
  { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  requireProduction(serial === config.volume_serial, 'encrypted_volume_identity_mismatch')
}

export async function preflightStorage(bundle, password) {
  requireProduction(process.platform === 'win32', 'windows_operator_required')
  const { config, target, maintenance } = bundle
  verifyMountedVolume(config)
  checkedNativePath(config.sessions_directory, true)
  protectedParent(config.sessions_directory)
  requireProduction(parse(config.sessions_directory).root.toLowerCase() !== 'm:\\', 'session_must_be_separate_from_backup_volume')
  checkedCA(target)
  cloudConnectionConfig(maintenance, password) // CA, inherited PG/TLS options, no network.
  await versions(target) // Pinned existing clients; no database connection.
}
