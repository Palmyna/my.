import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { fixture, payload, project } from './open-fixtures.js'
import { runOpen, openDiagnostic, finalEvidenceSchema } from './open.js'
import { loadSession, guardedSession, createSession, lockSession, completedSession } from './session.js'
import { publicationSchema, publicationHash } from '../notifications/contract.ts'
import { publish } from '../notifications/publish.ts'
import { ProductionError } from './config.js'
import { operatorIO } from './open-cli.js'
import { productionFreeze } from './freeze-api.js'

beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real HTTP forbidden in AUTO.4C tests') })
  t.mock.method(pg.Client.prototype, 'connect', () => { throw new Error('Real PostgreSQL forbidden in AUTO.4C tests') })
})
async function openFixture(t) {
  const f = await fixture(t), publication = publicationSchema.parse(payload), rows = [], changes = []
  const user = '11111111-1111-4111-8111-111111111111'
  const reader = { user_id: user, registered_at: '2020-01-01T00:00:00Z', profile_exists: true, read_at: null, processed_at: null }
  const database = { inserts: 0, dispatches: 0, fail: undefined }
  const publisher = { project, system_id: f.bundle.target.system_id, database: 'postgres',
    session_user: 'my_notification_publisher', current_user: 'my_notification_publisher', tls_verified: true, permissions_verified: true }
  const client = { query: async (sql, args) => {
    assert.equal(sql, 'select private.publish_notification_announcement($1::jsonb) result')
    database.dispatches++
    if (database.fail === 'before') throw new Error('SECRET_CONNECTION')
    const p = JSON.parse(args[0])
    let row = rows.find(r => r.publication.publication_key === p.publication_key)
    if (!row) {
      row = { announcement_id: randomUUID(), content_hash: publicationHash(p), published_by: 'my_notification_publisher',
        published_at: new Date().toISOString(), withdrawn_at: null, publication: p }
      rows.push(row); database.inserts++
    }
    if (database.fail === 'after') throw new Error('SECRET_LOST_RESPONSE')
    return { rows: [{ result: { outcome: 'published', publication_key: p.publication_key, content_hash: row.content_hash,
      announcement_id: row.announcement_id, published_at: row.published_at } }] }
  } }
  f.api.publication = async () => structuredClone(publication)
  f.api.readPublication = async () => { f.calls.push('publication:read'); return { identity: f.remote.database.identity,
    observed_at: new Date().toISOString(), announcements: structuredClone(rows), reader: structuredClone(reader) } }
  f.api.publish = async (p, before) => { await before(); changes.push('publish'); return { identity: publisher, receipt: await publish(client, p) } }
  f.api.freeze = async (command, expected, consent) => {
    f.calls.push(`freeze:${command}`)
    assert.equal(f.remote.database.state.revision, expected)
    if (command === 'reopen') {
      assert.deepEqual(consent, { authorizeReopen: true })
      assert.equal(f.remote.database.state.frozen, true)
      assert.equal(f.remote.maintenance.state.maintenance_production, true)
      changes.push('unfreeze')
      f.remote.database.state = { frozen: false, revision: (BigInt(expected) + 1n).toString() }
    }
    return { verified: true, independent_read: true, identity: f.remote.database.identity, state: structuredClone(f.remote.database.state) }
  }
  f.api.reopenMaintenance = async consent => {
    assert.deepEqual(consent, { authorizeReopen: true, exclusiveWriter: true, checkpoint: f.remote.maintenance.checkpoint })
    assert.equal(f.remote.database.state.frozen, false)
    changes.push('vercel')
    f.remote.maintenance.state.maintenance_production = false
    f.remote.maintenance.checkpoint = 'e'.repeat(64)
    return { ...structuredClone(f.remote.maintenance), independent_read: true }
  }
  f.io.identify = async binding => ({ pull_request: binding.pull_request ?? 17,
    deployment_id: binding.deployment_id ?? 'dpl_Test', visibility_user_id: binding.visibility_user_id ?? user })
  f.io.summary = async value => { assert.equal(value.session_id, f.session.id); f.calls.push('summary') }
  f.io.authorizeCloudConnect = async () => { f.calls.push('consent:connect'); return true }
  f.io.authorizePublish = async () => { f.calls.push('consent:publish'); return true }
  f.io.authorizeUnfreeze = async () => { f.calls.push('consent:unfreeze'); return true }
  f.io.authorizeVercelReopen = async () => { f.calls.push('consent:vercel'); return true }
  f.io.authorizeRecovery = async () => { f.calls.push('consent:resume'); return true }
  const evidence = f.io.attachEvidence
  f.io.attachEvidence = async c => {
    const proof = await evidence(c)
    if (!c.protections.maintenance_production) {
      delete proof.checks.authenticated_GET_HEAD_503_headers_routes_assets
      proof.checks.authenticated_GET_HEAD_open_routes_assets = true
    }
    return proof
  }
  f.io.attachVisibilityEvidence = async c => {
    const proof = { ...c, format: 'my-production-changelog-visibility-v1', provenance: 'operator_verified_real_authenticated_RPC',
      checked_at: new Date().toISOString(), reference: 'operator.visibility.17', aal: 'aal2',
      checks: { real_session_identity_and_aal2: true, get_notification_center_all_pages: true,
        get_notification_unread_count_consistent: true, get_notification_content_exact: true,
        exactly_one_expected_notification: true, no_mark_read_or_process: true } }
    delete proof.started_at
    return proof
  }
  f.io.attachFinalEvidence = async c => {
    const proof = { ...c, format: 'my-production-online-evidence-v1', provenance: 'operator_verified_authenticated_application',
      checked_at: new Date().toISOString(), reference: 'operator.online.17',
      checks: Object.fromEntries(Object.keys(finalEvidenceSchema.shape.checks.shape).map(key => [key, true])) }
    delete proof.started_at
    return proof
  }
  const run = () => runOpen(f.bundle, f.io, f.api)
  const assertStates = (result, supabase, vercel) => assert.deepEqual(result.states, { supabase, vercel })
  return { ...f, run, rows, reader, database, changes, publication, assertStates }
}

