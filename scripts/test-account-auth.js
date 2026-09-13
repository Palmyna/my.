// Local Auth contract checks. Fixtures and credentials stay scoped to this process.
// Exit 1 when any requested server protection is absent, while still testing email/recovery.
import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { createAuthService } from '../src/services/auth.ts'

let passed = 0
let failed = 0
function check(value, name) {
  if (!value) { failed++; console.log(`FAIL ${name}`) }
  else { passed++; console.log(`PASS ${name}`) }
}
async function data(promise, name) {
  const result = await promise
  if (result.error) throw new Error(`${name}: ${result.error.code ?? 'Auth error'}`)
  return result.data
}
let settings
try {
  settings = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))
} catch { throw new Error('Supabase local status unavailable. Start the MY. local stack before this test.') }
if (new URL(settings.API_URL).origin !== 'http://127.0.0.1:55321'
  || new URL(settings.DB_URL).hostname !== '127.0.0.1' || new URL(settings.DB_URL).port !== '55322') throw new Error('Local MY. stack required')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options)
const db = new pg.Client({ connectionString: settings.DB_URL })
await db.connect()
const fixtures = []
const recipients = new Set()
const mailpit = 'http://127.0.0.1:55324'
const redirectTo = 'http://localhost:5173/auth/confirm-email-change'
const password = () => `My!4${randomBytes(24).toString('hex')}`
const jwt = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))
const counts = async () => (await db.query(`select
  (select count(*)::int from auth.users) users, (select count(*)::int from auth.sessions) sessions,
  (select count(*)::int from auth.mfa_factors) factors, (select count(*)::int from auth.mfa_challenges) challenges,
  (select count(*)::int from public.profiles) profiles, (select count(*)::int from public.collections) collections,
  (select count(*)::int from public.user_preferences) preferences,
  (select count(*)::int from public.catalog_variants) variants,
  (select count(*)::int from supabase_migrations.schema_migrations) migrations`)).rows[0]
const baseline = await counts()
console.log('BEFORE', JSON.stringify(baseline))
const snapshot = async id => (await db.query(`select
  (select to_jsonb(p) from public.profiles p where id=$1) profile,
  (select jsonb_agg(c order by id) from public.collections c where owner_id=$1) collections`, [id])).rows[0]
