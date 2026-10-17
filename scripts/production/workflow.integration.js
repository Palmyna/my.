import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { workflowFixture } from './workflow-fixtures.js'
import { operatorLockPath } from '../maintenance/vercel.js'
import { sessionRecords } from './session.js'

test('AUTO.5: real backup → distinct Git merge → open → second publication, immutable history and archives', async t => {
  const f = await workflowFixture(t)
  const first = await f.backup(), history = await f.state(), archive = await f.archiveHashes(first.backup)
  assert.equal(first.verify, 'complete'); assert.equal(first.publication_authorized, false)
  assert.ok(f.events.indexOf('vercel:closed') < f.events.indexOf('freeze:close'))
  assert.equal((await fs.readdir(first.backup)).length, 7)
  f.deliver()
  const opened = await f.open()
  assert.equal(opened.outcome, 'completed', JSON.stringify({ diagnostic: opened.diagnostic, messages: f.messages.slice(-8) }))
  assert.equal(f.rows.length, 1); assert.equal(f.dispatches, 1)
  assert.ok(f.events.indexOf('archive:verified') < f.events.indexOf('delivery:merged-migrated-promoted-simulated'))
  assert.ok(f.events.indexOf('publisher:committed-simulated') < f.events.indexOf('freeze:reopen'))
  assert.ok(f.events.indexOf('freeze:reopen') < f.events.indexOf('vercel:opened'))
  const completed = await fs.readFile(join(history.folder, 'session.json'), 'utf8')
  const historicalFiles = await f.archiveHashes(history.folder)
  await f.prepareSource('99.0.2', 'missing')
  await assert.rejects(f.backup(), /changelog_committed_file_missing/)
  assert.equal(await fs.readFile(join(history.folder, 'session.json'), 'utf8'), completed)
  assert.deepEqual(await f.archiveHashes(history.folder), historicalFiles)
  await f.prepareSource('99.0.2'); f.pr++
  const second = await f.backup(), next = await f.state()
  assert.notEqual(next.session.id, history.session.id); assert.notEqual(first.backup, second.backup)
  assert.equal(await fs.readFile(join(history.folder, 'session.json'), 'utf8'), completed)
  assert.deepEqual(await f.archiveHashes(first.backup), archive)
  assert.deepEqual(await f.archiveHashes(history.folder), historicalFiles)
  f.deliver(); const result = await f.open()
  assert.equal(result.outcome, 'completed'); assert.equal(result.binding.version, '99.0.2')
  assert.equal(f.rows.length, 2); assert.equal(f.captures, 2)
  assert.equal(result.restore_proven, false); assert.equal(result.production_recovery_proven, false)
  assert.deepEqual(await f.archiveHashes(first.backup), archive)
  await f.assertNoSecrets()
})

for (const [maintenance, frozen] of [[true, false], [false, true]]) test(`AUTO.5: pre-existing protection ${maintenance ? 'Vercel' : 'Supabase'} survives full workflow`, async t => {
  const f = await workflowFixture(t, { maintenance, frozen })
  await f.backup(); f.deliver(); assert.equal((await f.open()).outcome, 'completed')
  assert.deepEqual(f.patches, maintenance ? [false] : [true, false]); assert.equal(f.freezeWrites, frozen ? 1 : 2)
})

test('AUTO.5: interrupted capture retains exact lock and archive; reviewed resume can complete the same release', async t => {
  const f = await workflowFixture(t); f.fault = 'capture-interrupted'
  await assert.rejects(f.backup())
  const state = await f.state(), abandoned = state.session.attempts[0].directory, lock = join(f.api.lockDirectory, 'prod-backup.lock')
  assert.equal(await fs.readFile(join(abandoned, 'INCOMPLETE'), 'utf8') !== '', true)
  f.fault = undefined; f.api.signal = new AbortController().signal
  await assert.rejects(f.backup(), /operator_busy_or_interrupted_review_exact_lock/)
  // Only this test's exact marker, after its synthetic process has finished.
  await fs.unlink(lock)
  const resumed = await f.backup(); assert.notEqual(resumed.backup, abandoned)
  assert.equal((await f.state()).session.attempts.length, 2)
  f.deliver(); assert.equal((await f.open()).outcome, 'completed')
  assert.ok((await fs.readdir(abandoned)).includes('INCOMPLETE'))
  await f.assertNoSecrets()
})

