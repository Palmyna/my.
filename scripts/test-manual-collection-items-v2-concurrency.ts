import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Committed synthetic fixtures only; connect() rejects remote/non-project DBs.
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
async function add(client: Client, variant: string, placement: string, revision: string, op: number, collection = parent()) {
  return (await client.query<{ result: Result }>('select public.add_manual_collection_item_v2($1,$2::bigint,$3,$4::bigint,$5) result',
    [collection, variant, placement, revision, operation(op)])).rows[0]!.result
}
async function move(client: Client, n: number, placement: string, revision: string, op: number) {
  return (await client.query<{ result: Result }>('select public.reorder_collection_item_v2($1,$2,$3,null,$4::bigint,$5) result',
    [parent(), item(n), placement, revision, operation(op)])).rows[0]!.result
}
function pending<T>(promise: Promise<T>) {
  return promise.then(result => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }))
}
async function blocked(observer: Client, waiter: Client, holder: Client) {
  const deadline = Date.now() + 5000
  do {
    if ((await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked',
      [pids.get(waiter), pids.get(holder)])).rows[0]!.blocked) return
    await delay(25)
  } while (Date.now() < deadline)
  assert.fail('Expected real PostgreSQL lock wait was not observed')
}
async function state(client: Client, collection = parent()) {
  return (await client.query<{ data: unknown }>(`select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=$1),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=$1),
    'intents',(select jsonb_agg(to_jsonb(e) order by sequence) from private.collection_order_intents e where collection_id=$1),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=$1)) data`, [collection])).rows[0]!.data
}
async function order(client: Client) {
  return (await client.query<{ id: string }>('select id from public.collection_items where collection_id=$1 order by sort_position,id', [parent()])).rows.map(r => r.id)
}
async function counts(client: Client) {
  return (await client.query<{ revision: string; adds: number; receipts: number }>(`select personal_revision::text revision,
    (select count(*)::int from private.collection_order_intents where collection_id=$1 and kind='manual_add' and sequence>2) adds,
    (select count(*)::int from private.collection_operation_receipts where collection_id=$1) receipts from public.collections where id=$1`, [parent()])).rows[0]!
}
function errorIs(error: unknown, code: string, message: string) {
  assert.ok(error instanceof Error)
  assert.equal((error as { code?: string }).code, code)
  assert.equal(error.message, message)
}

