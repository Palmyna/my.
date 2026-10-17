import { promises as fs } from 'node:fs'
import { join, isAbsolute, dirname, parse, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { restrictDirectory } from '../backup/secure-files.js'
import { requireProduction } from './config.js'
import { protectedParent } from '../backup/contract.js'
import { hashBytes, fileHash, verifyPrivatePaths } from '../backup/secure-files.js'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export async function exists(file) {
  try { await fs.lstat(file); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e }
}
async function writeNew(file, value) {
  const handle = await fs.open(file, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync() }
  finally { await handle.close() }
}
const json = value => JSON.stringify(value, null, 2) + '\n'
const sameSuccessor = (session, initial) => ['format', 'id', 'project', 'repository', 'fingerprint', 'created_at', 'source_release', 'succession']
  .every(key => isDeepStrictEqual(session[key], initial[key]))
const stagedSession = journal => ({ ...journal.successor,
  succession: { ...journal.successor.succession, journal_sha256: journal.file_sha256 } })

async function privateFolderSnapshot(folder) {
  protectedParent(folder)
  for (let part = resolve(folder); part !== parse(part).root; part = dirname(part)) {
    requireProduction(!(await fs.lstat(part)).isSymbolicLink(), 'session_reparse_path_refused')
  }
  const stat = await fs.lstat(folder)
  requireProduction(stat.isDirectory(), 'session_succession_archive_uncertain')
  const names = (await fs.readdir(folder)).sort(), files = []
  for (const name of names) {
    const file = join(folder, name), before = await fs.lstat(file)
    requireProduction(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, 'session_succession_archive_uncertain')
    const hash = await fileHash(file), after = await fs.lstat(file)
    requireProduction(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
      && hash.bytes === after.size, 'session_succession_predecessor_changed')
    files.push({ name, ...hash })
  }
  await verifyPrivatePaths([folder, ...names.map(name => join(folder, name))])
  requireProduction(isDeepStrictEqual(names, (await fs.readdir(folder)).sort()), 'session_succession_predecessor_changed')
  return { directory: folder, identity: { dev: stat.dev, ino: stat.ino, birthtime_ms: stat.birthtimeMs }, files }
}

// No decrypt, SQL, or provider access. Every attempt, not only the last, must
// be unambiguously incomplete. Even a manifest alongside INCOMPLETE blocks.
export async function incompleteSnapshot(state, backupRoot) {
  const { session, folder } = state
  const repository = session.repository
  requireProduction(session.stage === 'capturing' && repository?.branch === 'dev' && repository.dirty === false
    && repository.environment === 'cloud' && repository.project === session.project
    && /^[a-f0-9]{40}$/.test(repository.head) && typeof repository.version === 'string'
    && /^[a-f0-9]{64}$/.test(session.fingerprint) && Number.isFinite(Date.parse(session.created_at))
    && session.publication_authorized === false && session.restore_proven === false && session.production_recovery_proven === false
    && !Object.keys(session).some(key => key.startsWith('open_') || key === 'completed_at')
    && session.attempts.length > 0, 'session_succession_not_eligible')
  const kinds = new Set(['connection_authorization', 'close_authorization', 'maintenance', 'freeze', 'closure_attestation',
    'drainage', 'capture_evidence', 'export_authorization', 'session_succession'])
  requireProduction(session.records.every(r => kinds.has(r.kind)), 'session_succession_not_eligible')
  requireProduction(isAbsolute(backupRoot) && session.attempts.every(a => typeof a.directory === 'string'
    && dirname(a.directory) === backupRoot && /[\\/]backup-[a-zA-Z0-9-]+$/.test(a.directory))
    && new Set(session.attempts.map(a => a.directory)).size === session.attempts.length, 'session_backup_path_invalid')
  const archives = []
  for (const attempt of session.attempts) {
    requireProduction(uuid.test(attempt.id) && ['running', 'failed_or_unknown', 'incomplete_not_reused'].includes(attempt.capture)
      && attempt.verify === 'not_started' && !('manifest_sha256' in attempt) && !('verified_at' in attempt)
      && !('recheck' in attempt), 'session_succession_not_eligible')
    const archive = await privateFolderSnapshot(attempt.directory)
    const names = archive.files.map(f => f.name)
    requireProduction(!names.includes('manifest.myb'), 'session_succession_archive_candidate_refused')
    requireProduction(names.includes('INCOMPLETE') && names.every(name => name === 'INCOMPLETE'
      || ['database.dump.myb', 'inventory.json.myb', 'external.json.myb', 'evidence.json.myb', 'source.tar.myb', 'toc.txt.myb'].includes(name)),
    'session_succession_archive_uncertain')
    archives.push(archive)
  }
  const files = await privateFolderSnapshot(folder)
  requireProduction(isDeepStrictEqual(files.files.map(f => f.name).sort(), ['session.json', ...session.records.map(r => `${r.id}.json`)].sort()),
    'session_succession_unreferenced_files_review_required')
  requireProduction(files.files.find(f => f.name === 'session.json').sha256 === hashBytes(json(session)),
    'session_succession_predecessor_changed')
  return { id: session.id, session: structuredClone(session), files, archives }
}

async function readSuccession(directory, name) {
  try {
    const file = join(directory, name), stat = await fs.lstat(file)
    requireProduction(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_048_576, 'session_succession_invalid_review_required')
    await verifyPrivatePaths([directory, file])
    const bytes = await fs.readFile(file), journal = JSON.parse(bytes.toString('utf8'))
    const { successor, entry } = journal, proof = entry.value
    requireProduction(journal.format === 'my-production-session-succession-transaction-v1'
      && name === `succession-${successor.id}.json` && uuid.test(successor.id) && uuid.test(proof.predecessor.id)
      && successor.id !== proof.predecessor.id && proof.format === 'my-production-session-succession-v1'
      && entry.kind === 'session_succession' && entry.provenance === 'operator_explicit_succession_consent'
      && typeof entry.id === 'string' && entry.id.startsWith('auto3-') && uuid.test(entry.id.slice(6))
      && proof.reason === 'incomplete_backup_tooling_correction' && proof.authorized === true
      && proof.authorization === 'AUTORISER SUCCESSION' && proof.processes_and_children_reviewed_stopped === true
      && entry.recorded_at === successor.created_at && Number.isFinite(Date.parse(entry.recorded_at))
      && proof.successor_id === successor.id && isDeepStrictEqual(proof.repository, successor.repository)
      && proof.project === successor.project && proof.fingerprint === successor.fingerprint
      && proof.predecessor.session.project === successor.project && proof.predecessor.session.fingerprint === successor.fingerprint
      && proof.predecessor.session.repository.head !== successor.repository.head
      && successor.repository.branch === 'dev' && successor.repository.dirty === false
      && successor.repository.environment === 'cloud' && successor.repository.project === successor.project
      && /^[a-f0-9]{40}$/.test(successor.repository.head) && successor.source_release.version === successor.repository.version
      && /^[a-f0-9]{64}$/.test(successor.source_release.changelog.file_sha256)
      && isDeepStrictEqual(successor.succession, { predecessor_id: proof.predecessor.id, record_id: entry.id })
      && successor.stage === 'prepared' && successor.attempts.length === 0 && successor.records.length === 1
      && successor.records[0].sha256 === hashBytes(json(entry))
      && successor.records[0].id === entry.id && successor.records[0].kind === entry.kind
      && successor.records[0].provenance === entry.provenance && successor.records[0].recorded_at === entry.recorded_at
      && successor.publication_authorized === false && successor.restore_proven === false && successor.production_recovery_proven === false,
    'session_succession_invalid_review_required')
    return { ...journal, file_sha256: hashBytes(bytes) }
  } catch { requireProduction(false, 'session_succession_invalid_review_required') }
}

async function checkStagedSuccessor(directory, journal) {
  const folder = join(directory, journal.successor.id)
  if (!await exists(folder)) return
  const stat = await fs.lstat(folder)
  requireProduction(stat.isDirectory() && !stat.isSymbolicLink(), 'session_succession_invalid_review_required')
  const values = new Map([['session.json', stagedSession(journal)], [`${journal.entry.id}.json`, journal.entry]])
  const names = await fs.readdir(folder)
  await verifyPrivatePaths([folder, ...names.map(name => join(folder, name))])
  for (const name of names) {
    const file = join(folder, name), stat = await fs.lstat(file)
    requireProduction(values.has(name) && stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_048_576
      && await fs.readFile(file, 'utf8') === json(values.get(name)), 'session_succession_partial_review_required')
  }
}

// Planning never writes. A pending authorized intent always keeps its UUID and
// source. No new intent can be created beside it, even after another commit.
export async function planSuccession(directory, previous, repository, sourceRelease, backupRoot, fingerprint, project) {
  requireProduction(previous.folder === join(directory, previous.session.id), 'session_succession_invalid_review_required')
  await verifyPrivatePaths([directory, join(directory, 'current.json')])
  requireProduction(previous.session.project === project && previous.session.fingerprint === fingerprint,
    'session_configuration_changed_review_required')
  requireProduction(repository.branch === 'dev' && repository.dirty === false && /^[a-f0-9]{40}$/.test(repository.head)
    && repository.head !== previous.session.repository.head && repository.version === sourceRelease?.version
    && /^[a-f0-9]{64}$/.test(sourceRelease?.changelog?.file_sha256), 'clean_committed_dev_source_required')
  const predecessor = await incompleteSnapshot(previous, backupRoot)
  if (previous.pending) {
    const journal = previous.pending
    requireProduction(isDeepStrictEqual(journal.successor.repository, repository)
      && isDeepStrictEqual(journal.successor.source_release, sourceRelease)
      && journal.entry.value.backup_root === backupRoot && isDeepStrictEqual(journal.entry.value.predecessor, predecessor),
    'session_succession_pending_source_changed_review_required')
    return journal
  }
  const id = randomUUID(), recorded_at = new Date().toISOString()
  const entry = { id: `auto3-${randomUUID()}`, kind: 'session_succession', provenance: 'operator_explicit_succession_consent', recorded_at,
    value: { format: 'my-production-session-succession-v1', predecessor, successor_id: id, repository, project, fingerprint, backup_root: backupRoot,
      reason: 'incomplete_backup_tooling_correction', authorized: true, authorization: 'AUTORISER SUCCESSION', processes_and_children_reviewed_stopped: true } }
  const successor = { ...newSession(id, repository, fingerprint, project, recorded_at), source_release: sourceRelease,
    succession: { predecessor_id: predecessor.id, record_id: entry.id }, records: [{ id: entry.id, kind: entry.kind,
      provenance: entry.provenance, recorded_at, sha256: hashBytes(json(entry)) }] }
  const journal = { format: 'my-production-session-succession-transaction-v1', successor, entry }
  requireProduction(Buffer.byteLength(json(journal)) <= 1_048_576, 'session_succession_invalid_review_required')
  return journal
}

// Caller holds AUTO.3 lock and has obtained a fresh, distinct operator consent.
// Revalidate after each durable phase. Never edit/delete the predecessor, its
// markers, orphan files, or the permanent write-ahead journal.
export async function commitSuccession(directory, previous, plan, revalidate) {
  const file = join(directory, `succession-${plan.successor.id}.json`)
  await revalidate()
  if (!previous.pending) {
    const recorded_at = new Date().toISOString()
    plan.entry.recorded_at = recorded_at
    plan.successor.created_at = recorded_at
    Object.assign(plan.successor.records[0], { recorded_at, sha256: hashBytes(json(plan.entry)) })
    await writeNew(file, plan)
  }
  const journal = await readSuccession(directory, `succession-${plan.successor.id}.json`)
  requireProduction(isDeepStrictEqual(journal.entry, plan.entry) && isDeepStrictEqual(journal.successor, plan.successor),
    'session_succession_invalid_review_required')
  await revalidate()
  await checkStagedSuccessor(directory, journal)
  const folder = join(directory, journal.successor.id)
  if (!await exists(folder)) { await fs.mkdir(folder, { mode: 0o700 }); await restrictDirectory(folder) }
  const recordFile = join(folder, `${journal.entry.id}.json`)
  if (!await exists(recordFile)) await writeNew(recordFile, journal.entry)
  await revalidate()
  if (!await exists(join(folder, 'session.json'))) await writeNew(join(folder, 'session.json'), stagedSession(journal))
  await checkStagedSuccessor(directory, journal)
  const temporary = join(directory, `pointer-${randomUUID()}.tmp`)
  await writeNew(temporary, { id: journal.successor.id })
  await verifyPrivatePaths([directory, join(directory, 'current.json'), file, folder, recordFile, join(folder, 'session.json'), temporary])
  await revalidate()
  await fs.rename(temporary, join(directory, 'current.json'))
  return loadSession(directory)
}

function newSession(id, repository, fingerprint, project, created_at = new Date().toISOString()) {
  return { format: 'my-production-session-v1', id, project, repository, fingerprint,
    created_at, stage: 'prepared', attempts: [], records: [],
    restore_proven: false, production_recovery_proven: false, publication_authorized: false }
}
export async function saveSession(directory, session) {
  const temporary = join(directory, `state-${randomUUID()}.tmp`)
  await writeNew(temporary, session)
  await fs.rename(temporary, join(directory, 'session.json'))
}
export async function loadSession(directory, { allowPendingSuccession = false } = {}) {
  const state = await readCurrent(directory)
  if (!state) return undefined
  const pending = await checkHistoricalSessions(directory, state.session.id, allowPendingSuccession)
  return { ...state, ...(pending ? { pending } : {}) }
}
async function readCurrent(directory) {
  const pointer = join(directory, 'current.json')
  if (!await exists(pointer)) {
    requireProduction(!(await fs.readdir(directory)).some(name => uuid.test(name) || name.startsWith('succession-')), 'session_pointer_missing_review_required')
    return undefined
  }
  const pointerStat = await fs.lstat(pointer)
  requireProduction(pointerStat.isFile() && !pointerStat.isSymbolicLink() && pointerStat.size <= 1024, 'session_pointer_invalid')
  const pointerValue = JSON.parse(await fs.readFile(pointer, 'utf8'))
  requireProduction(Object.keys(pointerValue).length === 1, 'session_pointer_invalid')
  const { id } = pointerValue
  requireProduction(uuid.test(id), 'session_pointer_invalid')
  return readSession(directory, id)
}
async function readSession(directory, id) {
  const folder = join(directory, id)
  requireProduction(!(await fs.lstat(folder)).isSymbolicLink()
    && !(await fs.lstat(join(folder, 'session.json'))).isSymbolicLink(), 'session_reparse_path_refused')
  const sessionStat = await fs.lstat(join(folder, 'session.json'))
  requireProduction(sessionStat.isFile() && sessionStat.size <= 16_777_216, 'session_invalid')
  const session = JSON.parse(await fs.readFile(join(folder, 'session.json'), 'utf8'))
  requireProduction(session.format === 'my-production-session-v1' && session.id === id
    && Array.isArray(session.attempts) && Array.isArray(session.records), 'session_invalid')
  requireProduction(new Set(session.records.map(r => r.id)).size === session.records.length, 'session_evidence_duplicate')
  const entries = []
  for (const ref of session.records) {
    requireProduction(typeof ref.id === 'string' && ref.id.startsWith('auto3-') && uuid.test(ref.id.slice(6)), 'session_evidence_reference_invalid')
    const file = join(folder, `${ref.id}.json`)
    requireProduction(await exists(file), 'session_evidence_file_missing')
    const stat = await fs.lstat(file)
    requireProduction(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_048_576, 'session_evidence_file_invalid')
    const bytes = await fs.readFile(file)
    requireProduction(ref.sha256 === undefined || ref.sha256 === hashBytes(bytes), 'session_evidence_hash_mismatch')
    const entry = JSON.parse(bytes.toString('utf8'))
    requireProduction(entry.id === ref.id && entry.kind === ref.kind && entry.provenance === ref.provenance
      && entry.recorded_at === ref.recorded_at, 'session_evidence_reference_mismatch')
    entries.push(entry)
  }
  if (completedSession(session)) requireProduction(session.completed_at === session.open_reopening.completed_at
    && entries.some(r => r.kind === 'open_reopening_result' && JSON.stringify(r.value) === JSON.stringify(session.open_reopening))
    && entries.some(r => r.id === session.open_reopening.final_evidence && r.kind === 'open_final_evidence'
      && r.value.run_id === session.open_reopening.run_id && r.value.session_id === session.id), 'session_completion_unverified')
  return { folder, session }
}
export function completedSession(session) {
  return session?.format === 'my-production-session-v1' && session.stage === 'completed'
    && Number.isFinite(Date.parse(session.completed_at)) && session.open_reopening?.outcome === 'completed'
    && session.open_reopening?.states?.supabase === 'open' && session.open_reopening?.states?.vercel === 'open'
    && typeof session.open_reopening.final_evidence === 'string'
}
async function checkHistoricalSessions(directory, currentId, allowPending = false) {
  const folders = (await fs.readdir(directory)).filter(name => uuid.test(name))
  requireProduction(folders.includes(currentId), 'session_ambiguous')
  const journals = []
  for (const name of (await fs.readdir(directory)).filter(name => name.startsWith('succession-'))) {
    requireProduction(/^succession-[a-f0-9-]{36}\.json$/.test(name), 'session_succession_invalid_review_required')
    journals.push(await readSuccession(directory, name))
  }
  const pending = journals.filter(j => j.entry.value.predecessor.id === currentId && j.successor.id !== currentId)
  requireProduction(pending.length <= 1, 'session_succession_ambiguous')
  requireProduction(allowPending || pending.length === 0, 'session_succession_pending_review_required')
  const states = new Map()
  for (const id of folders.filter(id => id !== pending[0]?.successor.id)) {
    requireProduction(await exists(join(directory, id, 'session.json')), 'session_ambiguous')
    states.set(id, await readSession(directory, id))
  }
  const superseded = new Set(), successors = new Set()
  for (const journal of journals) {
    const { predecessor } = journal.entry.value
    requireProduction(!superseded.has(predecessor.id) && !successors.has(journal.successor.id), 'session_succession_ambiguous')
    successors.add(journal.successor.id)
    const old = states.get(predecessor.id)
    requireProduction(old && isDeepStrictEqual(await incompleteSnapshot(old, journal.entry.value.backup_root), predecessor),
      'session_succession_predecessor_changed')
    if (journal === pending[0]) {
      await checkStagedSuccessor(directory, journal)
    } else {
      const next = states.get(journal.successor.id)
      requireProduction(next && sameSuccessor(next.session, stagedSession(journal))
        && next.session.records.some(r => r.id === journal.entry.id && r.sha256 === hashBytes(json(journal.entry)))
        && isDeepStrictEqual((await sessionRecords(next.folder, next.session)).find(r => r.id === journal.entry.id), journal.entry),
      'session_succession_invalid_review_required')
      superseded.add(predecessor.id)
    }
  }
  for (const [id, { session }] of states) {
    requireProduction(!session.succession || successors.has(id), 'session_succession_invalid_review_required')
    // The only exception to completed history is a byte-preserved incomplete
    // predecessor, proven by its authorized, durable successor. No old proof
    // becomes current authorization, archive evidence, or publication input.
    if (id !== currentId) requireProduction(completedSession(session) || superseded.has(id), 'session_ambiguous')
    const visited = new Set([id])
    for (let next = session.succession?.predecessor_id; next; next = states.get(next)?.session.succession?.predecessor_id) {
      requireProduction(!visited.has(next), 'session_succession_ambiguous')
      visited.add(next)
    }
  }
  return pending[0]
}
export async function createSession(directory, repository, fingerprint, project, previous) {
  if (previous) {
    const current = await loadSession(directory)
    requireProduction(completedSession(current?.session) && JSON.stringify(current.session) === JSON.stringify(previous.session),
      'previous_session_not_completed')
    await checkHistoricalSessions(directory, current.session.id)
  }
  const id = randomUUID(), folder = join(directory, id)
  await fs.mkdir(folder, { mode: 0o700 })
  await restrictDirectory(folder)
  const session = newSession(id, repository, fingerprint, project)
  await saveSession(folder, session)
  if (previous) {
    // Keep all completed UUID folders/archives. Only the current pointer moves,
    // atomically, under AUTO.3's shared lock. An interrupted creation fails closed.
    const temporary = join(directory, `pointer-${randomUUID()}.tmp`)
    await writeNew(temporary, { id })
    await fs.rename(temporary, join(directory, 'current.json'))
  } else await writeNew(join(directory, 'current.json'), { id })
  return { folder, session }
}
export async function record(folder, session, kind, provenance, value) {
  const entry = { id: `auto3-${randomUUID()}`, kind, provenance, recorded_at: new Date().toISOString(), value }
  await writeNew(join(folder, `${entry.id}.json`), entry)
  session.records.push({ id: entry.id, kind, provenance, recorded_at: entry.recorded_at,
    sha256: hashBytes(await fs.readFile(join(folder, `${entry.id}.json`))) })
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
  const check = async () => {
    requireProduction(await exists(file) && !(await fs.lstat(file)).isSymbolicLink(), 'operator_lock_changed')
    requireProduction(JSON.parse(await fs.readFile(file, 'utf8')).nonce === nonce, 'operator_lock_changed')
  }
  const release = async () => {
    await check()
    await fs.unlink(file)
  }
  release.check = check
  return release
}

// One shared AUTO.3 lock serializes cooperating backup/preparation callers.
// Hashes additionally detect edits by other tools, including legacy records
// without a hash. They are corruption checks, not a hostile-host signature.
export async function guardedSession(directory, state) {
  await checkHistoricalSessions(directory, state.session.id)
  // Full predecessor hashes/ACLs are validated on entry. During the locked
  // operation, pin registry bytes and file identities/size/mtime/ctime, including
  // encrypted attempts. Do not rehash multi-GB archives after every prompt.
  // Like AUTO.3, this detects observable edits, not a hostile host administrator.
  const historyPaths = new Set()
  const historyStamp = async () => {
    const entries = [], paths = new Set()
    const names = (await fs.readdir(directory)).sort()
    entries.push(names)
    for (const name of names) {
      if (uuid.test(name) && name !== state.session.id) {
        const folder = join(directory, name), files = (await fs.readdir(folder)).sort()
        paths.add(folder); entries.push([name, files])
        for (const file of files) paths.add(join(folder, file))
      } else if (name.startsWith('succession-')) {
        const file = join(directory, name)
        paths.add(file)
        const journal = JSON.parse(await fs.readFile(file, 'utf8'))
        for (const archive of journal.entry.value.predecessor.archives) {
          paths.add(archive.directory)
          const files = (await fs.readdir(archive.directory)).sort()
          entries.push([archive.directory, files])
          for (const name of files) paths.add(join(archive.directory, name))
        }
      }
    }
    for (const file of paths) {
      historyPaths.add(file)
      const stat = await fs.lstat(file)
      requireProduction(!stat.isSymbolicLink(), 'session_reparse_path_refused')
      entries.push([file, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs,
        stat.isFile() && file.endsWith('.json') ? hashBytes(await fs.readFile(file)) : null])
    }
    return hashBytes(JSON.stringify(entries))
  }
  const historyExpected = await historyStamp()
  // Do not establish a new baseline over an edit between validation and stamp.
  await checkHistoricalSessions(directory, state.session.id)
  const snapshot = async (compareSession = false) => {
    protectedParent(directory)
    for (let part = resolve(state.folder); part !== parse(part).root; part = dirname(part)) {
      requireProduction(!(await fs.lstat(part)).isSymbolicLink(), 'session_reparse_path_refused')
    }
    requireProduction(await historyStamp() === historyExpected, 'session_changed_during_preparation')
    const loaded = await readCurrent(directory)
    requireProduction(loaded?.session.id === state.session.id, 'session_changed_during_preparation')
    requireProduction(!compareSession || JSON.stringify(loaded.session) === JSON.stringify(state.session),
      'session_changed_during_preparation')
    const names = ['current.json', join(state.session.id, 'session.json'),
      ...loaded.session.records.map(r => join(state.session.id, `${r.id}.json`))]
    const entries = []
    for (const name of names) entries.push([name, hashBytes(await fs.readFile(join(directory, name)))])
    for (const folder of [directory, state.folder]) {
      const stat = await fs.stat(folder)
      entries.push([folder, stat.dev, stat.ino, stat.birthtimeMs])
    }
    return hashBytes(JSON.stringify(entries))
  }
  let expected = await snapshot(true)
  const permissions = () => verifyPrivatePaths([directory, state.folder, join(directory, 'current.json'), join(state.folder, 'session.json'),
    ...state.session.records.map(r => join(state.folder, `${r.id}.json`)), ...historyPaths])
  await permissions()
  requireProduction(await snapshot() === expected, 'session_changed_during_preparation')
  const check = async () => requireProduction(await snapshot() === expected, 'session_changed_during_preparation')
  return { check, permissions,
    async save() { await check(); await saveSession(state.folder, state.session); expected = await snapshot(true) },
    async record(kind, provenance, value) {
      await check()
      const entry = await record(state.folder, state.session, kind, provenance, value)
      expected = await snapshot(true)
      return entry
    },
  }
}

export async function sessionRecords(folder, session) {
  return Promise.all(session.records.map(async ref => JSON.parse(await fs.readFile(join(folder, `${ref.id}.json`), 'utf8'))))
}