test('AUTO.5: failed independent verification recovers encrypted archive with no export and then opens', async t => {
  const f = await workflowFixture(t); f.fault = 'independent-verify'
  await assert.rejects(f.backup()); const state = await f.state(), dir = state.session.attempts[0].directory
  const archive = await f.archiveHashes(dir); f.fault = undefined
  const result = await f.backup()
  assert.equal(result.reused, true); assert.equal(result.backup, dir); assert.equal(f.captures, 1)
  assert.deepEqual(await f.archiveHashes(dir), archive)
  assert.equal(f.events.filter(e => e === 'consent:export').length, 1)
  f.deliver(); assert.equal((await f.open()).outcome, 'completed')
})

test('AUTO.5: lost publisher response → missing AAL2 → failed Vercel open → incomplete final proof → success → fresh retry', async t => {
  const f = await workflowFixture(t); await f.backup(); f.deliver(); f.fault = 'lost-publication-response'
  assert.equal((await f.open()).outcome, 'incomplete'); assert.equal(f.rows.length, 1); assert.equal(f.freezeState.frozen, true)
  f.fault = 'no-aal2'; assert.equal((await f.open()).outcome, 'incomplete')
  assert.equal(f.rows.length, 1); assert.equal(f.freezeState.frozen, true)
  f.fault = 'vercel-open'; const partial = await f.open()
  assert.deepEqual(partial.states, { supabase: 'open', vercel: 'closed' })
  assert.equal(partial.outcome, 'incomplete')
  const dispatches = f.dispatches, writes = f.freezeWrites
  f.fault = 'no-final-proof'
  assert.equal((await f.open()).outcome, 'incomplete') // AUTO.2 retained its own failure marker.
  const vercelLock = operatorLockPath(f.bundle.vercel, f.vercelLockDirectory)
  assert.ok((await fs.stat(vercelLock)).isFile()); await fs.unlink(vercelLock) // Synthetic operator review only.
  const online = await f.open()
  assert.deepEqual(online.states, { supabase: 'open', vercel: 'open' }); assert.equal(online.outcome, 'incomplete')
  const reopens = f.patches.length
  f.fault = undefined; const success = await f.open(), retry = await f.open()
  assert.equal(success.outcome, 'completed'); assert.equal(retry.outcome, 'completed'); assert.equal(retry.reused, true)
  assert.notEqual(success.run_id, retry.run_id); assert.notEqual(success.final_evidence, retry.final_evidence)
  assert.equal(f.dispatches, dispatches); assert.equal(f.freezeWrites, writes); assert.equal(f.patches.length, reopens)
  assert.equal(f.rows.length, 1); await f.assertNoSecrets()
})

for (const [changelog, diagnostic] of [['missing', /changelog_committed_file_missing/], ['wrong', /changelog_version_or_category_mismatch/], ['invalid', /changelog_invalid/]]) test(`AUTO.5: committed ${changelog} changelog refused before session, connection and closure`, async t => {
  const f = await workflowFixture(t, { changelog })
  await assert.rejects(f.backup(), diagnostic)
  assert.equal(await f.state(), undefined); assert.equal(f.captures, 0); assert.equal(f.dispatches, 0)
  assert.equal(f.freezeWrites, 0); assert.deepEqual(f.patches, [])
  assert.equal(f.events.some(e => e === 'consent:connect'), false)
})