test('nominal: one lock, AUTO.4A/B, distinct consents, Supabase first, Vercel second, human application proof and closure', async t => {
  const f = await openFixture(t)
  const original = f.api.freeze
  f.api.freeze = async (...args) => {
    await assert.rejects(lockSession(f.api.lockDirectory), /operator_busy/)
    const current = await loadSession(f.sessions)
    assert.equal(current.session.open_publication.outcome, 'verified')
    assert.ok(current.session.open_reopening.freeze_intent)
    return original(...args)
  }
  const result = await f.run()
  assert.equal(result.outcome, 'completed', result.diagnostic)
  f.assertStates(result, 'open', 'open')
  assert.deepEqual(f.changes, ['publish', 'unfreeze', 'vercel'])
  assert.equal(f.database.inserts, 1)
  assert.equal(f.calls.filter(c => c === 'consent:connect').length, 1)
  assert.ok(f.calls.indexOf('consent:publish') < f.calls.indexOf('consent:unfreeze'))
  assert.equal(result.restore_proven, false); assert.equal(result.production_recovery_proven, false)
  const state = await loadSession(f.sessions)
  assert.equal(completedSession(state.session), true)
  assert.equal(state.session.attempts.length, 1)
  assert.equal(state.session.open_reopening.notification.announcement_id, f.rows[0].announcement_id)
  assert.equal((await fs.readdir(f.api.lockDirectory)).length, 0)
})

