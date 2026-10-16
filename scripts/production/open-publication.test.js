import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { fixture, payload, project, temporary } from './open-fixtures.js'
import { publishOpenChangelog, publicationIsVerified } from './open-publication.js'
import { loadSession } from './session.js'
import { ProductionError } from './config.js'
import { readPublishedChangelog, consumeOpenSecrets, openPublicationAPI } from './publication-api.js'
import { hashBytes } from '../backup/secure-files.js'
import { prepareChangelog, readPinnedChangelog } from './release.js'
import { publicationHash, publicationSchema } from '../notifications/contract.ts'
import { publish } from '../notifications/publish.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const otherUser = '22222222-2222-4222-8222-222222222222'
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Real HTTP forbidden in AUTO.4B tests') })
  t.mock.method(pg.Client.prototype, 'connect', () => { throw new Error('Real PostgreSQL forbidden in AUTO.4B tests') })
})
async function publicationFixture(t) {
  const f = await fixture(t), publication = publicationSchema.parse(payload), rows = []
  const reader = { user_id: userId, registered_at: '2020-01-01T00:00:00Z', profile_exists: true, read_at: null, processed_at: null }
  const publisherIdentity = { project, system_id: f.bundle.target.system_id, database: 'postgres',
    session_user: 'my_notification_publisher', current_user: 'my_notification_publisher', tls_verified: true, permissions_verified: true }
  const db = { inserts: 0, dispatches: 0, fail: undefined }
  const insert = p => {
    const row = { announcement_id: randomUUID(), content_hash: publicationHash(p), published_by: 'my_notification_publisher',
      published_at: new Date().toISOString(), withdrawn_at: null, publication: structuredClone(p) }
    rows.push(row); db.inserts++; return row
  }
  const client = { query: async (sql, values) => {
    assert.equal(sql, 'select private.publish_notification_announcement($1::jsonb) result')
    db.dispatches++
    if (db.fail === 'before') throw new Error('SECRET_NETWORK_BEFORE')
    const p = JSON.parse(values[0])
    const existing = rows.find(r => r.publication.publication_key === p.publication_key)
    if (existing && existing.content_hash !== publicationHash(p)) {
      const error = new pg.DatabaseError('publication_key_conflict', 0, 'error'); error.code = '23505'; throw error
    }
    const row = existing ?? insert(p)
    if (db.fail === 'after') throw new Error('SECRET_NETWORK_AFTER')
    return { rows: [{ result: { outcome: 'published', publication_key: p.publication_key,
      content_hash: row.content_hash, announcement_id: row.announcement_id, published_at: row.published_at } }] }
  } }
  f.api.publication = async () => structuredClone(publication)
  f.api.readPublication = async () => { f.calls.push('publication:read'); return { identity: f.remote.database.identity,
    observed_at: new Date().toISOString(), announcements: structuredClone(rows), reader: structuredClone(reader) } }
  f.api.publish = async (p, dispatch) => { f.calls.push('publisher:connect'); await dispatch();
    return { identity: publisherIdentity, receipt: await publish(client, p) } }
  f.io.authorizeCloudConnect = async () => { f.calls.push('consent:cloud'); return true }
  f.io.authorizePublish = async () => { f.calls.push('consent:publish'); return true }
  f.io.attachVisibilityEvidence = async c => ({ format: 'my-production-changelog-visibility-v1',
    provenance: 'operator_verified_real_authenticated_RPC', ...c, started_at: undefined,
    checked_at: new Date().toISOString(), reference: 'operator.notification.17', aal: 'aal2',
    checks: { real_session_identity_and_aal2: true, get_notification_center_all_pages: true,
      get_notification_unread_count_consistent: true, get_notification_content_exact: true,
      exactly_one_expected_notification: true, no_mark_read_or_process: true } })
  // The challenge timestamp is a constraint, not a persisted evidence field.
  const proof = f.io.attachVisibilityEvidence
  f.io.attachVisibilityEvidence = async c => { const value = await proof(c); delete value.started_at; return value }
  f.input.visibility_user_id = userId
  const run = () => publishOpenChangelog(f.bundle, f.input, f.io, f.api)
  return { ...f, run, publication, rows, reader, db, insert }
}