test('PROD.7C.2: failed capture → tooling commit, same version/changelog → authorized successor → exact PR/merge/open → following publication', async t => {
  const f = await workflowFixture(t)
  f.fault = 'capture-epipe'
  await assert.rejects(f.backup())
  const old = await f.state(), abandoned = old.session.attempts[0].directory
  const history = await f.archiveHashes(old.folder), archive = await f.archiveHashes(abandoned)
  assert.equal((await f.open()).diagnostic, 'session_incomplete')
  assert.deepEqual(await f.archiveHashes(old.folder), history)
  f.fault = undefined
  await fs.writeFile(join(f.repo, 'tooling-fix.txt'), 'Synthetic tooling correction; unchanged release/changelog.\n')
  f.git(['add', '.']); f.git(['commit', '-m', 'test: synthetic tooling correction'])
  const corrected = f.repository().head
  assert.notEqual(corrected, old.session.repository.head)
  const confirm = f.backupIO.confirm
  f.backupIO.confirm = async kind => kind !== 'succession'
  await assert.rejects(f.backup(), /explicit_authorization_missing/)
  assert.equal((await f.state()).session.id, old.session.id)
  assert.deepEqual(await f.archiveHashes(old.folder), history)
  f.backupIO.confirm = async (...args) => args[0] === 'connect' ? false : confirm(...args)
  await assert.rejects(f.backup(), /explicit_authorization_missing/)
  const prepared = await f.state()
  assert.notEqual(prepared.session.id, old.session.id)
  assert.equal(prepared.session.repository.head, corrected)
  assert.equal(prepared.session.repository.version, old.session.repository.version)
  assert.equal(prepared.session.attempts.length, 0); assert.equal(f.captures, 1)
  f.backupIO.confirm = confirm
  const backup = await f.backup(), next = await f.state()
  assert.notEqual(backup.backup, abandoned); assert.equal(f.captures, 2)
  const records = await sessionRecords(next.folder, next.session)
  const oldIds = new Set(old.session.records.map(r => r.id))
  assert.ok(next.session.records.every(r => !oldIds.has(r.id)))
  const evidence = records.find(r => r.kind === 'capture_evidence').value
  for (const field of ['maintenance_evidence', 'freeze_committed_evidence', 'ordinary_writes_drained_evidence', 'privileged_coordination_evidence']) {
    assert.equal(oldIds.has(evidence[field]), false)
    assert.ok(records.some(r => r.id === evidence[field]))
  }
  f.deliver()
  assert.equal(f.source, corrected)
  const source = f.source; f.source = old.session.repository.head
  assert.equal((await f.open()).outcome, 'incomplete'); assert.equal(f.dispatches, 0)
  f.source = source
  const opened = await f.open()
  assert.equal(opened.outcome, 'completed', JSON.stringify(opened))
  assert.equal(opened.binding.source, corrected)
  assert.deepEqual(opened.binding.changelog, next.session.source_release.changelog)
  assert.equal(f.rows.length, 1)
  await f.prepareSource('99.0.2'); f.pr++
  await f.backup(); f.deliver(); assert.equal((await f.open()).outcome, 'completed')
  assert.equal(f.rows.length, 2)
  assert.deepEqual(await f.archiveHashes(old.folder), history)
  assert.deepEqual(await f.archiveHashes(abandoned), archive)
  await f.assertNoSecrets()
})

for (const invalid of ['committed-invalid', 'worktree-modified', 'changed-during-consent']) test(`PROD.7C.2: ${invalid} changelog cannot create a successor`, async t => {
  const f = await workflowFixture(t)
  f.fault = 'capture-epipe'; await assert.rejects(f.backup()); f.fault = undefined
  const old = await f.state(), history = await f.archiveHashes(old.folder)
  const changelog = join(f.repo, 'scripts', 'notifications', 'releases', `${f.version}.json`)
  await fs.writeFile(join(f.repo, 'fix.txt'), 'synthetic correction\n')
  if (invalid === 'committed-invalid') await fs.writeFile(changelog, '{}')
  f.git(['add', '.']); f.git(['commit', '-m', 'test: synthetic corrected source'])
  if (invalid === 'worktree-modified') await fs.appendFile(changelog, ' ')
  const confirm = f.backupIO.confirm
  if (invalid === 'changed-during-consent') f.backupIO.confirm = async (...args) => {
    if (args[0] === 'succession') await fs.appendFile(changelog, ' ')
    return confirm(...args)
  }
  await assert.rejects(f.backup(), invalid === 'committed-invalid' ? /changelog_invalid/
    : invalid === 'worktree-modified' ? /clean_committed_dev_source_required/ : /source_changed_during_succession/)
  assert.equal((await f.state()).session.id, old.session.id)
  assert.deepEqual(await f.archiveHashes(old.folder), history)
  assert.equal((await fs.readdir(f.sessions)).some(name => name.startsWith('succession-')), false)
  assert.equal(f.captures, 1)
})
