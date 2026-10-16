import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { promises as fs } from 'node:fs'
import { verify } from '../backup/cli.js'
import { decryptJson, fileHash } from '../backup/secure-files.js'
import { checkedNativePath } from '../backup/native.js'
import { verifyMountedVolume, requireProduction } from './config.js'

export function verifyArchiveBinding(result, session, attempt, bundle) {
  const { manifest, evidence, verification, manifest_sha256 } = result
  requireProduction(verification?.outcome === 'capture_integrity_verified' && verification.restore_proven === false
    && verification.publication_authorized === false, 'independent_verify_failed')
  requireProduction(manifest.environment === 'cloud' && manifest.project === session.project
    && manifest.identity.system_id === bundle.target.system_id
    && isDeepStrictEqual(manifest.target, bundle.target)
    && manifest.repository.head === session.repository.head && manifest.repository.version === session.repository.version
    && manifest.repository.dirty === false && evidence.freeze_revision === attempt.freeze_revision
    && /^[a-f0-9]{64}$/.test(manifest_sha256)
    && (!attempt.manifest_sha256 || attempt.manifest_sha256 === manifest_sha256), 'archive_session_binding_mismatch')
  for (const key of ['maintenance_evidence', 'freeze_committed_evidence', 'ordinary_writes_drained_evidence', 'privileged_coordination_evidence']) {
    requireProduction(session.records.some(r => r.id === evidence[key]), 'archive_evidence_provenance_missing')
  }
}

// Existing PROD.4 verification only: no capture, connection or restoration.
export function archiveVerifier(bundle, key) {
  return async directory => {
    verifyMountedVolume(bundle.config)
    checkedNativePath(directory, true)
    const before = (await fileHash(join(directory, 'manifest.myb'))).sha256
    const verification = await verify(directory, key)
    const manifest = await decryptJson(join(directory, 'manifest.myb'), key)
    const evidence = await decryptJson(join(directory, 'evidence.json.myb'), key)
    const after = (await fileHash(join(directory, 'manifest.myb'))).sha256
    requireProduction(before === after, 'archive_changed_during_verify')
    return { verification, manifest, evidence, manifest_sha256: after }
  }
}

export async function archiveFingerprint(directory, manifest) {
  requireProduction(Array.isArray(manifest?.files) && manifest.files.length > 0 && manifest.files.length <= 32
    && manifest.files.every(f => /^[a-z0-9.-]+\.myb$/.test(f.name) && /^[a-f0-9]{64}$/.test(f.sha256)
      && Number.isSafeInteger(f.bytes) && f.bytes > 0), 'archive_session_binding_mismatch')
  const names = (await fs.readdir(directory)).sort()
  requireProduction(isDeepStrictEqual(names, ['manifest.myb', ...manifest.files.map(f => f.name)].sort()), 'archive_incomplete')
  const manifestStat = await fs.lstat(join(directory, 'manifest.myb'))
  requireProduction(manifestStat.isFile() && !manifestStat.isSymbolicLink(), 'archive_changed_during_verify')
  const before = (await fileHash(join(directory, 'manifest.myb'))).sha256
  for (const file of manifest.files) {
    const path = join(directory, file.name), stat = await fs.lstat(path)
    requireProduction(stat.isFile() && !stat.isSymbolicLink(), 'archive_changed_during_verify')
    const actual = await fileHash(path)
    requireProduction(actual.sha256 === file.sha256 && actual.bytes === file.bytes, 'archive_changed_during_verify')
  }
  requireProduction((await fileHash(join(directory, 'manifest.myb'))).sha256 === before, 'archive_changed_during_verify')
  return before
}
