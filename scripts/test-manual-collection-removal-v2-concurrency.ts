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
    await observer.query(readFileSync(new URL(`../supabase/tests/database/${file}`, import.meta.url), 'utf8'))
  }
  await observer.query('commit')
  installed = true

  // Distinct operation UUIDs on same subject: stale after wait, then absent at
  // refreshed revision. No second receipt, removal or lost unrelated intention.
  const before = await state(observer)
  await session(first)
  const removed = await remove(first, item(2), '2', 401)
  assert.deepEqual(await state(observer), before, 'Cascade/revision/receipt invisible before commit')
  await session(second)
  const stale = pending(remove(second, item(2), '2', 402))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await stale).error, '40001', 'collection_structure_conflict')
  await second.query('rollback')
  const once = await state(observer)
  await session(second)
  await assert.rejects(remove(second, item(2), '3', 402), { code: 'P0002', message: 'collection_item_unavailable' })
  await second.query('rollback')
  assert.deepEqual(await state(observer), once)

  // Same operation submitted simultaneously: retry survives subject deletion.
  await session(first)
  const same = await remove(first, item(4), '3', 403)
  await session(second)
  const duplicate = pending(remove(second, item(4), '3', 403))
  await blocked(observer, second, first)
  await first.query('commit')
  const afterSame = await state(observer)
  assert.deepEqual((await duplicate).result, same)
  await second.query('commit')
  assert.deepEqual(await state(observer), afterSame, 'Same UUID changes nothing twice')
  assert.deepEqual(removed, { operation_id: operation(401), outcome: 'changed', personal_revision: '3', collection_item_id: item(2) })

  await session(first)
  const x = await add(first, '-95007', '4', 404)
  await first.query('commit')
  // Move -> remove, stale revision refused after actual parent wait.
  await session(first)
  await move(first, x.collection_item_id, 'start', '5', 405)
  await session(second)
  const afterMove = pending(remove(second, x.collection_item_id, '5', 406))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await afterMove).error, '40001', 'collection_structure_conflict')
  await second.query('rollback')
  // Remove -> move, fresh revision but subject absent: no resurrection.
  await session(first)
  await remove(first, x.collection_item_id, '6', 406)
  await session(second)
  const afterRemove = pending(move(second, x.collection_item_id, 'end', '7', 407))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await afterRemove).error, 'P0002', 'collection_item_unavailable')
  await second.query('rollback')
  assert.equal((await observer.query<{ n: string }>('select count(*) n from private.collection_order_intents where subject_item_id=$1', [x.collection_item_id])).rows[0]!.n, '0')

  await session(first)
  const newX = await add(first, '-95007', '7', 408)
  await first.query('commit')
  assert.notEqual(newX.collection_item_id, x.collection_item_id)
  await session(first)
  await remove(first, newX.collection_item_id, '8', 409)
  await session(second)
  const staleAdd = pending(add(second, '-95008', '8', 410))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await staleAdd).error, '40001', 'collection_structure_conflict')
  await second.query('rollback')
  await session(second)
  const y = await add(second, '-95008', '9', 410)
  await second.query('commit')
  // Add -> remove with next expected revision is accepted after reread.
  await session(first)
  const z = await add(first, '-95009', '10', 411)
  await session(second)
  const freshRemove = pending(remove(second, y.collection_item_id, '11', 412))
  await blocked(observer, second, first)
  await first.query('commit')
  assert.equal((await freshRemove).result?.personal_revision, '12')
  await second.query('commit')
  assert.equal((await observer.query<{ n: string }>('select count(*) n from private.collection_order_intents where subject_item_id=$1', [z.collection_item_id])).rows[0]!.n, '1', 'Concurrent add initial intention not lost')

  // Independent parent and rollback while retry is waiting on same UUID.
  const stable = await state(observer)
  await session(first)
  await remove(first, z.collection_item_id, '12', 413)
  await session(second)
  const rolledBack = pending(remove(second, z.collection_item_id, '12', 413))
  await blocked(observer, second, first)
  await session(independent)
  await independent.query("set local lock_timeout='500ms'")
  const separate = await remove(independent, item(6), '1', 413, parent(2))
  assert.equal(separate.personal_revision, '2')
  await independent.query('commit')
  assert.deepEqual(await state(observer), stable)
  await first.query('rollback')
  assert.equal((await rolledBack).result?.personal_revision, '13')
  await second.query('commit')
  const committed = await state(observer)
  // Model unknown response after COMMIT: same request on a different session.
  await session(first)
  assert.equal((await remove(first, z.collection_item_id, '12', 413)).personal_revision, '13')
  await first.query('commit')
  assert.deepEqual(await state(observer), committed)
  await session(first)
  await assert.rejects(add(first, '-95010', '12', 413), { code: '23505', message: 'operation_id_conflict' })
  await first.query('rollback')

  // Removal is independent from the exclusive catalogue lock and holds no
  // advisory lock, including its deferred invariant validation at COMMIT.
  await session(second)
  const w = await add(second, '-95010', '13', 414)
  await second.query('commit')
  await first.query('begin')
  await first.query('select pg_catalog.pg_advisory_xact_lock(771402)')
  await session(second)
  await second.query("set local lock_timeout='500ms'")
  await remove(second, w.collection_item_id, '14', 415)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory'", [pids.get(second)])).rows[0]!.n, 0)
  await second.query('commit')
  await first.query('rollback')

  await session(first)
  const living = await add(first, '-95007', '15', 416)
  await first.query('commit')
  const livingState = await state(observer)
  for (const isolation of ['repeatable read', 'serializable'] as const) {
    await session(first, isolation)
    await assert.rejects(remove(first, living.collection_item_id, '16', 417), { code: '40001', message: 'collection_structure_conflict' })
    await first.query('rollback')
  }
  await first.query('begin')
  await first.query('select id from public.collections where id=$1 for update', [parent()])
  await session(second)
  await second.query("set local lock_timeout='100ms'")
  await assert.rejects(remove(second, living.collection_item_id, '16', 417), { code: '40001', message: 'collection_structure_conflict' })
  await second.query('rollback')
  await first.query('rollback')
  assert.deepEqual(await state(observer), livingState)

  // Real COMMIT rejects deleting initial intent of a living subject. Conversion
  // can commit, but cannot bypass removal eligibility or initial protection.
  await first.query('begin')
  await first.query('delete from private.collection_order_intents where subject_item_id=$1 and kind=$2', [living.collection_item_id, 'manual_add'])
  await assert.rejects(first.query('commit'), { code: '23514', message: 'collection_initial_placement_invalid' })
  await first.query('rollback')
  assert.deepEqual(await state(observer), livingState)
  await first.query('begin')
  await first.query("update public.collection_items set origin='automatic',automatic_rank=4 where id=$1", [living.collection_item_id])
  await first.query('commit')
  await session(second)
  await assert.rejects(remove(second, living.collection_item_id, '16', 417), { code: '23514', message: 'automatic_item_removal_forbidden' })
  await second.query('rollback')
  await first.query('begin')
  await first.query('delete from private.collection_order_intents where subject_item_id=$1', [living.collection_item_id])
  await assert.rejects(first.query('commit'), { code: '23514', message: 'collection_initial_placement_invalid' })
  await first.query('rollback')

  // Commit-time failure after complete removal/receipt must roll back everything.
  await session(first)
  const q = await add(first, '-95008', '16', 418)
  await first.query('commit')
  const beforeCommitFailure = await state(observer)
  await first.query('begin')
  await first.query(`create function pg_temp.fail_remove_commit() returns trigger language plpgsql as $$
    begin if new.operation_id='${operation(419)}'::uuid then raise exception 'test_commit_failure'; end if; return null; end; $$`)
  await first.query(`create constraint trigger test_remove_commit after insert on private.collection_operation_receipts
    deferrable initially deferred for each row execute function pg_temp.fail_remove_commit()`)
  await first.query('set local role authenticated')
  await first.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
  await remove(first, q.collection_item_id, '17', 419)
  await assert.rejects(first.query('commit'), { code: 'P0001', message: 'test_commit_failure' })
  await first.query('rollback')
  assert.deepEqual(await state(observer), beforeCommitFailure, 'Actual failed COMMIT restores subject, initial/moves, revision and receipts')
  await session(second)
  await remove(second, q.collection_item_id, '17', 419)
  await second.query('commit')

  // Ownership and parent existence are reread after wait, before historical retry.
  await first.query('begin')
  await first.query('update public.collections set owner_id=$1 where id=$2', [users[2], parent()])
  await session(second)
  const formerOwner = pending(remove(second, item(2), '2', 401))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await formerOwner).error, '42501', 'collection_action_unavailable')
  await second.query('rollback')
  await observer.query('update public.collections set owner_id=$1 where id=$2', [users[0], parent()])
  await first.query('begin')
  await first.query('delete from public.collections where id=$1', [parent()])
  await session(second)
  const deletedParent = pending(remove(second, item(2), '2', 401))
  await blocked(observer, second, first)
  await first.query('commit')
  errorIs((await deletedParent).error, '42501', 'collection_action_unavailable')
  await second.query('rollback')
  assert.equal((await observer.query<{ n: string }>('select count(*) n from private.collection_operation_receipts where collection_id=$1', [parent()])).rows[0]!.n, '0')
  console.log('PASS: four real PostgreSQL connections; same subject distinct UUIDs, simultaneous identical UUID, both remove/reorder and remove/add directions, fresh/stale revision after observed parent waits, independent parents, no catalogue lock, actual timeout and snapshot refusal.')
  console.log('PASS: atomic visibility, rollback with waiting retry, uncertain committed response retry, cross-writer UUID collision, no lost initial intent, real valid removals/invalid initial deletion/conversion/parent cascade at COMMIT, injected COMMIT failure and successful retry, authorization/existence reread after wait.')
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