for (const [name, change, expected, writes] of [
  ['no connection consent', f => { f.io.authorizeCloudConnect = async () => false }, 'open_connection_authorization_required', []],
  ['no publication consent', f => { f.io.authorizePublish = async () => false }, 'publish_authorization_required', []],
  ['wrong deployment', f => { f.remote.deployment.commit = 'f'.repeat(40) }, 'deployment_unexpected', []],
  ['wrong version', f => { f.release.version = '0.8.34' }, 'release_version_unexpected', []],
  ['changed freeze revision', f => { f.remote.database.state.revision = '1' }, 'open_freeze_revision_changed', []],
  ['no delivery or recovery proof', f => { f.io.attachEvidence = async () => undefined }, 'operator_evidence_missing', []],
  ['no AAL2 proof', f => { f.io.attachVisibilityEvidence = async () => undefined }, 'visibility_evidence_missing_or_invalid', ['publish']],
  ['no Supabase consent', f => { f.io.authorizeUnfreeze = async () => false }, 'open_supabase_authorization_required', ['publish']],
  ['no Vercel consent', f => { f.io.authorizeVercelReopen = async () => false }, 'open_vercel_authorization_required', ['publish']],
  ['withdrawn changelog before unfreeze', f => { f.io.authorizeUnfreeze = async () => { f.rows[0].withdrawn_at = new Date().toISOString(); return true } }, 'publication_withdrawn', ['publish']],
  ['checkpoint changes during consent', f => { f.io.authorizeVercelReopen = async () => { f.remote.maintenance.checkpoint = 'd'.repeat(64); return true } }, 'maintenance_prematurely_open_or_unverified', ['publish']],
  ['freeze changes during consent', f => { f.io.authorizeUnfreeze = async () => { f.remote.database.state.revision = '1'; return true } }, 'freeze_prematurely_open_or_changed', ['publish']],
  ['missing final application proof', f => { f.io.attachFinalEvidence = async () => undefined }, 'open_final_evidence_missing_or_invalid', ['publish','unfreeze','vercel']],
]) test(name, async t => {
  const f = await openFixture(t); await change(f)
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.diagnostic, expected)
  assert.deepEqual(f.changes, writes)
  if (name === 'no connection consent') assert.equal(f.calls.includes('database'), false)
  assert.equal(completedSession((await loadSession(f.sessions)).session), false)
})

for (const phase of ['before', 'after']) test(`publisher response lost ${phase} commit: resume without duplicate`, async t => {
  const f = await openFixture(t); f.database.fail = phase
  assert.equal((await f.run()).outcome, 'incomplete')
  assert.equal(f.changes.includes('unfreeze'), false)
  f.database.fail = undefined
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic); assert.equal(f.database.inserts, 1)
})

test('publication verified, protections closed: resume revalidates and rejects remote drift', async t => {
  const f = await openFixture(t), authorize = f.io.authorizeUnfreeze
  f.io.authorizeUnfreeze = async () => false
  assert.equal((await f.run()).outcome, 'incomplete')
  f.remote.deployment.commit = 'f'.repeat(40); f.io.authorizeUnfreeze = authorize
  assert.equal((await f.run()).diagnostic, 'deployment_unexpected')
  assert.deepEqual(f.changes, ['publish'])
})

test('unfreeze succeeds, Vercel fails: report partial; retry only Vercel with fresh proof', async t => {
  const f = await openFixture(t), reopen = f.api.reopenMaintenance
  f.api.reopenMaintenance = async () => { throw new Error('SECRET_VERCEL_FAILURE') }
  const first = await f.run()
  f.assertStates(first, 'open', 'closed'); assert.equal(first.outcome, 'incomplete')
  f.api.reopenMaintenance = reopen
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic)
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel']); assert.equal(f.database.dispatches, 1)
})

test('unfreeze fails before commit: both confirmed closed, resume only the remaining changes without republishing', async t => {
  const f = await openFixture(t), freeze = f.api.freeze
  f.api.freeze = async () => { throw new Error('SECRET_BEFORE_COMMIT') }
  const first = await f.run()
  assert.equal(first.outcome, 'incomplete'); f.assertStates(first, 'closed', 'closed')
  assert.deepEqual(f.changes, ['publish'])
  f.api.freeze = freeze
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic)
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel']); assert.equal(f.database.dispatches, 1)
})

test('unfreeze committed but response/independent reread lost: fresh read then operator recovery, no second toggle', async t => {
  const f = await openFixture(t), freeze = f.api.freeze
  f.api.freeze = async (...args) => { await freeze(...args); throw new Error('SECRET_LOST_ACK') }
  const first = await f.run(); f.assertStates(first, 'open', 'closed')
  f.api.freeze = freeze
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic)
  assert.equal(f.changes.filter(c => c === 'unfreeze').length, 1)
})

test('unfreeze reread fails and database becomes unreachable: unknown recorded, never open Vercel', async t => {
  const f = await openFixture(t), freeze = f.api.freeze
  f.api.freeze = async (...args) => {
    await freeze(...args)
    f.api.database = async () => { throw new Error('SECRET_READ_ERROR') }
    throw new Error('SECRET_UNCERTAIN')
  }
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.states.supabase, 'unknown')
  assert.equal(f.changes.includes('vercel'), false)
})

