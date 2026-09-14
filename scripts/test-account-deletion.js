// Real local Edge/Auth/SQL contract. No credentials, tokens or TOTP secrets on disk.
import { execFileSync } from 'node:child_process'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

let settings
try {
  settings = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))
} catch { throw new Error('Start the MY. local stack and serve delete-account before this test.') }
if (new URL(settings.API_URL).origin !== 'http://127.0.0.1:55321'
  || new URL(settings.DB_URL).hostname !== '127.0.0.1' || new URL(settings.DB_URL).port !== '55322') throw new Error('Local MY. stack required')
const endpoint = `${settings.API_URL}/functions/v1/delete-account`
if ((await fetch(endpoint)).status !== 405) throw new Error('Local delete-account function unavailable')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options)
const db = new pg.Client({ connectionString: settings.DB_URL })
await db.connect()
const accounts = []
let passed = 0
let failed = 0
function check(value, name) {
  if (value) { passed++; console.log(`PASS ${name}`) }
  else { failed++; console.log(`FAIL ${name}`) }
}
async function data(promise, name) {
  const result = await promise
  if (result.error) throw new Error(`${name}: ${result.error.code ?? 'Auth error'}`)
  return result.data
}
const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))
const session = async account => (await data(account.client.auth.getSession(), 'session')).session
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => Number.parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  key.fill(0)
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}
async function elevate(account) {
  const challenge = await data(account.client.auth.mfa.challenge({ factorId: account.factorId }), 'challenge')
  await data(account.client.auth.mfa.verify({ factorId: account.factorId, challengeId: challenge.id, code: totp(account.secret) }), 'MFA')
}
async function login(account) {
  await data(account.client.auth.signInWithPassword({ email: account.email, password: account.password }), 'login')
  await elevate(account)
  account.originalSession = await session(account)
}
async function fixture() {
  const email = `my-delete-${randomUUID()}@example.test`
  const password = `My!4${randomBytes(24).toString('hex')}`
  const { user } = await data(admin.auth.admin.createUser({ email, password, email_confirm: true }), 'fixture creation')
  const account = { id: user.id, email, password, client: createClient(settings.API_URL, settings.ANON_KEY, options) }
  accounts.push(account)
  await data(account.client.auth.signInWithPassword({ email, password }), 'initial fixture login')
  const factor = await data(account.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MY. deletion test' }), 'enroll')
  account.factorId = factor.id
  account.secret = factor.totp.secret
  await elevate(account)
  account.originalSession = await session(account)
  return account
}
const publicTables = ['pokemon','tcg_series','tcg_sets','source_cards','catalog_variants','card_pokemon','automatic_target_states','profiles','collections','collection_items','physical_copies','collection_shares','user_preferences']
const catalogueTables = [...publicTables.slice(0, 7).map(t => `public.${t}`), 'private.catalog_sync_runs', 'private.catalog_overrides', 'private.catalog_entity_keys']
const fingerprint = async tables => {
  const hashes = {}
  for (const table of tables) {
    // Table names are exclusively hardcoded test constants. Hash the full rows,
    // including timestamps/notes/catalogue corrections, not just their counts.
    const { rows } = await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)
    hashes[table] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
  }
  return hashes
}
const authCounts = async () => (await db.query(`select
  (select count(*)::int from auth.users) users, (select count(*)::int from auth.sessions) sessions,
  (select count(*)::int from auth.mfa_factors) factors, (select count(*)::int from auth.mfa_challenges) challenges,
  (select count(*)::int from auth.identities) identities`)).rows[0]
const initialCatalogue = await fingerprint(catalogueTables)
const initialApp = await fingerprint(publicTables.slice(7).map(t => `public.${t}`))
const initialAuth = await authCounts()
console.log('BEFORE_AUTH', JSON.stringify(initialAuth))
console.log('BEFORE_CATALOGUE_COUNTS', JSON.stringify(Object.fromEntries(Object.entries(initialCatalogue).map(([k, v]) => [k, v.count]))))
const ownData = async id => (await db.query(`select
  (select to_jsonb(p) from public.profiles p where id=$1) profile,
  (select to_jsonb(p) from public.user_preferences p where user_id=$1) preferences,
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.collections c where owner_id=$1) collections,
  (select jsonb_agg(to_jsonb(i) order by i.id) from public.collection_items i join public.collections c on c.id=i.collection_id where c.owner_id=$1) items,
  (select jsonb_agg(to_jsonb(p) order by p.id) from public.physical_copies p where user_id=$1) copies`, [id])).rows[0]