const session = async fixture => (await data(fixture.client.auth.getSession(), 'session')).session
async function update(fixture, body) {
  const token = (await session(fixture)).access_token
  const response = await fetch(`${settings.API_URL}/auth/v1/user`, { method: 'PUT',
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => Number.parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  key.fill(0)
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}
async function mfa(fixture) {
  const challenge = await data(fixture.client.auth.mfa.challenge({ factorId: fixture.factorId }), 'challenge')
  await data(fixture.client.auth.mfa.verify({ factorId: fixture.factorId, challengeId: challenge.id, code: totp(fixture.secret) }), 'verify')
}
async function fixture() {
  const email = `my-phase4-${randomUUID()}@example.test`
  recipients.add(email)
  const currentPassword = password()
  const { user } = await data(admin.auth.admin.createUser({ email, password: currentPassword, email_confirm: true }), 'create fixture')
  const client = createClient(settings.API_URL, settings.ANON_KEY, options)
  const value = { id: user.id, email, password: currentPassword, client, service: createAuthService(client) }
  fixtures.push(value)
  await data(client.auth.signInWithPassword({ email, password: currentPassword }), 'sign in')
  const factor = await data(client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MY. local account test' }), 'enroll fixture')
  value.factorId = factor.id
  value.secret = factor.totp.secret
  await mfa(value)
  await db.query("insert into public.collections(owner_id, name, collection_type) values ($1, 'Phase 4 fixture', 'free')", [value.id])
  return value
}
async function messageFor(address, consumed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${mailpit}/api/v1/messages?limit=100`)
    const list = await response.json()
    const message = list.messages.find(message => !consumed.has(message.ID) && message.To.some(to => to.Address === address))
    if (message) {
      consumed.add(message.ID)
      return fetch(`${mailpit}/api/v1/message/${message.ID}`).then(r => r.json())
    }
    await delay(250)
  }
  throw new Error('Fixture email not received')
}
function confirmationLink(message, type) {
  const links = [...(message.HTML ?? '').matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
  const link = links.find(link => link.includes('/auth/v1/verify?') && new URL(link).searchParams.get('type') === type)
  if (!link || new URL(link).origin !== settings.API_URL) throw new Error('Local confirmation link missing')
  return link
}
async function follow(link, expectedPath) {
  const response = await fetch(link, { redirect: 'manual' })
  if (response.status !== 303) throw new Error('Unexpected Auth verification status')
  const destination = new URL(response.headers.get('location'))
  if (destination.origin !== 'http://localhost:5173' || destination.pathname !== expectedPath) throw new Error('Unexpected Auth redirect')
  return new URLSearchParams(destination.hash.slice(1))
}
const readUser = async fixture => (await data(admin.auth.admin.getUserById(fixture.id), 'read fixture')).user
try {
  const health = await fetch(`${settings.API_URL}/auth/v1/health`, { headers: { apikey: settings.ANON_KEY } }).then(r => r.json())
  console.log('AUTH_VERSION', health.version)
  const first = await fixture()
  await data(first.client.auth.signInWithPassword({ email: first.email, password: first.password }), 'aal1 fixture')
  const deniedPassword = await update(first, { password: password() })
  const deniedEmail = await update(first, { email: `denied-${first.email}` })
  check(deniedPassword.status === 401 && deniedPassword.body.error_code === 'insufficient_aal', 'PASSWORD_AAL1_DENIED')
  check(deniedEmail.status === 401 && deniedEmail.body.error_code === 'insufficient_aal', 'EMAIL_AAL1_DENIED')
  await mfa(first)
  check(jwt((await session(first)).access_token).aal === 'aal2', 'NORMAL_AAL2')
  const missingPassword = password()
  const missing = await update(first, { password: missingPassword })
  check(missing.status === 400 && missing.body.error_code === 'current_password_required', 'PASSWORD_CURRENT_REQUIRED_SERVER')
  console.log('PASSWORD_WITHOUT_CURRENT_HTTP', missing.status)
  if (missing.status === 200) first.password = missingPassword
  const wrongPassword = password()
  const wrong = await update(first, { password: wrongPassword, current_password: 'wrong-current-password' })
  check(wrong.status === 400 && wrong.body.error_code === 'current_password_mismatch', 'PASSWORD_WRONG_CURRENT_DENIED_SERVER')
  console.log('PASSWORD_WRONG_CURRENT_HTTP', wrong.status)
  if (wrong.status === 200) first.password = wrongPassword
  const previousPassword = first.password
  const nextPassword = password()
  const changed = await update(first, { password: nextPassword, current_password: previousPassword })
  check(changed.status === 200, 'PASSWORD_CORRECT_CURRENT_SUCCEEDS')
  if (changed.status !== 200) throw new Error('Password fixture update failed')
  first.password = nextPassword
  check((await first.client.auth.signInWithPassword({ email: first.email, password: previousPassword })).error?.code === 'invalid_credentials', 'OLD_PASSWORD_REJECTED')
  await data(first.client.auth.signInWithPassword({ email: first.email, password: nextPassword }), 'new password login')
  check(true, 'NEW_PASSWORD_ACCEPTED')
  await mfa(first)

  const consumed = new Set()
  for (const [order, account] of [['new-first', first], ['old-first', await fixture()]]) {
    const before = await snapshot(account.id)
    const oldEmail = account.email
    const newEmail = `new-${oldEmail}`
    recipients.add(newEmail)
    const requested = await account.service.requestEmailChange(newEmail, redirectTo)
    check(requested.user.email === oldEmail && requested.user.new_email === newEmail, `${order}: EMAIL_PENDING`)
    const oldMessage = await messageFor(oldEmail, consumed)
    const newMessage = await messageFor(newEmail, consumed)
    const oldLink = confirmationLink(oldMessage, 'email_change')
    const newLink = confirmationLink(newMessage, 'email_change')
    check(oldLink !== newLink && oldMessage.ID !== newMessage.ID, `${order}: TWO_DISTINCT_CONFIRMATIONS`)
    const one = await follow(order === 'new-first' ? newLink : oldLink, '/auth/confirm-email-change')
    check(one.has('message') && !one.has('access_token') && !one.has('error'), `${order}: FIRST_LINK_MESSAGE_WITHOUT_SESSION`)
    const waiting = await readUser(account)
    check(waiting.email === oldEmail && waiting.new_email === newEmail, `${order}: ONE_CONFIRMATION_NOT_FINAL`)
    const two = await follow(order === 'new-first' ? oldLink : newLink, '/auth/confirm-email-change')
    check(two.get('type') === 'email_change' && two.has('access_token') && two.has('refresh_token'), `${order}: SECOND_LINK_SESSION`)
    const completed = await readUser(account)
    check(completed.email === newEmail && !completed.new_email && completed.id === account.id, `${order}: BOTH_CONFIRMATIONS_FINAL`)
    account.email = newEmail
    await account.service.completeEmailCallback({ access_token: two.get('access_token'), refresh_token: two.get('refresh_token') }, 'email_change')
    check(await session(account) === null, `${order}: CALLBACK_ENDS_TECHNICAL_SESSION`)
    check(JSON.stringify(await snapshot(account.id)) === JSON.stringify(before), `${order}: PROFILE_AND_COLLECTION_UNCHANGED`)
  }

  await first.service.requestPasswordReset(first.email, 'http://localhost:5173/reset-password')
  const recoveryMail = await messageFor(first.email, consumed)
  const recovery = await follow(confirmationLink(recoveryMail, 'recovery'), '/reset-password')
  await first.service.completeEmailCallback({ access_token: recovery.get('access_token'), refresh_token: recovery.get('refresh_token') }, 'recovery')
  check(jwt((await session(first)).access_token).aal === 'aal1', 'RECOVERY_STARTS_AAL1')
  await mfa(first)
  const recoverySession = jwt((await session(first)).access_token).session_id
  await first.service.updatePassword(password())
  check(jwt((await session(first)).access_token).session_id === recoverySession, 'RECOVERY_WITHOUT_FORGOTTEN_PASSWORD_PRESERVES_SESSION')
} catch (error) {
  failed++
  console.error('PROBE_ERROR', error instanceof Error ? error.message : 'Unexpected local test error')
} finally {
  for (const account of fixtures) {
    try {
      await account.client.auth.signOut()
      await db.query('delete from public.collections where owner_id=$1', [account.id])
      await db.query('delete from public.profiles where id=$1', [account.id])
      await data(admin.auth.admin.deleteUser(account.id), 'fixture cleanup')
    } finally { account.password = undefined; account.secret = undefined }
  }
  const messages = await fetch(`${mailpit}/api/v1/messages?limit=100`).then(r => r.json())
  const ids = messages.messages.filter(message => message.To.some(to => recipients.has(to.Address))).map(message => message.ID)
  if (ids.length) {
    const removed = await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }) })
    check(removed.ok, 'TEMPORARY_EMAILS_REMOVED')
  }
  const after = await counts()
  console.log('AFTER', JSON.stringify(after))
  check(JSON.stringify(after) === JSON.stringify(baseline), 'FIXTURES_REMOVED_CATALOG_MIGRATIONS_PRESERVED')
  await db.end()
}
console.log('RESULT', JSON.stringify({ passed, failed }))
process.exitCode = failed ? 1 : 0