test('Vercel opened but ack lost: review real state, do not PATCH or publish again', async t => {
  const f = await openFixture(t), reopen = f.api.reopenMaintenance
  f.api.reopenMaintenance = async c => { await reopen(c); throw new Error('SECRET_LOST_VERCEL_ACK') }
  const first = await f.run(); f.assertStates(first, 'open', 'open')
  assert.equal(first.outcome, 'incomplete')
  f.io.authorizeRecovery = async c => { assert.equal(c.uncertain_vercel_checkpoint, true); return true }
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic)
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel']); assert.equal(f.database.dispatches, 1)
})

for (const target of ['freeze', 'vercel']) test(`interrupted during ${target}: retain exact local lock; manual review then safe resume`, async t => {
  const f = await openFixture(t), method = target === 'freeze' ? 'freeze' : 'reopenMaintenance', original = f.api[method]
  f.api[method] = async (...args) => { await original(...args); f.controller.abort(); throw new Error('SECRET_INTERRUPTED') }
  const first = await f.run()
  assert.equal(first.diagnostic, 'interrupted_state_unknown')
  assert.equal((await fs.readdir(f.api.lockDirectory)).length, 1)
  assert.equal((await f.run()).outcome, 'incomplete')
  // Test-only equivalent of independent operator review, exact marker only.
  await fs.unlink(join(f.api.lockDirectory, 'prod-backup.lock'))
  f.api.signal = new AbortController().signal; f.api[method] = original
  const second = await f.run()
  assert.equal(second.outcome, 'completed', second.diagnostic)
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel'])
})

test('final proof incomplete: next runs keep receipt, retry only human checks, then idempotent after success', async t => {
  const f = await openFixture(t), final = f.io.attachFinalEvidence
  f.io.attachFinalEvidence = async () => undefined
  const first = await f.run(); f.assertStates(first, 'open', 'open')
  assert.equal(first.outcome, 'incomplete')
  assert.equal((await f.run()).outcome, 'incomplete')
  f.io.attachFinalEvidence = final
  assert.equal((await f.run()).outcome, 'completed')
  const repeated = await f.run()
  assert.equal(repeated.outcome, 'completed', repeated.diagnostic); assert.equal(repeated.reused, true)
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel']); assert.equal(f.database.dispatches, 1)
})

test('new backup session after completion retains all previous evidence and archive references', async t => {
  const f = await openFixture(t); assert.equal((await f.run()).outcome, 'completed')
  const previous = await loadSession(f.sessions), bytes = await fs.readFile(join(f.folder, 'session.json'))
  const release = await lockSession(f.api.lockDirectory)
  try {
    const next = await createSession(f.sessions, previous.session.repository, f.bundle.fingerprint, project, previous)
    assert.notEqual(next.session.id, previous.session.id)
    const store = await guardedSession(f.sessions, next); await store.check()
    assert.deepEqual(await fs.readFile(join(f.folder, 'session.json')), bytes)
    assert.equal(previous.session.attempts[0].directory, f.session.attempts[0].directory)
  } finally { await release() }
})

test('changed closed checkpoint during partial resume refuses; no silent adoption', async t => {
  const f = await openFixture(t)
  f.api.reopenMaintenance = async () => { throw new Error('Vercel failure') }
  await f.run(); f.remote.maintenance.checkpoint = 'd'.repeat(64)
  const result = await f.run()
  assert.equal(result.diagnostic, 'open_checkpoint_changed'); assert.equal(f.database.dispatches, 1)
})

test('Vercel contradiction after unfreeze, before PATCH: keep backend open and stop without touching Vercel', async t => {
  const f = await openFixture(t), freeze = f.api.freeze
  f.api.freeze = async (...args) => {
    const result = await freeze(...args)
    if (args[0] === 'verify-open') f.remote.maintenance.checkpoint = 'd'.repeat(64)
    return result
  }
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); f.assertStates(result, 'open', 'closed')
  assert.deepEqual(f.changes, ['publish','unfreeze'])
})

test('publication retired between unfreeze and Vercel: never use historical verified as permission', async t => {
  const f = await openFixture(t), freeze = f.api.freeze
  f.api.freeze = async (...args) => {
    const result = await freeze(...args)
    if (args[0] === 'verify-open') f.rows[0].withdrawn_at = new Date().toISOString()
    return result
  }
  const result = await f.run()
  assert.equal(result.diagnostic, 'publication_withdrawn'); f.assertStates(result, 'open', 'closed')
  assert.deepEqual(f.changes, ['publish','unfreeze'])
})