test('nominal: existing preparation contract, PROD.6 receipt, independent reads and real-identity operator evidence; no reopen', async t => {
  const f = await publicationFixture(t), result = await f.run()
  assert.equal(result.outcome, 'verified'); assert.equal(f.db.inserts, 1)
  assert.equal(result.visibility_verified, true); assert.equal(result.reopen_authorized, false); assert.equal(result.protections_changed, false)
  assert.equal(publicationIsVerified(result, result.run_id), true)
  assert.equal(publicationIsVerified(result, randomUUID()), false)
  assert.deepEqual(result.authorizations, { cloud_connect: true, publish: true })
  assert.equal(f.calls[0], 'consent:cloud')
  assert.equal(f.calls.filter(c => c === 'verify').length, 1)
  assert.equal(f.calls.filter(c => c === 'publication:read').length, 3)
  assert.equal(f.remote.database.state.frozen, true); assert.equal(f.remote.maintenance.state.maintenance_production, true)
  const { session } = await loadSession(f.sessions)
  assert.equal(session.stage, 'verified'); assert.equal(session.open_publication.outcome, 'verified')
  assert.equal(session.records.filter(r => r.kind === 'open_publication_receipt').length, 1)
})

test('resume and existing same content: identical file/key/hash/UUID, fresh proof, one insertion', async t => {
  const f = await publicationFixture(t), first = await f.run(), second = await f.run()
  assert.equal(second.outcome, 'verified'); assert.equal(f.db.inserts, 1); assert.equal(f.db.dispatches, 2)
  assert.deepEqual(second.receipt, first.receipt); assert.deepEqual(second.binding, first.binding)
  assert.notEqual(second.run_id, first.run_id); assert.notEqual(second.visibility_evidence, first.visibility_evidence)
})

for (const phase of ['before', 'after']) test(`network failure ${phase} transaction: uncertain, restart reuses same key without duplicate`, async t => {
  const f = await publicationFixture(t); f.db.fail = phase
  const first = await f.run()
  assert.equal(first.outcome, 'uncertain'); assert.equal(first.dispatch_started, true)
  assert.equal(f.db.inserts, phase === 'after' ? 1 : 0)
  f.db.fail = undefined
  const second = await f.run()
  assert.equal(second.outcome, 'verified'); assert.equal(f.db.inserts, 1)
  assert.deepEqual(second.binding, first.binding)
})

test('publisher connection fails before dispatch: no publication attempted', async t => {
  const f = await publicationFixture(t)
  f.api.publish = async () => { throw new Error('SECRET_CONNECT') }
  const result = await f.run()
  assert.equal(result.outcome, 'not_published'); assert.equal(result.dispatch_started, false); assert.equal(result.existence, 'absent')
})

for (const [name, mutate, diagnostic] of [
  ['withdrawn', f => { f.insert(f.publication).withdrawn_at = new Date().toISOString() }, 'publication_withdrawn'],
  ['content conflict', f => { f.insert({ ...f.publication, body: 'Autre contenu.' }) }, 'publication_content_conflict'],
  ['bad hash', f => { f.insert(f.publication).content_hash = 'f'.repeat(64) }, 'publication_content_conflict'],
  ['bad version', f => { f.insert(f.publication).publication.app_version = '0.8.34' }, 'publication_content_conflict'],
  ['duplicate release under another key', f => { f.insert(f.publication); f.insert({ ...f.publication, publication_key: 'another.key' }) }, 'publication_duplicate_release'],
]) test(`${name}: existing notification ineligible, no publisher call`, async t => {
  const f = await publicationFixture(t); mutate(f)
  const result = await f.run()
  assert.equal(result.outcome, 'existing_ineligible'); assert.equal(result.diagnostic, diagnostic); assert.equal(f.db.dispatches, 0)
})

