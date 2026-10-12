import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { connect } from './catalog/database.ts'
import { cleanup, install, item, operation, parent, state, target, users, type Plan, type Result } from './collection-update-apply-fixtures.ts'

// Real PostgREST, Local only. JWT and reserved fixtures follow the existing API
// proofs; this script adds no application service or frontend mutation contract.
const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
  execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
assert.equal(settings.API_URL, 'http://127.0.0.1:55321')
const db = await connect()
let installed = false
function jwt(user: string, aal: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, aud: 'authenticated', role: 'authenticated', aal, exp: Math.floor(Date.now() / 1000) + 600 })}`
  return `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
}
async function rpc<T>(name: string, args: unknown, status = 200, user: string | null = users[0]!, aal = 'aal2'): Promise<T> {
  const response = await fetch(`${settings.API_URL}/rest/v1/rpc/${name}`, { method: 'POST', signal: AbortSignal.timeout(15_000),
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${user === null ? settings.ANON_KEY : jwt(user, aal)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args) })
  const data: unknown = await response.json()
  assert.equal(response.status, status, `${name}: ${JSON.stringify(data)}`)
  return data as T
}
const preview = () => rpc<Plan>('preview_collection_update', { p_collection_id: parent() })
const args = (plan: Plan, n: number) => ({ p_collection_id: parent(), p_preview_token: plan.token, p_operation_id: operation(n) })
try {
  await db.query('select pg_advisory_lock(830011)')
  await install(db); installed = true
  const initial = await preview(), before = await state(db)
  const started = Date.now()
  for (const changed of [
    { personal_revision: '3' }, { applied_target_version: '6' }, { target_version: '9' },
    { target_hash: 'b'.repeat(64) }, { plan_hash: 'b'.repeat(64) },
  ]) {
    const stale = await rpc<{ code: string; message: string; details: null; hint: null }>('apply_collection_update',
      { ...args(initial, 700), p_preview_token: { ...initial.token, ...changed } }, 409)
    assert.deepEqual(stale, { code: '40001', message: 'preview_stale', details: null, hint: null })
  }
  assert.ok(Date.now() - started < 5000, 'Five definitive stale conflicts return promptly without PostgREST internal retry loops')
  assert.deepEqual(await state(db), before, 'HTTP conflicts do not write items, revision or receipt')
  const invalid = await rpc<{ code: string; message: string }>('apply_collection_update',
    { ...args(initial, 700), p_preview_token: { ...initial.token, personal_revision: 2 } }, 400)
  assert.equal(invalid.code, '22023'); assert.equal(invalid.message, 'collection_operation_invalid')
  for (const [user, aal] of [[users[0]!, 'aal1'], [users[3]!, 'aal2'], [users[1]!, 'aal2'], [users[2]!, 'aal2']] as const) {
    const denied = await rpc<{ code: string; message: string }>('apply_collection_update', args(initial, 700), 403, user, aal)
    assert.equal(denied.code, '42501'); assert.equal(denied.message, 'collection_update_unavailable')
  }
  const anon = await rpc<{ code: string }>('apply_collection_update', args(initial, 700), 401, null)
  assert.equal(anon.code, '42501')
  for (const [id, message] of [[parent(2), 'collection_update_ineligible'], [parent(8), 'order_contract_upgrade_required']] as const) {
    const denied = await rpc<{ code: string; message: string }>('apply_collection_update', { ...args(initial, 700), p_collection_id: id }, 400)
    assert.equal(denied.code, '23514'); assert.equal(denied.message, message)
  }
  console.log('PASS: actual HTTP 409/40001 preview_stale without internal retry delay; invalid format, AAL1/profile/sharing/third-party/anonymous/free/legacy denial')

  await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
  await db.query('update public.collections set personal_revision=9007199254740997,applied_target_version=9007199254740997 where id=$1', [parent()])
  await target(db, ['-95005', '-95002', '-95001', '9007199254740997'], '9007199254740999')
  await db.query('commit')
  const plan = await preview()
  await db.query("update public.collections set name='HTTP rename after preview' where id=$1", [parent()])
  await db.query("update public.physical_copies set note='HTTP note after preview' where user_id=$1", [users[0]])
  const firstArgs = args(plan, 701), result = await rpc<Result>('apply_collection_update', firstArgs)
  assert.deepEqual(Object.keys(result).sort(), ['applied_target_version', 'created_items', 'operation_id', 'outcome', 'personal_revision'])
  assert.equal(result.operation_id, operation(701)); assert.equal(result.outcome, 'applied')
  assert.equal(result.personal_revision, '9007199254740998'); assert.equal(result.applied_target_version, '9007199254740999')
  assert.equal(result.created_items.length, 1); assert.equal(result.created_items[0]!.variant_id, '9007199254740997')
  assert.match(result.created_items[0]!.collection_item_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const committed = await state(db)
  const reorderedToken = Object.fromEntries(Object.entries(plan.token).reverse())
  assert.deepEqual(await rpc('apply_collection_update', { ...firstArgs, p_preview_token: reorderedToken }), result)
  assert.deepEqual(await state(db), committed, 'Normalized key order retry is historical, no new UUID/revision')
  // Discard/ignore a committed response to model response loss; no real network
  // failure is claimed. Recovery uses the stored operation, not a fresh UUID.
  assert.deepEqual(await rpc('get_collection_operation_result', { p_collection_id: parent(), p_operation_id: operation(701) }), result)
  const collision = await rpc<{ code: string; message: string }>('apply_collection_update',
    { ...firstArgs, p_preview_token: { ...plan.token, personal_revision: '9007199254740998' } }, 409)
  assert.equal(collision.code, '23505'); assert.equal(collision.message, 'operation_id_conflict')
  const writerCollision = await rpc<{ message: string }>('set_collection_item_hidden', { p_collection_id: parent(), p_collection_item_id: item(1),
    p_is_hidden: false, p_expected_revision: '9007199254740998', p_operation_id: operation(701) }, 409)
  assert.equal(writerCollision.message, 'operation_id_conflict')
  const unavailable = await rpc<{ code: string; message: string }>('apply_collection_update', args(await preview(), 702), 400)
  assert.equal(unavailable.code, '23514'); assert.equal(unavailable.message, 'collection_update_not_available')
  console.log('PASS: exact HTTP result/BIGINT/created UUIDs, normalized retry, receipt recovery, cross-writer collision, no useful delta')

  await rpc('remove_manual_collection_item_v2', { p_collection_id: parent(), p_collection_item_id: item(4),
    p_expected_revision: '9007199254740998', p_operation_id: operation(703) })
  await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
  await target(db, [], '9007199254741000'); await db.query('commit')
  const changed = await state(db)
  assert.deepEqual(await rpc('apply_collection_update', firstArgs), result)
  assert.deepEqual(await rpc('get_collection_operation_result', { p_collection_id: parent(), p_operation_id: operation(701) }), result)
  assert.deepEqual(await state(db), changed, 'Historical HTTP retry independent of live subjects/catalogue')
  const staleAfterMutation = await rpc<{ message: string }>('apply_collection_update', args(plan, 704), 409)
  assert.equal(staleAfterMutation.message, 'preview_stale')
  console.log('PASS: historic result after real removal/catalogue change; fresh UUID with obsolete token rejected')
} finally {
  await db.query('rollback')
  if (installed) await cleanup(db)
  await db.end()
}
