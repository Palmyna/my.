import { promises as fs } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { restrictDirectory } from '../backup/secure-files.js'
import { requireProduction } from './config.js'
import { protectedParent } from '../backup/contract.js'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export async function exists(file) {
  try { await fs.lstat(file); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e }
}
async function writeNew(file, value) {
  const handle = await fs.open(file, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync() }
  finally { await handle.close() }
}
export async function saveSession(directory, session) {
  const temporary = join(directory, `state-${randomUUID()}.tmp`)
  await writeNew(temporary, session)
  await fs.rename(temporary, join(directory, 'session.json'))
}
export async function loadSession(directory) {
  const pointer = join(directory, 'current.json')
  if (!await exists(pointer)) {
    requireProduction(!(await fs.readdir(directory)).some(name => uuid.test(name)), 'session_pointer_missing_review_required')
    return undefined
  }
  const { id } = JSON.parse(await fs.readFile(pointer, 'utf8'))
  requireProduction(uuid.test(id), 'session_pointer_invalid')
  const folder = join(directory, id)
  requireProduction(!(await fs.lstat(pointer)).isSymbolicLink() && !(await fs.lstat(folder)).isSymbolicLink()
    && !(await fs.lstat(join(folder, 'session.json'))).isSymbolicLink(), 'session_reparse_path_refused')
  const session = JSON.parse(await fs.readFile(join(folder, 'session.json'), 'utf8'))
  requireProduction(session.format === 'my-production-session-v1' && session.id === id
    && Array.isArray(session.attempts) && Array.isArray(session.records), 'session_invalid')
  for (const ref of session.records) {
    requireProduction(typeof ref.id === 'string' && ref.id.startsWith('auto3-') && uuid.test(ref.id.slice(6)), 'session_evidence_reference_invalid')
    const file = join(folder, `${ref.id}.json`)
    requireProduction(await exists(file), 'session_evidence_file_missing')
    const stat = await fs.lstat(file)
    requireProduction(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_048_576, 'session_evidence_file_invalid')
    const entry = JSON.parse(await fs.readFile(file, 'utf8'))
    requireProduction(entry.id === ref.id && entry.kind === ref.kind && entry.provenance === ref.provenance
      && entry.recorded_at === ref.recorded_at, 'session_evidence_reference_mismatch')
  }
  return { folder, session }
}
export async function createSession(directory, repository, fingerprint, project) {
  const id = randomUUID(), folder = join(directory, id)
  await fs.mkdir(folder, { mode: 0o700 })
  await restrictDirectory(folder)
  const session = { format: 'my-production-session-v1', id, project, repository, fingerprint,
    created_at: new Date().toISOString(), stage: 'prepared', attempts: [], records: [],
    restore_proven: false, production_recovery_proven: false, publication_authorized: false }
  await saveSession(folder, session)
  await writeNew(join(directory, 'current.json'), { id })
  return { folder, session }
}
export async function record(folder, session, kind, provenance, value) {
  const entry = { id: `auto3-${randomUUID()}`, kind, provenance, recorded_at: new Date().toISOString(), value }
  await writeNew(join(folder, `${entry.id}.json`), entry)
  session.records.push({ id: entry.id, kind, provenance, recorded_at: entry.recorded_at })
  await saveSession(folder, session)
  return entry
}
export async function lockSession(directory) {
  requireProduction(isAbsolute(directory), 'operator_lock_absolute_path_required')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  protectedParent(directory)
  await restrictDirectory(directory)
  const file = join(directory, 'prod-backup.lock'), nonce = randomUUID()
  try { await writeNew(file, { nonce, pid: process.pid, created_at: new Date().toISOString(),
    recovery: 'inspect_process_and_session_then_manually_remove_only_this_exact_lock' }) }
  catch { requireProduction(false, 'operator_busy_or_interrupted_review_exact_lock') }
  return async () => {
    requireProduction(JSON.parse(await fs.readFile(file, 'utf8')).nonce === nonce, 'operator_lock_changed')
    await fs.unlink(file)
  }
}
