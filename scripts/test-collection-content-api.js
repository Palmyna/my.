import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { assertLocalUrl } from './catalog/database.ts'

// Requires the Phase 6B.1 migration in the local database:
// node scripts/test-collection-content-api.js
// No reset/migration/start/config change. Committed synthetic fixtures are cleaned
// in finally. Never print CLI status, credentials, JWTs or HTTP response bodies.
let settings
try {
  settings = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30_000,
  }))
} catch {
  throw new Error('Local Supabase status unavailable; start/prepare the local stack separately')
}
assertLocalUrl(settings.DB_URL)
const api = new URL(settings.API_URL)
assert.ok(api.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)
  && api.port === '55321' && api.pathname === '/' && !api.search && !api.hash && !api.username && !api.password,
'Only the MY. local API is allowed')
assert.ok(typeof settings.JWT_SECRET === 'string' && settings.JWT_SECRET.length > 0, 'Local JWT secret required')
assert.ok(typeof settings.ANON_KEY === 'string' && settings.ANON_KEY.length > 0, 'Local API key required')

const users = [1, 2, 3].map(n => `a1600000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const collection = 'c1600000-0000-0000-0000-000000000003'
const client = new pg.Client({ connectionString: settings.DB_URL, connectionTimeoutMillis: 10_000 })
let installed = false
function token(user) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: user, role: 'authenticated', aud: 'authenticated', aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 300,
  })}`
  return `${unsigned}.${createHmac('sha256', settings.JWT_SECRET).update(unsigned).digest('base64url')}`
}
async function request(path, user, body) {
  const response = await fetch(new URL(`/rest/v1/${path}`, api), {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  assert.ok(response.status === 200 || (body === undefined && response.status === 206),
    'Local Data API request must succeed (partial content allowed only for the row-cap control)')
  const raw = await response.text()
  return { value: JSON.parse(raw), bytes: Buffer.byteLength(raw) }
}
try {
  await client.connect()
  await client.query("set statement_timeout = '30s'")
  await client.query('select pg_advisory_lock(616001)')
  const { rows } = await client.query("select to_regprocedure('public.get_collection_content(uuid)') is not null as ready")
  assert.equal(rows[0].ready, true, 'Phase 6B.1 must already be applied locally; this script never applies it')
  await client.query('begin')
  await client.query(readFileSync(new URL('../supabase/tests/database/collection_content.fixtures.inc', import.meta.url), 'utf8'))
  await client.query('commit')
  installed = true

  // Positive control: prove the actual local REST row cap is 1000, not merely
  // that PostgreSQL itself can aggregate 1005 elements. No config override.
  const direct = await request(`collection_items?collection_id=eq.${collection}&select=id&order=sort_position,id`, users[0])
  assert.equal(direct.value.length, 1000, 'This regression requires the configured REST max_rows=1000')
  const expectedIds = Array.from({ length: 1005 }, (_, n) => `d1610000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`)
  const keys = ['card_name_fr', 'collection_item_id', 'image_url', 'local_id', 'origin', 'owned', 'set_name_fr', 'variant_id', 'variant_label']
  let ownerPayload
  for (const user of users.slice(0, 2)) {
    const started = performance.now()
    const { value, bytes } = await request('rpc/get_collection_content', user, { p_collection_id: collection })
    assert.ok(Array.isArray(value), 'Scalar JSONB response must be the array itself')
    assert.equal(value.length, 1005, 'RPC must return all items beyond REST cap')
    assert.deepEqual(value.map(item => item.collection_item_id), expectedIds, 'Every ID exactly once in authoritative order')
    value.forEach((item, n) => {
      assert.deepEqual(Object.keys(item).sort(), keys, 'Exact minimal payload')
      assert.equal(item.variant_id, String(-86101 - n), 'Lossless variant ID')
      assert.equal(item.variant_label, `Fixture ${n + 1}`, 'Exact catalogue label')
      assert.equal(item.owned, false, 'No owner copies in volume fixture')
    })
    if (ownerPayload) assert.deepEqual(value, ownerPayload, 'Shared reader receives the same owner content')
    else ownerPayload = value
    console.log(`PASS: ${user === users[0] ? 'owner' : 'recipient'}, 1005 items, ${bytes} bytes, ${Math.round(performance.now() - started)} ms`)
  }
  // Wire representation preserves a BIGINT outside JavaScript's safe integers.
  const mixed = await request('rpc/get_collection_content', users[1], { p_collection_id: 'c1600000-0000-0000-0000-000000000001' })
  assert.equal(mixed.value[3].variant_id, '-9007199254740995')
  assert.equal(mixed.value[1].owned, true, 'A owns/B does not')
  assert.equal(mixed.value[2].owned, false, 'A does not own/B owns')
  const thirdParty = await request('rpc/get_collection_content', users[2], { p_collection_id: collection })
  assert.deepEqual(thirdParty.value, [], 'Third party denied over HTTP')
  console.log('PASS: REST cap control, complete ordered RPC, precise IDs and shared possession')
} finally {
  try {
    await client.query('rollback')
    if (installed) {
      await client.query('begin')
      await client.query('delete from auth.users where id=any($1::uuid[])', [users])
      await client.query('delete from public.catalog_variants where source_card_id in (-86001,-86002)')
      await client.query('delete from public.source_cards where id in (-86001,-86002)')
      await client.query('delete from public.tcg_sets where id in (-86001,-86002)')
      await client.query('delete from public.tcg_series where id=-86001')
      await client.query('commit')
      console.log('Synthetic content fixtures removed')
    }
  } finally {
    await client.end()
  }
}