test('changed open checkpoint on resume is blocked even with an old successful opening receipt', async t => {
  const f = await openFixture(t)
  f.io.attachFinalEvidence = async () => undefined
  await f.run(); f.remote.maintenance.checkpoint = 'd'.repeat(64)
  assert.equal((await f.run()).diagnostic, 'open_checkpoint_changed')
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel'])
})

for (const [name, change] of [
  ['historical', p => { p.checked_at = '2000-01-01T00:00:00Z' }],
  ['wrong build', p => { p.deployment_id = 'dpl_Wrong' }],
  ['secret field', p => { p.token = 'SECRET_FINAL' }],
]) test(`final ${name} evidence never closes the session`, async t => {
  const f = await openFixture(t), final = f.io.attachFinalEvidence
  f.io.attachFinalEvidence = async c => { const p = await final(c); change(p); return p }
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); f.assertStates(result, 'open', 'open')
  assert.equal(completedSession((await loadSession(f.sessions)).session), false)
  for (const name of await fs.readdir(f.folder)) assert.equal((await fs.readFile(join(f.folder,name),'utf8')).includes('SECRET_FINAL'), false)
})

test('partial recovery never proceeds without explicit operator review', async t => {
  const f = await openFixture(t)
  f.api.reopenMaintenance = async () => { throw new Error('Vercel unavailable') }
  await f.run(); f.io.authorizeRecovery = async () => false
  const result = await f.run()
  assert.equal(result.diagnostic, 'open_resume_review_required'); f.assertStates(result, 'open', 'closed')
  assert.deepEqual(f.changes, ['publish','unfreeze'])
})

test('changed final remote state prevents completion, never triggers an inverse operation', async t => {
  const f = await openFixture(t), final = f.io.attachFinalEvidence
  f.io.attachFinalEvidence = async c => {
    f.remote.database.state = { frozen: true, revision: (BigInt(f.remote.database.state.revision) + 1n).toString() }
    return final(c)
  }
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); f.assertStates(result, 'closed', 'open')
  assert.deepEqual(f.changes, ['publish','unfreeze','vercel'])
})

test('completion needs its durable final record; editing only session flags cannot free the next backup', async t => {
  const f = await openFixture(t)
  assert.equal((await f.run()).outcome, 'completed')
  const current = await loadSession(f.sessions)
  current.session.open_reopening.final_evidence = `auto3-${randomUUID()}`
  await fs.writeFile(join(f.folder,'session.json'), JSON.stringify(current.session))
  await assert.rejects(loadSession(f.sessions), /session_completion_unverified/)
})

test('historical ready/verified cannot attribute premature opening', async t => {
  const f = await openFixture(t)
  f.remote.database.state.frozen = false
  f.remote.database.state.revision = (BigInt(f.session.freeze_revision) + 1n).toString()
  const result = await f.run()
  assert.equal(result.diagnostic, 'open_premature_or_unattributed'); assert.deepEqual(f.changes, [])
})

test('local lock deleted during consent blocks all mutations', async t => {
  const f = await openFixture(t)
  f.io.authorizePublish = async () => { await fs.unlink(join(f.api.lockDirectory, 'prod-backup.lock')); return true }
  const result = await f.run()
  assert.equal(result.outcome, 'incomplete'); assert.deepEqual(f.changes, [])
})

test('unknown errors and extra secret fields never enter protected logs or results', async t => {
  const f = await openFixture(t)
  f.io.attachVisibilityEvidence = async () => { throw new ProductionError('SECRET_TOKEN_SENTINEL') }
  const result = await f.run()
  assert.equal(JSON.stringify(result).includes('SECRET_TOKEN_SENTINEL'), false)
  for (const name of await fs.readdir(f.folder)) assert.equal((await fs.readFile(join(f.folder,name),'utf8')).includes('SECRET_TOKEN_SENTINEL'), false)
  assert.equal(openDiagnostic(new ProductionError('SECRET_TOKEN_SENTINEL')), 'open_unverified_details_suppressed')
  assert.equal(openDiagnostic(new ProductionError('operator_busy_or_interrupted_review_exact_lock')), 'operator_busy_or_interrupted_review_exact_lock')
  await (await guardedSession(f.sessions, await loadSession(f.sessions))).permissions()
})