for (const [name, mutate, diagnostic] of [
  ['missing proof', f => { f.io.attachVisibilityEvidence = undefined }, 'visibility_evidence_missing_or_invalid'],
  ['wrong user', f => { const proof=f.io.attachVisibilityEvidence; f.io.attachVisibilityEvidence=async c=>({...await proof(c),user_id:otherUser}) }, 'visibility_evidence_historical_or_mismatched'],
  ['AAL1', f => { const proof=f.io.attachVisibilityEvidence; f.io.attachVisibilityEvidence=async c=>({...await proof(c),aal:'aal1'}) }, 'visibility_evidence_missing_or_invalid'],
  ['old proof', f => { const proof=f.io.attachVisibilityEvidence; f.io.attachVisibilityEvidence=async c=>({...await proof(c),checked_at:'2000-01-01T00:00:00Z'}) }, 'visibility_evidence_historical_or_mismatched'],
  ['processed user', f => { f.reader.processed_at = '2026-01-01T00:00:00Z' }, 'visibility_identity_ineligible'],
  ['missing profile', f => { f.reader.profile_exists = false }, 'visibility_identity_ineligible'],
  ['new user outside audience', f => { f.reader.registered_at = '2099-01-01T00:00:00Z' }, 'visibility_identity_ineligible'],
  ['wrong reader', f => { f.reader.user_id = otherUser }, 'visibility_identity_ineligible'],
  ['unexpected read mutation', f => { const proof=f.io.attachVisibilityEvidence; f.io.attachVisibilityEvidence=async c=>{ f.reader.read_at=new Date().toISOString(); return proof(c) } }, 'visibility_identity_or_state_changed'],
]) test(`${name}: publication present, reopening ineligible`, async t => {
  const f = await publicationFixture(t); mutate(f)
  const result = await f.run()
  assert.equal(result.outcome, 'existing_ineligible'); assert.equal(result.diagnostic, diagnostic)
  assert.equal(result.visibility_verified, false); assert.equal(result.reopen_authorized, false)
})

test('visibility proof cannot be reused on another execution', async t => {
  const f = await publicationFixture(t), attach = f.io.attachVisibilityEvidence
  let old
  f.io.attachVisibilityEvidence = async c => { old = await attach(c); return old }
  assert.equal((await f.run()).outcome, 'verified')
  f.io.attachVisibilityEvidence = async () => old
  assert.equal((await f.run()).diagnostic, 'visibility_evidence_historical_or_mismatched')
})

for (const kind of ['CloudConnect', 'Publish']) test(`distinct ${kind} authorization required; backup consent irrelevant`, async t => {
  const f = await publicationFixture(t); f.io[`authorize${kind}`] = async () => false
  await f.changeSession(s => { s.publication_authorized = true })
  const result = await f.run()
  assert.equal(result.outcome, 'not_published'); assert.equal(f.db.dispatches, 0)
  if (kind === 'CloudConnect') assert.equal(f.calls.length, 0)
})

for (const [name, mutate, diagnostic] of [
  ['maintenance', f => { f.remote.maintenance.state.maintenance_production = false }, 'maintenance_prematurely_open_or_unverified'],
  ['freeze', f => { f.remote.database.state.frozen = false }, 'freeze_prematurely_open_or_changed'],
  ['freeze revision', f => { f.remote.database.state.revision = '123' }, 'freeze_prematurely_open_or_changed'],
  ['release', f => { f.remote.github.main = 'f'.repeat(40) }, 'github_source_or_main_unexpected'],
  ['changelog', f => { f.release.changelog.content_hash = 'f'.repeat(64) }, 'remote_state_changed_during_preparation'],
]) test(`${name} changes during publication consent: volatile checks refuse dispatch`, async t => {
  const f = await publicationFixture(t)
  f.io.authorizePublish = async () => { mutate(f); return true }
  const result = await f.run()
  assert.equal(result.diagnostic, diagnostic); assert.equal(f.db.dispatches, 0); assert.equal(result.outcome, 'not_published')
})

