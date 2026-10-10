import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'
import { cleanup, install, item, operation, parent, state, users, type Client, type Result } from './collection-hidden-fixtures.ts'

const clients: Client[] = [], pids = new Map<Client, number>()
let installed = false
async function session(db: Client, isolation = 'read committed') {
  await db.query(`begin isolation level ${isolation}`)
  await db.query('set local role authenticated')
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
}
async function hide(db: Client, n: number, hidden: boolean, revision: string, op: number, collection = parent()) {
  return (await db.query<{ result: Result }>('select public.set_collection_item_hidden($1,$2,$3,$4::bigint,$5) result',
    [collection, item(n), hidden, revision, operation(op)])).rows[0]!.result
}
async function move(db: Client, n: number, revision: string, op: number) {
  return (await db.query<{ result: Result }>("select public.reorder_collection_item_v2($1,$2,'start',null,$3::bigint,$4) result",
    [parent(), item(n), revision, operation(op)])).rows[0]!.result
}
async function add(db: Client, revision: string, op: number) {
  return (await db.query<{ result: Result }>("select public.add_manual_collection_item_v2($1,-95008,'end',$2::bigint,$3) result",
    [parent(), revision, operation(op)])).rows[0]!.result
}
async function remove(db: Client, revision: string, op: number) {
  return (await db.query<{ result: Result }>('select public.remove_manual_collection_item_v2($1,$2,$3::bigint,$4) result',
    [parent(), item(4), revision, operation(op)])).rows[0]!.result
}
function pending<T>(promise: Promise<T>) { return promise.then(result => ({ result, error: null })).catch((error: unknown) => ({ result: null, error })) }
function errorIs(error: unknown, code: string, message: string) {
  assert.ok(error instanceof Error); assert.equal((error as { code?: string }).code, code); assert.equal(error.message, message)
}
async function blocked(observer: Client, waiter: Client, holder: Client) {
  const deadline = Date.now() + 5000
  do {
    if ((await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked',
      [pids.get(waiter), pids.get(holder)])).rows[0]!.blocked) return
    await delay(25)
  } while (Date.now() < deadline)
  assert.fail('Actual parent lock wait not observed')
}
try {
  for (let n = 0; n < 4; n++) {
    const db = await connect(); clients.push(db); await db.query("set statement_timeout='10s'")
    pids.set(db, (await db.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid)
  }
  const [observer, first, second, independent] = clients as [Client, Client, Client, Client]
  await install(observer); installed = true
  const initial = await state(observer)
  await session(first)
  const accepted = await hide(first, 1, true, '2', 700)
  assert.deepEqual(await state(observer), initial, 'Uncommitted hidden state and receipt invisible')
  await session(second)
  const duplicate = pending(hide(second, 1, true, '2', 700))
  await blocked(observer, second, first)
  // Independent automatic collection succeeds while the first parent is locked.
  await session(independent); await independent.query("set local lock_timeout='500ms'")
  assert.equal((await hide(independent, 7, true, '0', 700, parent(7))).personal_revision, '1')
  await independent.query('commit')
  await first.query('commit'); assert.deepEqual((await duplicate).result, accepted); await second.query('commit')
  assert.equal(accepted.personal_revision, '3')
  // A hide produces no move; R1 context for a subsequent actual move includes it.
  const journal = (await observer.query('select to_jsonb(e) data from private.collection_order_intents e where collection_id=$1 order by sequence', [parent()])).rows
  assert.equal(journal.length, 2)

  // Both directions hide/reorder, fresh revision after a real parent wait.
  await session(first); await move(first, 5, '3', 701)
  await session(second); const afterMove = pending(hide(second, 3, true, '4', 702))
  await blocked(observer, second, first); await first.query('commit')
  assert.equal((await afterMove).result?.personal_revision, '5'); await second.query('commit')
  const moveIntent = (await observer.query<{ anchor_item_id: string; fallback_item_ids: string[] }>('select anchor_item_id,fallback_item_ids from private.collection_order_intents where operation_id=$1', [operation(701)])).rows[0]
  assert.deepEqual(moveIntent, { anchor_item_id: item(1), fallback_item_ids: [item(2), item(3), item(4)] })
  await session(first); await hide(first, 3, false, '5', 703)
  await session(second); const staleMove = pending(move(second, 3, '5', 704))
  await blocked(observer, second, first); await first.query('commit')
  errorIs((await staleMove).error, '40001', 'collection_structure_conflict'); await second.query('rollback')
  assert.deepEqual((await observer.query('select anchor_item_id,fallback_item_ids from private.collection_order_intents where operation_id=$1', [operation(701)])).rows[0], moveIntent, 'R1 suffix immutable after hides')

  // hide -> add stale rejected, then explicit fresh add -> hide accepted.
  await session(first); await hide(first, 1, false, '6', 705)
  await session(second); const staleAdd = pending(add(second, '6', 706))
  await blocked(observer, second, first); await first.query('commit')
  errorIs((await staleAdd).error, '40001', 'collection_structure_conflict'); await second.query('rollback')
  await session(first); const added = await add(first, '7', 706)
  await session(second); const afterAdd = pending(hide(second, 3, true, '8', 707))
  await blocked(observer, second, first); await first.query('commit')
  assert.equal((await afterAdd).result?.personal_revision, '9'); await second.query('commit')
  assert.equal((await observer.query<{ n: number }>('select count(*)::int n from private.collection_order_intents where subject_item_id=$1', [added.collection_item_id])).rows[0]!.n, 1)

  // hide -> remove fresh accepted; remove -> hide stale rejected.
  await session(first); await hide(first, 3, false, '9', 708)
  await session(second); const afterHide = pending(remove(second, '10', 709))
  await blocked(observer, second, first); await first.query('commit')
  assert.equal((await afterHide).result?.personal_revision, '11')
  // Hold the real removal transaction while a hide waits behind it.
  await session(first); const staleHide = pending(hide(first, 1, true, '10', 710))
  await blocked(observer, first, second); await second.query('commit')
  errorIs((await staleHide).error, '40001', 'collection_structure_conflict'); await first.query('rollback')
  assert.deepEqual((await observer.query('select anchor_item_id,fallback_item_ids from private.collection_order_intents where operation_id=$1', [operation(701)])).rows[0], moveIntent, 'Removed manual UUID remains in R1 suffix')

  // Rollback while identical operation waits: exactly one eventual mutation.
  const beforeRollback = await state(observer)
  await session(first); await hide(first, 1, true, '11', 710)
  await session(second); const retry = pending(hide(second, 1, true, '11', 710))
  await blocked(observer, second, first); assert.deepEqual(await state(observer), beforeRollback)
  await first.query('rollback'); assert.equal((await retry).result?.personal_revision, '12'); await second.query('commit')
  const once = await state(observer)
  await session(first); assert.equal((await hide(first, 1, true, '11', 710)).personal_revision, '12'); await first.query('commit')
  assert.deepEqual(await state(observer), once)
  await session(first); await assert.rejects(hide(first, 1, false, '11', 710), { code: '23505', message: 'operation_id_conflict' }); await first.query('rollback')

  // Concurrent no-op holds parent; subsequent hide's expected revision stays 12.
  await session(first); assert.equal((await hide(first, 1, true, '12', 711)).outcome, 'noop')
  await session(second); const afterNoop = pending(hide(second, 1, false, '12', 712))
  await blocked(observer, second, first); await first.query('commit')
  assert.equal((await afterNoop).result?.personal_revision, '13'); await second.query('commit')

  // No catalogue lock, including existing deferred invariant at commit.
  await first.query('begin'); await first.query('select pg_advisory_xact_lock(771402)')
  await session(second); await second.query("set local lock_timeout='500ms'")
  await hide(second, 1, true, '13', 713)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory'", [pids.get(second)])).rows[0]!.n, 0)
  await second.query('commit'); await first.query('rollback')
  for (const isolation of ['repeatable read', 'serializable']) {
    await session(first, isolation); await assert.rejects(hide(first, 1, false, '14', 714), { code: '40001', message: 'collection_structure_conflict' }); await first.query('rollback')
  }
  await first.query('begin'); await first.query('select id from public.collections where id=$1 for update', [parent()])
  await session(second); await second.query("set local lock_timeout='100ms'")
  await assert.rejects(hide(second, 1, false, '14', 714), { code: '40001', message: 'collection_structure_conflict' }); await second.query('rollback'); await first.query('rollback')

  // Receipt lookup waits for committed hide and never causes another write.
  await session(first); const show = await hide(first, 1, false, '14', 714)
  await session(second); const receipt = pending(second.query<{ result: Result }>('select public.get_collection_operation_result($1,$2) result', [parent(), operation(714)]))
  await blocked(observer, second, first); await first.query('commit')
  assert.deepEqual((await receipt).result?.rows[0]!.result, show); await second.query('commit')

  // Current ownership and parent existence checked again after actual wait.
  await first.query('begin'); await first.query('update public.collections set owner_id=$1 where id=$2', [users[2], parent()])
  await session(second); const revoked = pending(hide(second, 1, true, '15', 715))
  await blocked(observer, second, first); await first.query('commit')
  errorIs((await revoked).error, '42501', 'collection_action_unavailable'); await second.query('rollback')
  await observer.query('update public.collections set owner_id=$1 where id=$2', [users[0], parent()])
  await first.query('begin'); await first.query('delete from public.collections where id=$1', [parent()])
  await session(second); const deleted = pending(hide(second, 1, true, '15', 715))
  await blocked(observer, second, first); await first.query('commit')
  errorIs((await deleted).error, '42501', 'collection_action_unavailable'); await second.query('rollback')
  console.log('PASS: four real PostgreSQL connections; observed parent waits, simultaneous identical UUID, distinct parents, hide/reorder/add/remove both directions, fresh/stale revision, atomic visibility, waiting retry after rollback, noop, HTTP-independent SQL conflicts, no catalogue lock, fixed-snapshot refusal and timeout.')
  console.log('PASS: historical receipt after commit, no duplicate writes, R1 suffix including hidden items and removed UUID intact, add initial intention preserved, ownership/deletion reread after lock wait.')
} finally {
  await Promise.allSettled(clients.map(db => db.query('rollback')))
  try { if (installed) { await cleanup(clients[0]!); console.log('PASS: synthetic fixtures removed, zero residue.') } }
  finally { await Promise.allSettled(clients.map(db => db.end())) }
}
