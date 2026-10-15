import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { connect, localConnection } from './catalog/database.ts'
import { readFreeze, verifyContract } from './maintenance/database.js'

// Local only. Never print keys, tokens, passwords or TOTP secrets.
const settings = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }))
assert.equal(settings.API_URL, 'http://127.0.0.1:55321')
const db = await connect()
const url = new URL(localConnection())
url.username = 'authenticator'
const ordinary = new pg.Client({ connectionString: url.href, statement_timeout: 5000 })
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const authAdmin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options)
const probe = `prod7b21_probe_${randomBytes(8).toString('hex')}`
const wrapper = `${probe}_setter`
const accounts = []
let probeCreated = false, wrapperCreated = false, freezeUncertain = false, scenarios = 0
const pass = name => { scenarios++; console.log(`PASS ${name}`) }
const data = async result => { const value = await result; assert.equal(value.error, null); return value.data }
const relations = (await db.query(`select format('%I.%I',n.nspname,c.relname) relation
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind='r'
    and c.oid<>'private.business_write_freeze'::regclass order by 1`)).rows
async function snapshot() {
  const result = {}
  for (const { relation } of relations) result[relation] = (await db.query(`select count(*)::text count,
    encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') hash
    from ${relation} t`)).rows[0]
  result.auth = (await db.query(`select id,encode(sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex') hash
    from auth.users u order by id`)).rows
  return result
}
async function rest(token, path, method = 'GET', body) {
  const response = await fetch(`${settings.API_URL}/rest/v1/${path}`, { method,
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) })
  return { status: response.status, body: await response.json() }
}
const recognize = token => rest(token, `rpc/${probe}`, 'POST', {})
async function setRole(id, role) { await db.query('select private.set_app_role($1,$2)', [id, role]) }
function totp(secret) {
  const bits = [...secret].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => Number.parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  key.fill(0)
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}
let before
try {
  assert.equal((await readFreeze(db)).frozen, false, 'Never reopen a pre-existing freeze')
  await db.query('select pg_advisory_lock(830011)')
  before = await snapshot()
  await ordinary.connect()
  assert.equal((await ordinary.query('select session_user::text identity')).rows[0].identity, 'authenticator')
  // Ephemeral caller-only reader for actual Auth/PostgREST proof. Removed below.
  await db.query(`create function public.${probe}() returns boolean
    language sql stable security definer set search_path='' as $$ select private.is_super_admin() $$;
    revoke all on function public.${probe}() from public,anon,authenticated,service_role;
    grant execute on function public.${probe}() to authenticated`)
  probeCreated = true
  // Test-only owner-rights wrapper proves session_user survives SECURITY DEFINER.
  await db.query(`create function private.${wrapper}(p_id uuid,p_role text) returns void
    language sql security definer set search_path='' as $$ select private.set_app_role(p_id,p_role) $$;
    revoke all on function private.${wrapper}(uuid,text) from public,anon,authenticated,service_role;
    grant execute on function private.${wrapper}(uuid,text) to authenticated`)
  wrapperCreated = true
  await db.query("notify pgrst, 'reload schema'")
  for (let i = 0; i < 2; i++) {
    const email = `my-prod7b21-${randomUUID()}@example.test`
    const password = `My!${randomBytes(24).toString('hex')}`
    const { user } = await data(authAdmin.auth.admin.createUser({ email, password, email_confirm: true }))
    const client = createClient(settings.API_URL, settings.ANON_KEY, options)
    const account = { id: user.id, client }
    accounts.push(account)
    const { session } = await data(client.auth.signInWithPassword({ email, password }))
    account.aal1 = session.access_token
    await db.query("insert into public.collections(id,owner_id,name,collection_type) values($1,$2,'PROD7B21 synthetic private','free')",
      [randomUUID(), user.id])
  }
  const account = accounts[0], other = accounts[1]
  // Reload is asynchronous; wait only for the disposable reader to be visible.
  let initial
  for (let attempt = 0; attempt < 30; attempt++) {
    initial = await recognize(account.aal1)
    if (initial.status !== 404) break
    await delay(100)
  }
  assert.deepEqual(initial, { status: 200, body: false })
  assert.equal((await db.query('select count(*)::int n from private.app_role_assignments where user_id=any($1::uuid[])',
    [accounts.map(a => a.id)])).rows[0].n, 0)
  await data(account.client.auth.updateUser({ data: { role: 'super_admin', super_admin: true } }))
  const factor = await data(account.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PROD7B21 synthetic' }))
  const challenge = await data(account.client.auth.mfa.challenge({ factorId: factor.id }))
  const verified = await data(account.client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret) }))
  const token = verified.access_token
  assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).aal, 'aal2')
  assert.deepEqual(await recognize(token), { status: 200, body: false })
  pass('real Auth signup stays user; editable metadata grants nothing; real TOTP reaches AAL2')

  await ordinary.query('begin')
  await ordinary.query('set local role authenticated')
  await ordinary.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: account.id, aal: 'aal2', role: 'super_admin' })])
  for (const role of ['super_admin', 'user']) {
    await ordinary.query('savepoint denied')
    await assert.rejects(ordinary.query(`select private.${wrapper}($1,$2)`, [account.id, role]),
      { code: '42501', message: 'app_role_operator_required' })
    await ordinary.query('rollback to denied')
  }
  await ordinary.query('rollback')
  pass('real authenticator cannot grant/revoke through postgres SECURITY DEFINER wrapper')

  await setRole(account.id, 'super_admin')
  assert.deepEqual(await recognize(token), { status: 200, body: true })
  assert.deepEqual(await recognize(account.aal1), { status: 200, body: false })
  assert.deepEqual(await recognize(other.aal1), { status: 200, body: false })
  const visible = await rest(token, `collections?select=owner_id&owner_id=eq.${other.id}`)
  assert.deepEqual(visible, { status: 200, body: [] })
  assert.deepEqual(await rest(account.aal1, `collections?select=id&owner_id=eq.${account.id}`), { status: 200, body: [] })
  for (const name of ['set_app_role', 'is_super_admin']) {
    assert.equal((await rest(token, `rpc/${name}`, 'POST', {})).status, 404)
  }
  assert.ok([400, 404].includes((await rest(token, `profiles?id=eq.${account.id}`, 'PATCH', { role: 'super_admin' })).status))
  const parts = token.split('.')
  parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), role: 'super_admin', sub: other.id })).toString('base64url')
  assert.equal((await recognize(parts.join('.'))).status, 401)
  const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${parts[1]}.`
  assert.equal((await recognize(unsigned)).status, 401)
  pass('server role recognized; AAL1, other UUID, private collections, role RPC/profile writes and forged JWT remain denied')

  // Explicit test closure. Any failure after this point leaves Local frozen.
  freezeUncertain = true
  await db.query('select private.set_business_write_freeze(true)')
  const independent = await connect()
  try { assert.equal((await readFreeze(independent)).frozen, true) }
  finally { await independent.end() }
  assert.deepEqual(await recognize(token), { status: 200, body: true })
  const write = await rest(token, 'collections', 'POST', { name: 'Frozen super_admin', collection_type: 'free' })
  assert.equal(write.status, 503)
  assert.equal(write.body.code, 'PT503')
  assert.equal(write.body.message, 'business_writes_frozen')
  const blockedDeletion = await authAdmin.auth.admin.deleteUser(account.id)
  assert.equal(blockedDeletion.error?.status, 500)
  assert.deepEqual(await recognize(token), { status: 200, body: true })
  assert.equal((await verifyContract(db)).migrations, 51)
  pass('PROD.2 unchanged: super_admin write and Auth deletion frozen; reads stay available; operator contract verified')

  await setRole(account.id, 'user')
  assert.deepEqual(await recognize(token), { status: 200, body: false })
  await setRole(account.id, 'super_admin')
  assert.deepEqual(await recognize(token), { status: 200, body: true })
  pass('privileged revoke/regrant works; same signed token immediately reflects server state')
  // Reopen explicitly only after every closed-state assertion succeeded.
  await db.query('select private.set_business_write_freeze(false)')
  const reopened = await connect()
  try { assert.equal((await readFreeze(reopened)).frozen, false) }
  finally { await reopened.end() }
  freezeUncertain = false
  await data(authAdmin.auth.admin.deleteUser(account.id))
  assert.equal((await db.query('select count(*)::int n from private.app_role_assignments where user_id=$1', [account.id])).rows[0].n, 0)
  assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1', [account.id])).rows[0].n, 0)
  assert.deepEqual(await recognize(token), { status: 200, body: false })
  pass('real Auth hard deletion cascades assignment and MY. data; old signed token grants nothing')
} finally {
  await ordinary.query('rollback').catch(() => undefined)
  // Do not implicitly reopen after error, timeout or interruption.
  if (before) {
    for (const account of accounts) await db.query('delete from auth.users where id=$1', [account.id])
  }
  if (probeCreated) await db.query(`drop function public.${probe}()`)
  if (wrapperCreated) await db.query(`drop function private.${wrapper}(uuid,text)`)
  await db.query("notify pgrst, 'reload schema'")
  if (before) assert.deepEqual(await snapshot(), before, 'Personal data and Auth rows preserved; fixtures removed')
  await db.query('select pg_advisory_unlock(830011)')
  await ordinary.end().catch(() => undefined)
  await db.end()
  if (freezeUncertain) console.error('Local freeze left closed or uncertain; no automatic reopening. Inspect independently before explicit recovery.')
}
console.log(JSON.stringify({ scenarios, local_only: true }))