try {
  for (let n = 0; n < 4; n++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout='10s'")
    pids.set(client, (await client.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid)
  }
  const [observer, first, second, independent] = clients as [Client, Client, Client, Client]
  // Fail rather than modify an existing identity, even in this reserved range.
  const occupied = (await observer.query<{ n: string }>(`select
    (select count(*) from auth.users where id=any($1::uuid[])) +
    (select count(*) from public.collections where id=any($2::uuid[])) +
    (select count(*) from public.catalog_variants where id between -95021 and -95001 or id=9007199254740997) +
    (select count(*) from public.tcg_series where id=-95001) +
    (select count(*) from public.tcg_sets where id in (-95001,-95002,-95003)) +
    (select count(*) from public.source_cards where id in (-95001,-95002,-95003,-95004)) +
    (select count(*) from public.automatic_target_states where id=-95001) n`, [users, parents])).rows[0]!.n
  assert.equal(occupied, '0', 'Reserved fixture identities must be unused')
  await observer.query('begin')
  for (const file of ['relative_order_writer.fixtures.inc', 'manual_collection_items_v2.fixtures.inc']) {
    await observer.query(readFileSync(new URL(`../supabase/tests/database/${file}`, import.meta.url), 'utf8'))
  }
  await observer.query('commit')
  installed = true

  // Same parent, stale waiter, invisible uncommitted addition and independent parent.
  const before = await state(observer)
  await session(first)
  const firstAdd = await add(first, '-95007', 'end', '2', 201)
  assert.deepEqual(await state(observer), before, 'Uncommitted item/revision/intent/receipt invisible')
  await session(second)
  const stale = pending(add(second, '-95008', 'start', '2', 202))
  await blocked(observer, second, first)
  await session(independent)
  await independent.query("set local lock_timeout='500ms'")
  const separate = await add(independent, '-95007', 'end', '0', 201, parent(4))
  assert.equal(separate.personal_revision, '1')
  await independent.query('commit')
  await first.query('commit')
  errorIs((await stale).error, '40001', 'collection_structure_conflict')
  await second.query('rollback')
  assert.deepEqual(await counts(observer), { revision: '3', adds: 1, receipts: 1 })
  await session(second)
  const refreshed = await add(second, '-95008', 'start', '3', 202)
  await second.query('commit')
  assert.deepEqual(await order(observer), [refreshed.collection_item_id, ...[1, 2, 3, 4, 5].map(item), firstAdd.collection_item_id])

  // Two accepted simultaneous additions: next revision and fresh full R1 suffix.
  await session(first)
  const tail = await add(first, '-95009', 'end', '4', 203)
  await session(second)
  const fresh = pending(add(second, '-95010', 'start', '5', 204))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.equal((await fresh).error, null)
  await second.query('commit')
  const suffix = (await observer.query<{ fallback_item_ids: string[] }>('select fallback_item_ids from private.collection_order_intents where collection_id=$1 and operation_id=$2', [parent(), operation(204)])).rows[0]!.fallback_item_ids
  assert.deepEqual(suffix, [...[1, 2, 3, 4, 5].map(item), firstAdd.collection_item_id, tail.collection_item_id], 'Waiter R1 includes newly committed tail')

  // Same UUID accepted only once; UUID collision wins over expected revision.
  await session(first)
  const same = await add(first, '-95006', 'end', '6', 205)
  await session(second)
  const retry = pending(add(second, '-95006', 'end', '6', 205))
  await blocked(observer, second, first)
  await first.query('commit')
  const afterOnce = await state(observer)
  assert.deepEqual((await retry).result, same)
  await second.query('commit')
  assert.deepEqual(await state(observer), afterOnce, 'Concurrent retry preserves same UUID and all timestamps')
  await session(first)
  await add(first, '9007199254740997', 'end', '7', 206)
  await session(second)
  const collision = pending(add(second, '-95007', 'start', '7', 206))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await collision).error, '23505', 'operation_id_conflict')
  await second.query('rollback')

  // Same exact variant, distinct UUIDs: no duplicate or extra initial intent.
  await session(first)
  await add(first, '-95016', 'end', '8', 207)
  await session(second)
  const duplicate = pending(add(second, '-95016', 'end', '9', 208))
  await blocked(observer, second, first)
  await first.query('commit')
  const afterVariant = await state(observer)
  errorIs((await duplicate).error, '23505', 'already_present')
  await second.query('rollback')
  assert.deepEqual(await state(observer), afterVariant)
  assert.deepEqual(await counts(observer), { revision: '9', adds: 7, receipts: 7 })

  // Reorder -> add. Reorder holds no catalogue lock; add captures fresh head.
  await session(first)
  await move(first, 5, 'start', '9', 209)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory'", [pids.get(first)])).rows[0]!.n, 0)
  await session(second)
  const afterMove = pending(add(second, '-95017', 'start', '10', 210))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.equal((await afterMove).error, null)
  await second.query('commit')
  assert.equal((await observer.query<{ anchor: string }>('select anchor_item_id anchor from private.collection_order_intents where collection_id=$1 and operation_id=$2', [parent(), operation(210)])).rows[0]!.anchor, item(5))
  // Add -> reorder, on the same parent and shared revision allocator.
  await session(first)
  await add(first, '-95018', 'end', '11', 211)
  await session(second)
  const reordered = pending(move(second, 1, 'end', '12', 212))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.equal((await reordered).error, null)
  await second.query('commit')
  assert.equal((await order(observer)).at(-1), item(1))

  // Exclusive catalogue wait happens before ANY parent lock. Another session
  // locks the same parent while add waits, proving absence of lock inversion.
  const beforeCatalogue = await state(observer)
  await first.query('begin')
  await first.query('select pg_catalog.pg_advisory_xact_lock(771402)')
  await first.query('update public.catalog_variants set is_active=false where id=-95019')
  await session(second)
  const catalogueWaiter = pending(add(second, '-95019', 'end', '13', 213))
  await blocked(observer, second, first)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory' and not granted", [pids.get(second)])).rows[0]!.n, 1)
  await independent.query('begin')
  await independent.query("set local lock_timeout='500ms'")
  await independent.query('select id from public.collections where id=$1 for update', [parent()])
  await independent.query('commit')
  await first.query('commit')
  errorIs((await catalogueWaiter).error, 'P0002', 'manual_variant_unavailable')
  await second.query('rollback')
  assert.deepEqual(await state(observer), beforeCatalogue, 'Eligibility reread after catalogue wait; zero partial mutation')

  // Reorder can commit during exclusive catalogue lock, then stale add rereads.
  await first.query('begin')
  await first.query('select pg_catalog.pg_advisory_xact_lock(771402)')
  await first.query('update public.catalog_variants set is_active=true where id=-95019')
  await session(second)
  const catalogStale = pending(add(second, '-95019', 'end', '13', 213))
  await blocked(observer, second, first)
  await session(independent)
  await independent.query("set local lock_timeout='500ms'")
  await move(independent, 2, 'end', '13', 214)
  await independent.query('commit')
  await first.query('commit')
  errorIs((await catalogStale).error, '40001', 'collection_structure_conflict')
  await second.query('rollback')
  await session(second)
  await add(second, '-95019', 'end', '14', 213)
  await second.query('commit')

  const stable = await state(observer)
  // Snapshot restrictions and real lock timeouts (parent and catalogue).
  for (const isolation of ['repeatable read', 'serializable'] as const) {
    await session(first, isolation)
    await assert.rejects(add(first, '-95020', 'end', '15', 215), { code: '40001', message: 'collection_structure_conflict' })
    await first.query('rollback')
  }
  for (const lock of ['parent', 'catalogue']) {
    await first.query('begin')
    if (lock === 'parent') await first.query('select id from public.collections where id=$1 for update', [parent()])
    else await first.query('select pg_catalog.pg_advisory_xact_lock(771402)')
    await session(second)
    await second.query("set local lock_timeout='100ms'")
    await assert.rejects(add(second, '-95020', 'end', '15', 215), { code: '40001', message: 'collection_structure_conflict' })
    await second.query('rollback')
    await first.query('rollback')
  }
  assert.deepEqual(await state(observer), stable)
  await session(first)
  await add(first, '-95020', 'end', '15', 215)
  assert.deepEqual(await state(observer), stable)
  await first.query('rollback')
  assert.deepEqual(await state(observer), stable, 'Explicit rollback leaves UUID unaccepted')
  await session(second)
  const rolledBackRetry = await add(second, '-95020', 'end', '15', 215)
  assert.equal(rolledBackRetry.personal_revision, '16')
  await second.query('commit')

  // Real COMMIT failure, including transient item/revision rollback.
  const emptyBefore = await state(observer, parent(5))
  await first.query('begin')
  await first.query(`insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,introduced_revision)
    values($1,$2,-95007,'manual',1,1)`, [item(99), parent(5)])
  await first.query('update public.collections set personal_revision=1 where id=$1', [parent(5)])
  await assert.rejects(first.query('commit'), { code: '23514', message: 'collection_initial_placement_invalid' })
  await first.query('rollback')
  assert.deepEqual(await state(observer, parent(5)), emptyBefore, 'Invalid initial placement rejected at actual COMMIT and rolled back')
  const beforeDelete = await state(observer)
  await first.query('begin')
  await first.query('delete from private.collection_order_intents where collection_id=$1 and sequence=1', [parent()])
  await assert.rejects(first.query('commit'), { code: '23514', message: 'collection_initial_placement_invalid' })
  await first.query('rollback')
  assert.deepEqual(await state(observer), beforeDelete, 'Deleting living initial intent cannot commit')
  await first.query('begin')
  await first.query("update public.collection_items set origin='automatic',automatic_rank=4 where id=$1", [item(2)])
  await first.query('commit')
  assert.equal((await observer.query<{ introduced_revision: string }>('select introduced_revision::text from public.collection_items where id=$1', [item(2)])).rows[0]!.introduced_revision, '1')

  const missing = (await observer.query<{ n: number }>(`select count(*)::int n from private.collection_order_intents e
    left join private.collection_operation_receipts r using(collection_id,operation_id)
    where e.collection_id=$1 and e.sequence>2 and (r.operation_id is null or r.accepted_revision<>e.sequence)`, [parent()])).rows[0]!.n
  assert.equal(missing, 0, 'Every concurrent add/move has its matching atomic receipt')
  assert.equal((await observer.query<{ n: number }>(`select count(*)::int n from public.collection_items i where collection_id=$1
    and introduced_revision is not null and (select count(*) from private.collection_order_intents e where e.collection_id=i.collection_id
      and e.subject_item_id=i.id and e.kind='manual_add' and e.sequence=i.introduced_revision)<>1`, [parent()])).rows[0]!.n, 0)
  assert.deepEqual(await counts(observer), { revision: '16', adds: 11, receipts: 14 })
  console.log('PASS: four real connections; concurrent adds, identical UUID, UUID collision, exact variant duplicate, both reorder/add directions, stale/fresh revisions and fresh R1, independent collection, atomic visibility/rollback, snapshots and real timeouts.')
  console.log('PASS: observed catalogue wait precedes parent; parent/reorder independent of exclusive catalogue lock; eligibility/revision reread after wait; no lost intent/duplicate; actual deferred COMMIT failures roll back; conversion retains introduction.')
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
      const remaining = (await observer.query<{ n: string }>(`select
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
      assert.equal(remaining, '0', 'No committed fixture remains')
      console.log('PASS: synthetic fixtures removed atomically; zero remaining fixture rows.')
    }
  } finally { await Promise.allSettled(clients.map(client => client.end())) }
}