test('retirement or expiration after historical receipt prevents verification', async t => {
  for (const mode of ['withdrawn', 'expired']) {
    const f = await publicationFixture(t), read = f.api.readPublication
    let count=0
    f.api.readPublication = async b => {
      if (++count === 2) {
        if (mode === 'withdrawn') f.rows[0].withdrawn_at = new Date().toISOString()
        else {
          // Server clock beyond the exact pinned expiration; no clock override.
          const result=await read(b); result.observed_at='9999-12-31T23:59:59Z'; return result
        }
      }
      return read(b)
    }
    if (mode === 'expired') {
      f.publication.expires_at='2099-01-01T00:00:00.000000Z'
      f.release.changelog=prepareChangelog(Buffer.from(JSON.stringify(f.publication)), f.release.version, f.release.changelog.file)
    }
    const result = await f.run()
    assert.equal(result.outcome, 'existing_ineligible'); assert.equal(result.diagnostic, `publication_${mode}`)
  }
})

test('read unavailable after receipt remains uncertain; resume verifies same UUID', async t => {
  const f = await publicationFixture(t), read=f.api.readPublication
  let calls=0
  f.api.readPublication=async b=>{ if(++calls===2) throw new Error('SECRET_READ'); return read(b) }
  const first=await f.run(); assert.equal(first.outcome,'uncertain'); assert.ok(first.receipt)
  f.api.readPublication=read
  const second=await f.run(); assert.equal(second.outcome,'verified'); assert.deepEqual(first.receipt,second.receipt); assert.equal(f.db.inserts,1)
})

test('receipt mismatch (identity, UUID or hash) never verifies', async t => {
  for (const field of ['identity','uuid','hash']) {
    const f=await publicationFixture(t), call=f.api.publish
    f.api.publish=async (...args)=>{ const value=await call(...args)
      if(field==='identity') value.identity.session_user='postgres'
      if(field==='uuid') value.receipt.announcement_id=randomUUID()
      if(field==='hash') value.receipt.content_hash='f'.repeat(64)
      return value }
    const result=await f.run(); assert.notEqual(result.outcome,'verified'); assert.equal(result.visibility_verified,false)
  }
})

test('interruption and concurrency retain exact shared lock; restart cannot duplicate', async t => {
  const f=await publicationFixture(t), call=f.api.publish
  let concurrent
  f.api.publish=async (...args)=>{ concurrent=await f.run(); const value=await call(...args); f.controller.abort(); return value }
  const interrupted=await f.run()
  assert.equal(concurrent.outcome,'uncertain'); assert.equal(interrupted.outcome,'uncertain')
  assert.equal(f.db.inserts,1); assert.equal(interrupted.visibility_verified,false)
  assert.equal((await f.run()).outcome,'uncertain')
  await fs.unlink(join(f.api.lockDirectory,'prod-backup.lock')) // exact isolated lock; old simulated process ended
  const controller=new AbortController(); f.api.signal=controller.signal; f.api.publish=call
  assert.equal((await f.run()).outcome,'verified'); assert.equal(f.db.inserts,1)
})

test('resume refuses changing binding; errors and injected secret fields never reach session files', async t => {
  const f=await publicationFixture(t)
  assert.equal((await f.run()).outcome,'verified')
  f.input.visibility_user_id=otherUser
  assert.equal((await f.run()).diagnostic,'publication_binding_changed')
  f.input.visibility_user_id=userId
  f.api.publish=async()=>{ throw new ProductionError('publication_secret_password_do_not_copy') }
  const result=await f.run(); assert.equal(result.diagnostic,'publication_unobservable_details_suppressed')
  const files=await fs.readdir(f.folder)
  for(const file of files) assert.doesNotMatch(await fs.readFile(join(f.folder,file),'utf8'),/SECRET_|secret_password_do_not_copy/)
})

test('concurrent conflict after pre-read: PostgreSQL refusal is existing and ineligible, never a new key', async t => {
  const f=await publicationFixture(t)
  f.io.authorizePublish=async()=>{ f.insert({...f.publication, body:'Contenu concurrent.'}); return true }
  const result=await f.run()
  assert.equal(result.outcome,'existing_ineligible'); assert.equal(result.diagnostic,'publication_content_conflict')
  assert.equal(f.db.inserts,1); assert.equal(f.db.dispatches,1); assert.equal(result.binding.changelog.publication_key,payload.publication_key)
})

