import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Same isolated, reserved fixtures as previous writers. connect() rejects Cloud.
const parent = (n = 1) => `c2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const item = (n: number) => `d2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const operation = (n: number) => `e2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const parents = [1, 2, 3, 4, 5, 6].map(parent)
const users = [1, 2, 3, 4].map(n => `a2500000-0000-0000-0000-${String(n).padStart(12, '0')}`)
type Client = Awaited<ReturnType<typeof connect>>
type Result = { operation_id: string; outcome: 'changed' | 'noop'; personal_revision: string; collection_item_id: string }
const clients: Client[] = []
const pids = new Map<Client, number>()
let installed = false

async function session(client: Client, isolation: 'read committed' | 'repeatable read' | 'serializable' = 'read committed') {
  await client.query(`begin isolation level ${isolation}`)
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
}
async function remove(client: Client, id: string, revision: string, op: number, collection = parent()) {
  return (await client.query<{ result: Result }>('select public.remove_manual_collection_item_v2($1,$2,$3::bigint,$4) result',
    [collection, id, revision, operation(op)])).rows[0]!.result
}
async function add(client: Client, variant: string, revision: string, op: number, collection = parent()) {
  return (await client.query<{ result: Result }>("select public.add_manual_collection_item_v2($1,$2::bigint,'end',$3::bigint,$4) result",
    [collection, variant, revision, operation(op)])).rows[0]!.result
}
async function move(client: Client, id: string, placement: string, revision: string, op: number) {
  return (await client.query<{ result: Result }>('select public.reorder_collection_item_v2($1,$2,$3,null,$4::bigint,$5) result',
    [parent(), id, placement, revision, operation(op)])).rows[0]!.result
}
function pending<T>(promise: Promise<T>) {
  return promise.then(result => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }))
}
function errorIs(error: unknown, code: string, message: string) {
  assert.ok(error instanceof Error)
  assert.equal((error as { code?: string }).code, code)
  assert.equal(error.message, message)
}
async function blocked(observer: Client, waiter: Client, holder: Client) {
  const deadline = Date.now() + 5000
  do {
    if ((await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked',
      [pids.get(waiter), pids.get(holder)])).rows[0]!.blocked) return
    await delay(25)
  } while (Date.now() < deadline)
  assert.fail('Expected real PostgreSQL parent lock wait was not observed')
}
async function state(client: Client, collection = parent()) {
  return (await client.query<{ data: unknown }>(`select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=$1),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=$1),
    'intents',(select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=$1),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=$1)) data`, [collection])).rows[0]!.data
}
async function fixtureCount(client: Client) {
  return (await client.query<{ n: string }>(`select
    (select count(*) from auth.users where id=any($1::uuid[])) +
    (select count(*) from public.profiles where id=any($1::uuid[])) +
    (select count(*) from public.collections where id=any($2::uuid[])) +
    (select count(*) from public.collection_items where collection_id=any($2::uuid[])) +
    (select count(*) from private.collection_order_intents where collection_id=any($2::uuid[])) +
    (select count(*) from private.collection_operation_receipts where collection_id=any($2::uuid[])) +
    (select count(*) from public.catalog_variants where id between -95021 and -95001 or id=9007199254740997) +
    (select count(*) from public.source_cards where id in (-95001,-95002,-95003,-95004)) +
    (select count(*) from public.tcg_sets where id in (-95001,-95002,-95003)) +
    (select count(*) from public.tcg_series where id=-95001) +
    (select count(*) from public.automatic_target_states where id=-95001) n`, [users, parents])).rows[0]!.n
}

async function read(client: Client, op: number, collection = parent()) {
  return (await client.query<{ result: Result | null }>('select public.get_collection_operation_result($1,$2) result',
    [collection, operation(op)])).rows[0]!.result
}

try {
  for (let n = 0; n < 4; n++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout='10s'")
    pids.set(client, (await client.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid)
  }
  const [observer, first, second, independent] = clients as [Client, Client, Client, Client]
  assert.equal(await fixtureCount(observer), '0', 'Reserved fixture identities must be unused')
  await observer.query('begin')
  for (const file of ['relative_order_writer.fixtures.inc', 'manual_collection_items_v2.fixtures.inc']) {
    await observer.query(readFileSync(new URL('../supabase/tests/database/' + file, import.meta.url), 'utf8'))
  }
  await observer.query('commit')
  installed = true

  // A NULL consultation completes before a later writer can accept that UUID.
  const initial = await state(observer)
  await session(second)
  assert.equal(await read(second, 600), null)
  await second.query('commit')
  assert.deepEqual(await state(observer), initial, 'NULL consultation writes nothing')
  await session(first)
  const moved = await move(first, item(2), 'start', '2', 600)
  assert.deepEqual(await state(observer), initial, 'Uncommitted writer invisible')
  assert.equal((await observer.query<{ n: number }>('select count(*)::int n from private.collection_operation_receipts where collection_id=$1 and operation_id=$2', [parent(), operation(600)])).rows[0]!.n, 0)
  await session(second)
  const waitingMove = pending(read(second, 600))
  await blocked(observer, second, first)
  // Another collection remains readable while first parent is locked.
  await session(independent)
  await independent.query("set local lock_timeout='500ms'")
  assert.equal(await read(independent, 600, parent(2)), null)
  await independent.query('commit')
  await first.query('commit')
  const afterMove = await state(observer)
  assert.deepEqual((await waitingMove).result, moved, 'Reader sees committed receipt after actual wait')
  await second.query('commit')
  assert.deepEqual(await state(observer), afterMove, 'Committed receipt consultation writes nothing')

  // Add and removal both serialize with consultation; result survives deletion.
  await session(first)
  const added = await add(first, '-95007', '3', 601)
  await session(second)
  const waitingAdd = pending(read(second, 601))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.deepEqual((await waitingAdd).result, added)
  const afterAdd = await state(observer)
  await second.query('commit')
  assert.deepEqual(await state(observer), afterAdd)
  await session(first)
  const removed = await remove(first, added.collection_item_id, '4', 602)
  await session(second)
  const waitingRemoval = pending(read(second, 602))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.deepEqual((await waitingRemoval).result, removed)
  assert.deepEqual(await read(second, 601), added, 'Historical add remains exact after subject deletion')
  assert.deepEqual(await read(second, 600), moved, 'Historical revision preserved')
  const afterRemoval = await state(observer)
  await second.query('commit')
  assert.deepEqual(await state(observer), afterRemoval)

  // A receipt visible only to its uncommitted writer disappears on rollback.
  await session(first)
  const abandoned = await remove(first, item(4), '5', 603)
  assert.deepEqual(await read(first, 603), abandoned)
  await session(second)
  const waitingRollback = pending(read(second, 603))
  await blocked(observer, second, first)
  await first.query('rollback')
  assert.equal((await waitingRollback).result, null, 'No accepted receipt after writer rollback')
  await second.query('commit')
  assert.deepEqual(await state(observer), afterRemoval)
  // Same UUID/parameters may still succeed later; NULL was not final failure.
  await session(first)
  assert.deepEqual(await remove(first, item(4), '5', 603), abandoned)
  await first.query('commit')
  const committed = await state(observer)
  await session(second)
  assert.deepEqual(await read(second, 603), abandoned)
  await second.query('commit')
  assert.deepEqual(await state(observer), committed)

  // Reader itself takes the parent lock and blocks a following structural writer.
  await session(first)
  assert.deepEqual(await read(first, 600), moved)
  await session(second)
  const behindReader = pending(move(second, item(5), 'start', '6', 604))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.equal((await behindReader).result?.personal_revision, '7')
  await second.query('commit')

  // Consultation does not acquire a catalogue lock or depend on the catalogue.
  const stable = await state(observer)
  await first.query('begin')
  await first.query('select pg_advisory_xact_lock(771402)')
  await session(second)
  await second.query("set local lock_timeout='500ms'")
  assert.deepEqual(await read(second, 600), moved)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory'", [pids.get(second)])).rows[0]!.n, 0)
  await second.query('commit')
  await first.query('rollback')
  assert.deepEqual(await state(observer), stable)

  for (const isolation of ['repeatable read', 'serializable'] as const) {
    await session(first, isolation)
    await assert.rejects(read(first, 600), { code: '40001', message: 'collection_structure_conflict' })
    await first.query('rollback')
  }
  await first.query('begin')
  await first.query('select id from public.collections where id=$1 for update', [parent()])
  await session(second)
  await second.query("set local lock_timeout='100ms'")
  await assert.rejects(read(second, 600), { code: '40001', message: 'collection_structure_conflict' })
  await second.query('rollback')
  await first.query('rollback')
  assert.deepEqual(await state(observer), stable)

  // Revalidate contract after an actual parent lock wait (synthetic parent only).
  await first.query('begin')
  await first.query('update public.collections set order_contract_version=1 where id=$1', [parent(4)])
  await session(second)
  const changedContract = pending(read(second, 600, parent(4)))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await changedContract).error, '23514', 'order_contract_upgrade_required')
  await second.query('rollback')

  await first.query('begin')
  await first.query('update public.collections set owner_id=$1 where id=$2', [users[2], parent()])
  await session(second)
  const formerOwner = pending(read(second, 600))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await formerOwner).error, '42501', 'collection_action_unavailable')
  await second.query('rollback')
  await observer.query('update public.collections set owner_id=$1 where id=$2', [users[0], parent()])
  await first.query('begin')
  await first.query('delete from public.collections where id=$1', [parent()])
  await session(second)
  const deletedParent = pending(read(second, 600))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await deletedParent).error, '42501', 'collection_action_unavailable')
  await second.query('rollback')
  console.log('PASS: four real PostgreSQL connections; move/add/remove receipt waits observed, commit visibility, rollback NULL then same UUID accepted, historical exact JSON, independent parents, reader blocks writer, no consultation mutation.')
  console.log('PASS: no catalogue lock, timeout/snapshot refusal, contract/current owner/deleted parent rechecked after actual wait. NULL is not proof a future operation cannot commit.')

} finally {
  await Promise.allSettled(clients.map(client => client.query('rollback')))
  try {
    if (installed) {
      const observer = clients[0]!
      await observer.query('begin')
      await observer.query('delete from public.collections where id=any($1::uuid[])', [parents])
      await observer.query('delete from auth.users where id=any($1::uuid[])', [users])
      await observer.query('delete from public.automatic_target_states where id=-95001')
      await observer.query('delete from public.catalog_variants where id between -95021 and -95001 or id=9007199254740997')
      await observer.query('delete from public.source_cards where id in (-95001,-95002,-95003,-95004)')
      await observer.query('delete from public.tcg_sets where id in (-95001,-95002,-95003)')
      await observer.query('delete from public.tcg_series where id=-95001')
      await observer.query('commit')
      assert.equal(await fixtureCount(observer), '0', 'Zero synthetic fixture residue')
      console.log('PASS: fixtures cleaned atomically; zero residue; real collections untouched.')
    }
  } finally { await Promise.allSettled(clients.map(client => client.end())) }
}