test('AUTO.1 wrapper refuses a missing reopen consent before any connection', async t => {
  const f = await openFixture(t)
  await assert.rejects(productionFreeze(f.bundle, 'SECRET_PASSWORD', 'reopen', f.session.freeze_revision), /authorization_required/)
  assert.equal(process.env.MY_MAINTENANCE_DATABASE_PASSWORD, undefined)
})

test('operator interface reuses binding and never prompts deployment or identity when already pinned', async () => {
  const io = operatorIO(() => { throw new Error('Unexpected question') }, () => {})
  const pinned = { pull_request: 17, deployment_id: 'dpl_Test', visibility_user_id: randomUUID() }
  assert.deepEqual(await io.identify(pinned), pinned)
})

test('Windows wrapper uses only protected existing channels, consumes all synthetic secrets and selects final entry', { skip: process.platform !== 'win32' }, async t => {
  const f = await openFixture(t), quote = s => `'${s.replaceAll("'", "''")}'`
  const wrapper = fileURLToPath(new URL('./open.ps1', import.meta.url)), keyFile = join(f.root, 'key.dpapi')
  const key = Buffer.alloc(32, 9).toString('base64'), runner = join(f.root, 'wrapper.ps1')
  const config = join(f.root, 'production.json')
  await fs.writeFile(config, JSON.stringify({ format: 'my-production-backup-v1', project, key_file: keyFile }))
  await fs.writeFile(runner, `$ErrorActionPreference='Stop'
$k=ConvertTo-SecureString ${quote(key)} -AsPlainText -Force
ConvertFrom-SecureString $k | Set-Content -LiteralPath ${quote(keyFile)}
function Read-Host { param($Prompt,[switch]$AsSecureString); $value=if($Prompt -match 'Vercel'){'SECRET_VERCEL'}elseif($Prompt -match 'GitHub'){'SECRET_GITHUB'}elseif($Prompt -match 'publisher'){'SECRET_PUBLISHER'}else{'SECRET_DATABASE'}; ConvertTo-SecureString $value -AsPlainText -Force }
function node { if ($env:MY_BACKUP_KEY -ne ${quote(key)} -or $env:MY_BACKUP_DATABASE_PASSWORD -ne 'SECRET_DATABASE' -or $env:MY_VERCEL_MAINTENANCE_TOKEN -ne 'SECRET_VERCEL' -or $env:MY_NOTIFICATION_DATABASE_PASSWORD -ne 'SECRET_PUBLISHER' -or $env:MY_PRODUCTION_GITHUB_TOKEN -ne 'SECRET_GITHUB') { throw 'missing_channel' }; if (($args -join ' ') -match 'SECRET_' -or $args[0] -notmatch 'open-cli.js$') { throw 'invalid_argv' }; $global:LASTEXITCODE=0; Write-Output 'channels_verified' }
$env:MY_PRODUCTION_CONFIG=${quote(config)}
& ${quote(wrapper)}
if ($env:MY_BACKUP_KEY -or $env:MY_BACKUP_DATABASE_PASSWORD -or $env:MY_VERCEL_MAINTENANCE_TOKEN -or $env:MY_NOTIFICATION_DATABASE_PASSWORD -or $env:MY_PRODUCTION_GITHUB_TOKEN) { throw 'channel_retained' }
`)
  const env = { ...process.env }
  for (const key of ['MY_BACKUP_KEY','MY_BACKUP_DATABASE_PASSWORD','MY_RESTORE_DATABASE_PASSWORD','MY_VERCEL_MAINTENANCE_TOKEN',
    'MY_NOTIFICATION_DATABASE_PASSWORD','MY_NOTIFICATION_DATABASE_URL','MY_PRODUCTION_GITHUB_TOKEN','MY_MAINTENANCE_DATABASE_PASSWORD']) env[key] = ''
  const { stdout, stderr } = await promisify(execFile)('powershell.exe', ['-NoProfile','-File',runner], { windowsHide: true, env })
  assert.equal(stderr, ''); assert.match(stdout, /channels_verified/); assert.equal(stdout.includes('SECRET_'), false)
  const entry = readFileSync(new URL('./open.ps1', import.meta.url), 'utf8')
  assert.match(entry, /ProductionOpen/); assert.match(entry, /MY_PRODUCTION_CONFIG/)
})