for (const kind of ['maintenance','freeze','release']) test(`${kind} changes during visibility checks: present notification never authorizes opening`, async t => {
  const f=await publicationFixture(t), attach=f.io.attachVisibilityEvidence
  f.io.attachVisibilityEvidence=async c=>{
    if(kind==='maintenance') f.remote.maintenance.state.maintenance_production=false
    if(kind==='freeze') f.remote.database.state.frozen=false
    if(kind==='release') f.remote.github.main='f'.repeat(40)
    return attach(c)
  }
  const result=await f.run()
  assert.equal(result.outcome,'existing_ineligible'); assert.equal(result.visibility_verified,false); assert.equal(f.db.inserts,1)
})

test('audience exception allows a newly registered eligible user, with unchanged individual state', async t => {
  const f=await publicationFixture(t)
  f.publication.include_new_users=true; f.publication.publication_context.include_new_users_justification='Annonce utile aux nouveaux inscrits.'
  f.reader.registered_at='2099-01-01T00:00:00Z'
  f.release.changelog=prepareChangelog(Buffer.from(JSON.stringify(f.publication)),f.release.version,f.release.changelog.file)
  assert.equal((await f.run()).outcome,'verified')
})

test('unreadable initial state never dispatches and does not claim absence', async t => {
  const f=await publicationFixture(t)
  f.api.readPublication=async()=>{throw new Error('SECRET_READ')}
  const result=await f.run()
  assert.equal(result.outcome,'not_published'); assert.equal(result.existence,'unobserved'); assert.equal(f.db.dispatches,0)
})

test('unknown secret fields in receipt or operator proof are rejected without persistence', async t => {
  for(const kind of ['receipt','proof']) {
    const f=await publicationFixture(t)
    if(kind==='receipt') {const call=f.api.publish; f.api.publish=async(...args)=>({...await call(...args),password:'SECRET_PASSWORD'})}
    else {const attach=f.io.attachVisibilityEvidence; f.io.attachVisibilityEvidence=async c=>({...await attach(c),token:'SECRET_TOKEN'})}
    assert.notEqual((await f.run()).outcome,'verified')
    for(const file of await fs.readdir(f.folder)) assert.doesNotMatch(await fs.readFile(join(f.folder,file),'utf8'),/SECRET_/)
  }
})

test('lock replacement, external session edit or ACL widening during proof prevents verified result', async t => {
  for(const kind of ['lock','session','permissions']) {
    const f=await publicationFixture(t), attach=f.io.attachVisibilityEvidence
    f.io.attachVisibilityEvidence=async c=>{
      if(kind==='lock') await fs.writeFile(join(f.api.lockDirectory,'prod-backup.lock'),JSON.stringify({nonce:randomUUID()}))
      if(kind==='session') await f.changeSession(s=>{s.external_edit=true})
      if(kind==='permissions') {
        if(process.platform==='win32') {
          const {execFileSync}=await import('node:child_process')
          execFileSync('icacls',[f.sessions,'/grant','*S-1-1-0:(R)'],{windowsHide:true,stdio:'pipe'})
        } else await fs.chmod(f.sessions,0o755)
      }
      return attach(c)
    }
    const result=await f.run(); assert.notEqual(result.outcome,'verified'); assert.equal(result.visibility_verified,false)
  }
})