const allShares = async () => (await db.query('select * from public.collection_shares order by id')).rows
async function invoke(account, overrides = {}, token = account.originalSession.access_token) {
  const response = await fetch(endpoint, { method: 'POST',
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: account.password, totpCode: totp(account.secret), confirmConsequences: true, confirmDeletion: true, ...overrides }) })
  return { status: response.status, body: await response.json() }
}
async function stillExists(account) { return !(await admin.auth.admin.getUserById(account.id)).error }
let failureGuard = false
try {
  const a = await fixture()
  const b = await fixture()
  const c = await fixture()
  const variant = (await db.query('select id from public.catalog_variants order by id limit 1')).rows[0]?.id
  if (!variant) throw new Error('Local catalogue fixture reference missing')
  for (const account of [a, b]) {
    const collections = (await db.query(`insert into public.collections(owner_id,name,collection_type)
      values ($1,'Deletion shared fixture','free'),($1,'Deletion private fixture','free') returning id`, [account.id])).rows
    account.collectionIds = collections.map(row => row.id)
    await db.query(`insert into public.collection_items(collection_id,variant_id,origin,sort_position)
      select unnest($1::uuid[]),$2,'manual',1`, [account.collectionIds, variant])
    await db.query(`insert into public.physical_copies(user_id,variant_id,condition,is_graded,grading_company,grading_score,note)
      values ($1,$2,'Good',true,'PSA','9','Private graded fixture'),($1,$2,'Good',false,null,null,'Second physical copy')`, [account.id, variant])
    await db.query('insert into public.user_preferences(user_id) values ($1)', [account.id])
  }
  await db.query(`insert into public.collection_shares(collection_id,recipient_user_id)
    values ($1,$2),($3,$4),($3,$5)`, [a.collectionIds[0], b.id, b.collectionIds[0], a.id, c.id])
  const beforeA = await ownData(a.id)
  const beforeB = await ownData(b.id)
  const beforeShares = await allShares()
  const denied = async (name, overrides, expected) => {
    const result = await invoke(a, overrides)
    check(result.status === expected && !result.body.deleted && await stillExists(a), name)
  }
  check(decode(a.originalSession.access_token).aal === 'aal2', 'NORMAL_AAL2')
  await denied('AAL2_ALONE_INSUFFICIENT', { currentPassword: undefined, totpCode: undefined, confirmConsequences: undefined, confirmDeletion: undefined }, 400)
  await denied('PASSWORD_ABSENT_DENIED', { currentPassword: undefined }, 400)
  await denied('PASSWORD_WRONG_DENIED', { currentPassword: 'wrong-password' }, 403)
  await denied('CORRECT_PASSWORD_WITHOUT_TOTP_DENIED', { totpCode: undefined }, 400)
  const correctCode = totp(a.secret)
  await denied('WRONG_TOTP_DENIED', { totpCode: correctCode === '000000' ? '111111' : '000000' }, 403)
  await denied('CONSEQUENCES_CONFIRMATION_REQUIRED', { confirmConsequences: false }, 400)
  await denied('FRESH_TOTP_WITHOUT_FINAL_CONFIRMATION_DENIED', { confirmDeletion: false }, 400)
  await denied('ARBITRARY_USER_ID_DENIED', { user_id: b.id }, 400)
  await denied('FOREIGN_FACTOR_NOT_ACCEPTED', { factorId: b.factorId }, 400)
  await denied('CLIENT_CHALLENGE_NOT_ACCEPTED', { challengeId: randomUUID() }, 400)
  const otherIdentity = await invoke(a, {}, b.originalSession.access_token)
  check(otherIdentity.status === 403 && await stillExists(a) && await stillExists(b), 'OTHER_IDENTITY_PASSWORD_MISMATCH_DENIED')

  await data(a.client.auth.signInWithPassword({ email: a.email, password: a.password }), 'aal1 login')
  const aal1 = await session(a)
  check((await invoke(a, {}, aal1.access_token)).status === 403, 'INITIAL_AAL1_DENIED')
  // Native challenge security is exercised directly; these proofs cannot be passed
  // into delete-account, which always creates its own challenge after password login.
  const consumed = await data(a.client.auth.mfa.challenge({ factorId: a.factorId }), 'consumed challenge')
  await data(a.client.auth.mfa.verify({ factorId: a.factorId, challengeId: consumed.id, code: totp(a.secret) }), 'consume challenge')
  check(!!(await a.client.auth.mfa.verify({ factorId: a.factorId, challengeId: consumed.id, code: totp(a.secret) })).error, 'NATIVE_CHALLENGE_REPLAY_DENIED')
  check(!!(await a.client.auth.mfa.verify({ factorId: a.factorId, challengeId: randomUUID(), code: totp(a.secret) })).error, 'NATIVE_INVALID_CHALLENGE_DENIED')
  check(!!(await a.client.auth.mfa.challenge({ factorId: b.factorId })).error, 'NATIVE_FOREIGN_FACTOR_DENIED')
  const expired = await data(a.client.auth.mfa.challenge({ factorId: a.factorId }), 'expiry challenge')
  await db.query("update auth.mfa_challenges set created_at = now() - interval '1 day' where id=$1 and factor_id=$2", [expired.id, a.factorId])
  check(!!(await a.client.auth.mfa.verify({ factorId: a.factorId, challengeId: expired.id, code: totp(a.secret) })).error, 'NATIVE_EXPIRED_CHALLENGE_DENIED')
  await login(a)
  check(JSON.stringify(await ownData(a.id)) === JSON.stringify(beforeA) && JSON.stringify(await allShares()) === JSON.stringify(beforeShares), 'ALL_REFUSALS_PRESERVE_APPLICATION_DATA')

  // A temporary FK causes a late profile DELETE failure through real Auth Admin.
  // This tests rollback of earlier collection/copy/share DELETEs across the HTTP path.
  await db.query('create table private.account_deletion_integration_guard(profile_id uuid references public.profiles(id) on delete restrict)')
  failureGuard = true
  await db.query('insert into private.account_deletion_integration_guard values ($1)', [a.id])
  const aborted = await invoke(a)
  check(aborted.status === 503 && aborted.body.error === 'deletion_failed', 'AUTH_DELETE_SQL_FAILURE_REPORTED')
  check(await stillExists(a) && JSON.stringify(await ownData(a.id)) === JSON.stringify(beforeA)
    && JSON.stringify(await allShares()) === JSON.stringify(beforeShares), 'AUTH_SQL_FAILURE_ROLLS_BACK_ALL_DATA')
  await db.query('drop table private.account_deletion_integration_guard')
  failureGuard = false
  // Revocation precedes destruction: after failure the user signs in again to retry.
  await login(a)
  const staleSession = a.originalSession
  const deleted = await invoke(a)
  check(deleted.status === 200 && deleted.body.deleted === true, 'COMPLETE_FRESH_FLOW_DELETES_ACCOUNT')
  check(!await stillExists(a), 'AUTH_ACCOUNT_ABSENT')
  const gone = await ownData(a.id)
  check(Object.values(gone).every(value => value === null), 'PROFILE_PREFERENCES_COLLECTIONS_ITEMS_COPIES_REMOVED')
  const shares = await allShares()
  const expectedShares = beforeShares.filter(row => row.recipient_user_id !== a.id && !a.collectionIds.includes(row.collection_id))
  check(JSON.stringify(shares) === JSON.stringify(expectedShares), 'BOTH_SHARING_DIRECTIONS_CLEANED_OTHER_RECIPIENT_PRESERVED')
  check(JSON.stringify(await ownData(b.id)) === JSON.stringify(beforeB), 'SECOND_USER_DATA_BYTE_FOR_BYTE_UNCHANGED')
  check((await db.query('select count(*)::int n from auth.sessions where user_id=$1', [a.id])).rows[0].n === 0, 'ALL_DELETED_USER_SESSIONS_REMOVED')
  check(!!(await a.client.auth.getUser(staleSession.access_token)).error, 'OLD_TOKEN_CANNOT_RESTORE_MY_AUTH')
  const oldClient = createClient(settings.API_URL, settings.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${staleSession.access_token}` } } })
  for (const table of publicTables) {
    const read = await oldClient.from(table).select('*').limit(1)
    check(!read.error && read.data.length === 0, `RESIDUAL_JWT_CLOSED_${table}`)
  }
  check(!!(await oldClient.from('collections').insert({ name: 'Old token', collection_type: 'free' })).error, 'RESIDUAL_JWT_CANNOT_WRITE')
  check(!!(await a.client.auth.refreshSession({ refresh_token: staleSession.refresh_token })).error, 'OLD_REFRESH_TOKEN_REJECTED')
  check((await invoke(a, {}, staleSession.access_token)).status === 401, 'REPEATED_DELETE_WITH_OLD_TOKEN_DENIED')
  const bRows = await data(b.client.from('collections').select('id'), 'remaining owner access')
  check(bRows.length === 2 && bRows.every(row => b.collectionIds.includes(row.id)), 'OTHER_USER_NORMAL_ACCESS_PRESERVED')
  check(JSON.stringify(await fingerprint(catalogueTables)) === JSON.stringify(initialCatalogue), 'FULL_CATALOGUE_ROWS_AND_LOGS_UNCHANGED')
} catch (error) {
  failed++
  // Only controlled test messages, never SDK response objects or request bodies.
  console.error('INTEGRATION_ERROR', error instanceof Error ? error.message : 'Local test failed')
} finally {
  if (failureGuard) await db.query('drop table private.account_deletion_integration_guard')
  for (const account of accounts) {
    const result = await admin.auth.admin.deleteUser(account.id)
    if (result.error && result.error.code !== 'user_not_found') { failed++; console.error('FIXTURE_CLEANUP_FAILED') }
    account.password = undefined
    account.secret = undefined
  }
  // Auth audit entries have no user FK; remove only entries naming these fixtures.
  await db.query(`delete from auth.audit_log_entries where payload->>'actor_id' = any($1::text[])
    or payload->>'user_id' = any($1::text[]) or payload->>'actor_username' = any($2::text[])
    or payload#>>'{traits,user_id}' = any($1::text[]) or payload#>>'{traits,user_email}' = any($2::text[])`, [accounts.map(a => a.id), accounts.map(a => a.email)])
  const auditRemainder = await db.query(`select count(*)::int n from auth.audit_log_entries
    where payload->>'actor_id' = any($1::text[]) or payload#>>'{traits,user_id}' = any($1::text[])
    or payload->>'actor_username' = any($2::text[]) or payload#>>'{traits,user_email}' = any($2::text[])`, [accounts.map(a => a.id), accounts.map(a => a.email)])
  check(auditRemainder.rows[0].n === 0, 'FIXTURE_AUTH_AUDIT_ENTRIES_REMOVED')
  const mailpit = 'http://127.0.0.1:55324'
  const mail = await fetch(`${mailpit}/api/v1/messages?limit=100`).then(r => r.json())
  const addresses = new Set(accounts.map(a => a.email))
  const ids = mail.messages.filter(m => m.To.some(to => addresses.has(to.Address))).map(m => m.ID)
  if (ids.length) await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }) })
  const finalAuth = await authCounts()
  check(JSON.stringify(finalAuth) === JSON.stringify(initialAuth), 'AUTH_FIXTURES_REMOVED')
  check(JSON.stringify(await fingerprint(publicTables.slice(7).map(t => `public.${t}`))) === JSON.stringify(initialApp), 'PREEXISTING_APPLICATION_ROWS_PRESERVED')
  check(JSON.stringify(await fingerprint(catalogueTables)) === JSON.stringify(initialCatalogue), 'CATALOGUE_PRESERVED_AFTER_CLEANUP')
  console.log('AFTER_AUTH', JSON.stringify(finalAuth))
  await db.end()
}
console.log('RESULT', JSON.stringify({ passed, failed }))
process.exitCode = failed ? 1 : 0
