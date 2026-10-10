import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { connect } from './catalog/database.ts'

// Real PostgREST, local only, committed synthetic catalogue shared with pgTAP.
const settings = z.object({ API_URL: z.string(), ANON_KEY: z.string(), JWT_SECRET: z.string() }).parse(JSON.parse(
  execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })))
assert.equal(settings.API_URL, 'http://127.0.0.1:55321')
const users = [1, 2, 3].map(n => `a1100000-0000-0000-0000-${String(n).padStart(12, '0')}`)
type Envelope = { order_contract_version: number; personal_revision: string; items: { collection_item_id: string; variant_id: string; owned: boolean }[] }
type Result = { operation_id: string; outcome: string; personal_revision: string; collection_item_id: string }
const db = await connect()
let installed = false
function token(user: string, aal = 'aal2') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user, aud: 'authenticated', role: 'authenticated', aal, exp: Math.floor(Date.now() / 1000) + 600 })}`
  return `${body}.${createHmac('sha256', settings.JWT_SECRET).update(body).digest('base64url')}`
}
async function http<T>(path: string, method = 'GET', body?: unknown, user = users[0]!, status = 200, aal = 'aal2'): Promise<T> {
  const response = await fetch(`${settings.API_URL}/rest/v1/${path}`, { method, signal: AbortSignal.timeout(15_000),
    headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token(user, aal)}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data: unknown = await response.json()
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
  return data as T
}
const rpc = <T>(name: string, args: unknown, user = users[0]!, status = 200) => http<T>(`rpc/${name}`, 'POST', args, user, status)
const content = (parent: string, user = users[0]!) => rpc<Envelope | null>('get_collection_content_v2', { p_collection_id: parent }, user)
async function state(parent: string, revision: string, variants: string[], intentions: number, receipts: number) {
  const read = (await content(parent))!
  assert.equal(read.order_contract_version, 2)
  assert.equal(read.personal_revision, revision)
  assert.deepEqual(read.items.map(i => i.variant_id), variants)
  const materialized = (await db.query<{ variant_id: string }>(`select variant_id::text from public.collection_items where collection_id=$1 order by sort_position,id`, [parent])).rows
  assert.deepEqual(materialized.map(i => i.variant_id), variants)
  const counts = (await db.query<{ intentions: number; receipts: number }>(`select (select count(*)::int from private.collection_order_intents where collection_id=$1) intentions,
    (select count(*)::int from private.collection_operation_receipts where collection_id=$1) receipts`, [parent])).rows[0]
  assert.deepEqual(counts, { intentions, receipts })
}
try {
  await db.query('select pg_advisory_lock(830008)')
  assert.equal((await db.query<{ n: number }>('select count(*)::int n from auth.users where id=any($1::uuid[])', [users])).rows[0]!.n, 0, 'Fixture users must be free')
  assert.equal((await db.query<{ n: number }>('select count(*)::int n from public.pokemon where id in(-82001,-82002,-82003)')).rows[0]!.n, 0, 'Fixture catalogue must be free')
  await db.query('begin')
  await db.query('select pg_advisory_xact_lock(771402)')
  await db.query(readFileSync(new URL('../supabase/tests/database/automatic_collection.fixtures.inc', import.meta.url), 'utf8'))
  await db.query('commit'); installed = true

  const free = (await http<{ id: string }[]>('collections?select=id', 'POST', { name: 'Activation HTTP free', collection_type: 'free' }, users[0], 201))[0]!.id
  await state(free, '0', [], 0, 0)
  for (const body of [{ order_contract_version: 1 }, { order_contract_version: 2 }, { personal_revision: '9007199254740995' }]) {
    await http('collections', 'POST', { name: 'Forbidden client selection', collection_type: 'free', ...body }, users[0], 403)
    await http(`collections?id=eq.${free}`, 'PATCH', body, users[0], 403)
  }
  const addArgs = (variant: string, placement: string, revision: string, operation = randomUUID()) =>
    ({ p_collection_id: free, p_variant_id: variant, p_placement: placement, p_expected_revision: revision, p_operation_id: operation })
  const aArgs = addArgs('-82101', 'end', '0')
  const a = await rpc<Result>('add_manual_collection_item_v2', aArgs)
  assert.deepEqual(await rpc('add_manual_collection_item_v2', aArgs), a)
  await state(free, '1', ['-82101'], 1, 1)
  const b = await rpc<Result>('add_manual_collection_item_v2', addArgs('-82103', 'end', '1'))
  await state(free, '2', ['-82101', '-82103'], 2, 2)
  const moveArgs = { p_collection_id: free, p_item_id: b.collection_item_id, p_placement: 'before', p_anchor_id: a.collection_item_id,
    p_expected_revision: '2', p_operation_id: randomUUID() }
  const moved = await rpc<Result>('reorder_collection_item_v2', moveArgs)
  assert.deepEqual(await rpc('reorder_collection_item_v2', moveArgs), moved)
  await state(free, '3', ['-82103', '-82101'], 3, 3)
  const cArgs = addArgs('-9007199254740995', 'end', '3')
  // Simulated lost response after an actual HTTP commit. Discard writer result;
  // consult its exact operation UUID, without issuing a second gesture.
  await rpc('add_manual_collection_item_v2', cArgs)
  const c = await rpc<Result>('get_collection_operation_result', { p_collection_id: free, p_operation_id: cArgs.p_operation_id })
  assert.equal(c.personal_revision, '4'); assert.equal(c.operation_id, cArgs.p_operation_id)
  await state(free, '4', ['-82103', '-82101', '-9007199254740995'], 4, 4)
  await http('physical_copies', 'POST', { variant_id: '-82103', name: 'Preserved copy', note: 'Activation note' }, users[0], 201)
  const removeArgs = { p_collection_id: free, p_collection_item_id: b.collection_item_id, p_expected_revision: '4', p_operation_id: randomUUID() }
  const removed = await rpc<Result>('remove_manual_collection_item_v2', removeArgs)
  assert.deepEqual(await rpc('remove_manual_collection_item_v2', removeArgs), removed)
  await state(free, '5', ['-82101', '-9007199254740995'], 2, 5)
  const again = await rpc<Result>('add_manual_collection_item_v2', addArgs('-82103', 'end', '5'))
  assert.notEqual(again.collection_item_id, b.collection_item_id)
  await state(free, '6', ['-82101', '-9007199254740995', '-82103'], 3, 6)
  assert.equal((await http<{ note: string }[]>('physical_copies?select=note&variant_id=eq.-82103'))[0]!.note, 'Activation note')
  const conflictStarted = Date.now()
  for (const [writer, args] of [
    ['reorder_collection_item_v2', { ...moveArgs, p_item_id: again.collection_item_id, p_operation_id: randomUUID() }],
    ['add_manual_collection_item_v2', addArgs('-82103', 'end', '0')],
    ['remove_manual_collection_item_v2', { ...removeArgs, p_collection_item_id: again.collection_item_id, p_expected_revision: '0', p_operation_id: randomUUID() }],
  ] as const) {
    const stale = await rpc<{ code: string; message: string }>(writer, args, users[0], 409)
    assert.equal(stale.code, '40001'); assert.equal(stale.message, 'collection_structure_conflict')
  }
  assert.ok(Date.now() - conflictStarted < 5000, 'All three definitive conflicts return promptly, without a transaction retry loop')
  const collision = await rpc<{ message: string }>('add_manual_collection_item_v2', { ...aArgs, p_variant_id: '-82103' }, users[0], 409)
  assert.equal(collision.message, 'operation_id_conflict')
  const duplicate = await rpc<{ message: string }>('add_manual_collection_item_v2', addArgs('-82103', 'end', '6'), users[0], 409)
  assert.equal(duplicate.message, 'already_present', 'A fresh action after tab loss still cannot duplicate an existing variant')
  await state(free, '6', ['-82101', '-9007199254740995', '-82103'], 3, 6)
  const progress = await http<{ owned_count: number; total_count: number }[]>(`dashboard_collections?select=owned_count,total_count&collection_id=eq.${free}`)
  assert.deepEqual(progress, [{ owned_count: 1, total_count: 3 }])
  console.log('PASS: new free creation, exact BIGINT, full lifecycle, every revision/order/journal/receipt, retry, lost-response receipt, stale/collision, copies/notes/progress.')

  for (const [type, variants] of [['pokemon', ['-82101', '-9007199254740995']], ['set', ['-82103', '-82101', '-9007199254740995']]] as const) {
    const args = { p_name: `Activation HTTP ${type}`, p_target_type: type, p_target_id: '-82001' }
    const automatic = (await rpc<{ collection_id: string; created: boolean }[]>('create_automatic_collection', args))[0]!
    assert.equal(automatic.created, true)
    await state(automatic.collection_id, '0', [...variants], 0, 0)
    assert.deepEqual(await rpc('create_automatic_collection', { ...args, p_name: null }), [{ ...automatic, created: false }])
    const first = (await content(automatic.collection_id))!.items[0]!
    const forbidden = await rpc<{ message: string }>('remove_manual_collection_item_v2', { p_collection_id: automatic.collection_id,
      p_collection_item_id: first.collection_item_id, p_expected_revision: '0', p_operation_id: randomUUID() }, users[0], 400)
    assert.equal(forbidden.message, 'automatic_item_removal_forbidden')
  }
  console.log('PASS: Pokémon and Extension creation, canonical complete ordering, no initial journal/receipt, reopen identity, automatic removal refusal.')

  // Sharing management is not exposed by the current client. Install/revoke only
  // this synthetic share in SQL; exercise recipient reads and refusals via HTTP.
  const share = (await db.query<{ id: string }>('insert into public.collection_shares(collection_id,recipient_user_id) values($1,$2) returning id', [free, users[1]])).rows[0]!
  assert.deepEqual(await content(free, users[1]), await content(free))
  assert.deepEqual(await http(`dashboard_collections?select=owned_count,total_count&collection_id=eq.${free}`, 'GET', undefined, users[1]), progress)
  assert.equal((await http<{ note: string }[]>('physical_copies?select=note&variant_id=eq.-82103', 'GET', undefined, users[1]))[0]!.note, 'Activation note')
  await rpc('add_manual_collection_item_v2', addArgs('-82103', 'end', '6'), users[1], 403)
  await rpc('remove_manual_collection_item_v2', { ...removeArgs, p_expected_revision: '6', p_operation_id: randomUUID() }, users[1], 403)
  await rpc('reorder_collection_item_v2', { ...moveArgs, p_expected_revision: '6', p_operation_id: randomUUID() }, users[1], 403)
  await rpc('get_collection_operation_result', { p_collection_id: free, p_operation_id: aArgs.p_operation_id }, users[1], 403)
  assert.equal(await http('rpc/get_collection_content_v2', 'POST', { p_collection_id: free }, users[0], 200, 'aal1'), null)
  await http('rpc/add_manual_collection_item_v2', 'POST', addArgs('-82103', 'end', '6'), users[0], 403, 'aal1')
  assert.equal(await content(free, users[2]), null)
  await db.query('delete from public.collection_shares where id=$1 and collection_id=$2', [share.id, free])
  assert.equal(await content(free, users[1]), null)
  await state(free, '6', ['-82101', '-9007199254740995', '-82103'], 3, 6)
  console.log('PASS: shared owner order/copies/notes/progress, all owner mutations and receipts denied, MFA, third party isolation, revocation, unchanged parent.')
} finally {
  try {
    await db.query('rollback')
    if (installed) {
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(771402)')
      await db.query('delete from auth.users where id=any($1::uuid[])', [users])
      await db.query('delete from public.automatic_target_states where id in(-82001,-82002,-82003,-82004,-82005)')
      await db.query('delete from public.card_pokemon where card_id in(-82001,-82002)')
      await db.query('delete from public.catalog_variants where id in(-82101,-82103,-9007199254740995)')
      await db.query('delete from public.source_cards where id in(-82001,-82002)')
      await db.query('delete from public.tcg_sets where id in(-82001,-82002,-82003,-82004)')
      await db.query('delete from public.tcg_series where id=-82001')
      await db.query('delete from public.pokemon where id in(-82001,-82002,-82003)')
      await db.query('commit')
      assert.equal((await db.query<{ n: number }>('select count(*)::int n from auth.users where id=any($1::uuid[])', [users])).rows[0]!.n, 0)
      console.log('PASS: synthetic API fixtures removed.')
    }
  } finally { await db.end() }
}