test('API consumes protected-input channels before children, pins the existing publisher target, disposes secrets; no network', async t => {
  const f=await publicationFixture(t), caFile=join(f.root,'ca.crt'), targetFile=join(f.root,'publisher.json')
  await fs.writeFile(caFile,'synthetic CA bytes')
  const maintenance={format:'my-maintenance-target-v1',environment:'cloud',project,connection:'direct',host:`db.${project}.supabase.co`,
    port:5432,database:'postgres',user:'postgres',system_id:f.bundle.target.system_id,server_port:5432,ca_file:caFile,ca_sha256:hashBytes('synthetic CA bytes')}
  f.bundle.maintenance=maintenance
  const target={...maintenance,format:'my-notification-target-v1',user:'my_notification_publisher'}
  await fs.writeFile(targetFile,JSON.stringify(target))
  const secrets={key:Buffer.alloc(32,11).toString('base64'),password:'SECRET_OPERATOR',token:'SECRET_VERCEL',publisherPassword:'SECRET_PUBLISHER'}
  const channels={MY_BACKUP_KEY:secrets.key,MY_BACKUP_DATABASE_PASSWORD:secrets.password,MY_VERCEL_MAINTENANCE_TOKEN:secrets.token,
    MY_NOTIFICATION_DATABASE_PASSWORD:secrets.publisherPassword,MY_PRODUCTION_GITHUB_TOKEN:'SECRET_GITHUB'}
  const original=Object.fromEntries(Object.keys(channels).map(k=>[k,process.env[k]]))
  try {
    Object.assign(process.env,channels)
    assert.throws(()=>openPublicationAPI(f.bundle,secrets,{publisherTargetFile:targetFile,authorizeConnect:true}),/publication_secret_channels_not_consumed/)
    const consumed=consumeOpenSecrets()
    for(const key of Object.keys(channels)) assert.equal(process.env[key],undefined)
    const api=openPublicationAPI(f.bundle,consumed,{publisherTargetFile:targetFile,authorizeConnect:true})
    assert.equal(consumed.publisherPassword,undefined)
    assert.equal(api.setMaintenance,undefined); assert.equal(api.freeze,undefined)
    api.dispose(); assert.equal(Object.values(consumed).some(Boolean),false)
    await fs.writeFile(targetFile,JSON.stringify({...target,system_id:'9'}))
    assert.throws(()=>openPublicationAPI(f.bundle,{...secrets},{publisherTargetFile:targetFile,authorizeConnect:true}),/publisher_target_differs_from_session/)
  } finally { for(const [key,value] of Object.entries(original)) {if(value===undefined) delete process.env[key]; else process.env[key]=value} }
})

test('independent reader uses parameterized read-only SQL, actual identity, no RPC claims or writes, and closes after errors', async () => {
  const sql=[], values=[], identity={session_user:'postgres'}, result={observed_at:'2026-10-16T12:00:00Z',announcements:[],reader:null}
  const client={query:async (query,params)=>{sql.push(query);if(params) values.push(params);return {rows:[{result}]}},end:async()=>sql.push('end')}
  const actual=await readPublishedChangelog({}, {}, 'my.release.0.8.33','0.8.33',userId,async()=>({client,identity}))
  assert.equal(actual.identity,identity); assert.deepEqual(values, [['my.release.0.8.33','0.8.33',userId]])
  assert.equal(sql[0],'begin isolation level repeatable read read only'); assert.equal(sql.at(-1),'end')
  assert.equal(sql.some(s=>/set role|set_config|mark_notification|process_notification|grant |insert |update |delete /i.test(s)),false)
  client.query=async q=>{sql.push(q);if(q.startsWith('select'))throw new Error('SECRET_DATABASE')}
  await assert.rejects(readPublishedChangelog({}, {},'key','0.8.33',userId,async()=>({client,identity})),/SECRET_DATABASE/)
  assert.equal(sql.at(-2),'rollback');assert.equal(sql.at(-1),'end')
})

test('exact pinned bytes reject reformatting and replaced paths, even with identical canonical hash', async t => {
  const dir=await temporary(t), releases=join(dir,'scripts','notifications','releases')
  await fs.mkdir(releases,{recursive:true})
  const file='scripts/notifications/releases/0.8.33.json', actual=join(dir,file), bytes=Buffer.from(JSON.stringify(payload))
  await fs.writeFile(actual,bytes)
  const pinned=prepareChangelog(bytes,'0.8.33',file)
  assert.equal(readPinnedChangelog(pinned,'0.8.33',dir).publication_key,payload.publication_key)
  await fs.writeFile(actual,JSON.stringify(payload,null,2))
  assert.throws(()=>readPinnedChangelog(pinned,'0.8.33',dir),/changelog_worktree_differs_from_release/)
  const pkg=JSON.parse(readFileSync('package.json','utf8'))
  assert.equal(pkg.version,'0.8.33'); assert.equal(pkg.scripts['prod:open'],undefined)
})
