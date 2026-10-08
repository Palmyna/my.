import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Local-only connection guard reused from the existing DB test infrastructure.
// Cross-session visibility requires committed fixtures; setup and cleanup each
// use an atomic transaction, with reserved IDs and unconditional finally cleanup.
const collection = 'c2500000-0000-0000-0000-000000000001'
const otherCollection = 'c2500000-0000-0000-0000-000000000002'
const legacyCollection = 'c2500000-0000-0000-0000-000000000003'
const collections = [collection, otherCollection, legacyCollection]
const users = [1, 2, 3, 4].map(n => `a2500000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const item = (n: number) => `d2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
const operation = (n: number) => `e2500000-0000-0000-0000-${String(n).padStart(12, '0')}`
type Client = Awaited<ReturnType<typeof connect>>
type Result = { operation_id: string; outcome: 'changed' | 'noop'; personal_revision: string; collection_item_id: string }
const clients: Client[] = []
let installed = false

async function session(client: Client, isolation: 'read committed' | 'repeatable read' | 'serializable' = 'read committed') {
  await client.query(`begin isolation level ${isolation}`)
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
}
async function move(client: Client, n: number, placement: string, anchor: number | null, revision: string, op: number, parent = collection) {
  const response = await client.query<{ result: Result }>('select public.reorder_collection_item_v2($1,$2,$3,$4,$5::bigint,$6) result',
    [parent, item(n), placement, anchor === null ? null : item(anchor), revision, operation(op)])
  return response.rows[0]!.result
}
async function state(client: Client) {
  return (await client.query<{ state: unknown }>(`select jsonb_build_object(
    'parent',(select to_jsonb(c) from public.collections c where id=$1),
    'items',(select jsonb_agg(to_jsonb(i) order by sort_position,id) from public.collection_items i where collection_id=$1),
    'intents',(select jsonb_agg(to_jsonb(i) order by sequence) from private.collection_order_intents i where collection_id=$1),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.collection_operation_receipts r where collection_id=$1)) state`, [collection])).rows[0]!.state
}
async function order(client: Client) {
  return (await client.query<{ id: string }>('select id from public.collection_items where collection_id=$1 order by sort_position,id', [collection])).rows.map(row => row.id)
}
async function counts(client: Client) {
  return (await client.query<{ revision: string; moves: number; receipts: number }>(`select personal_revision::text revision,
    (select count(*)::int from private.collection_order_intents where collection_id=$1 and kind='move') moves,
    (select count(*)::int from private.collection_operation_receipts where collection_id=$1) receipts
    from public.collections where id=$1`, [collection])).rows[0]!
}
function pendingMove(client: Client, n: number, placement: string, anchor: number | null, revision: string, op: number) {
  // Catch immediately: rejection may arrive as soon as holder commits.
  return move(client, n, placement, anchor, revision, op).then(result => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }))
}
async function blocked(observer: Client, waiter: Client, holder: Client) {
  const waiterPid = (await waiter.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  return async () => {
    const deadline = Date.now() + 5000
    do {
      const waiting = (await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked', [waiterPid, holderPid])).rows[0]!.blocked
      if (waiting) return
      await delay(25)
    } while (Date.now() < deadline)
    assert.fail('Expected real PostgreSQL parent lock wait was not observed')
  }
}

try {
  for (let n = 0; n < 4; n++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout='10s'")
  }
  const [observer, first, second, independent] = clients as [Client, Client, Client, Client]
  assert.equal((await observer.query<{ present: boolean }>("select to_regprocedure('public.reorder_collection_item_v2(uuid,uuid,text,uuid,bigint,uuid)') is not null present")).rows[0]!.present, true)
  const waitForLock = await blocked(observer, second, first)
  await observer.query('begin')
  await observer.query(readFileSync(new URL('../supabase/tests/database/relative_order_writer.fixtures.inc', import.meta.url), 'utf8'))
  // Give the independent parent a genuine movable permutation, with its valid
  // second initial manual intent. pgTAP keeps the shared singleton fixture.
  await observer.query(`insert into public.collection_items(id,collection_id,variant_id,origin,sort_position,introduced_revision)
    values($1,$2,-95001,'manual',2,2)`, [item(7), otherCollection])
  await observer.query(`insert into private.collection_order_intents(collection_id,sequence,operation_id,subject_item_id,kind,destination,fallback_item_ids)
    values($1,2,$2,$3,'manual_add','end','{}')`, [otherCollection, operation(4), item(7)])
  await observer.query('update public.collections set personal_revision=2 where id=$1', [otherCollection])
  await observer.query('commit')
  installed = true

  // Same parent: stale expected revision must be read AFTER a real lock wait.
  const initial = await state(observer)
  await session(first)
  const accepted = await move(first, 5, 'start', null, '2', 201)
  assert.deepEqual(await state(observer), initial, 'Uncommitted order/revision/intents/receipt are all invisible')
  await session(second)
  const stale = pendingMove(second, 3, 'before', 2, '2', 202)
  await waitForLock()
  await session(independent)
  await independent.query("set local lock_timeout='500ms'")
  const independentResult = await move(independent, 6, 'end', null, '2', 201, otherCollection)
  assert.equal(independentResult.outcome, 'changed', 'Different parent genuinely moves while first parent is locked')
  assert.equal(independentResult.personal_revision, '3')
  await independent.query('commit')
  await first.query('commit')
  const staleResult = await stale
  assert.equal(staleResult.error instanceof Error, true)
  assert.equal((staleResult.error as { code?: string }).code, '40001')
  assert.equal((staleResult.error as { message?: string }).message, 'collection_structure_conflict')
  await second.query('rollback')
  assert.deepEqual(await counts(observer), { revision: '3', moves: 1, receipts: 1 }, 'Stale waiter leaves no lost/extra intent or receipt')
  await session(second)
  await move(second, 3, 'before', 2, '3', 202)
  await second.query('commit')
  assert.deepEqual(await order(observer), [5, 1, 3, 2, 4].map(item), 'Refresh after conflict moves from authoritative sequence')

  // A waiter that expects the next revision succeeds and captures fresh R1.
  await session(first)
  await move(first, 1, 'end', null, '4', 203)
  await session(second)
  const fresh = pendingMove(second, 4, 'before', 5, '5', 204)
  await waitForLock()
  await first.query('commit')
  assert.equal((await fresh).error, null)
  await second.query('commit')
  assert.deepEqual(await order(observer), [4, 5, 3, 2, 1].map(item))
  const suffix = (await observer.query<{ fallback_item_ids: string[] }>('select fallback_item_ids from private.collection_order_intents where collection_id=$1 and operation_id=$2', [collection, operation(204)])).rows[0]!.fallback_item_ids
  assert.deepEqual(suffix, [3, 2, 1].map(item), 'R1 includes fresh committed order after lock wait')

  // Simultaneous identical UUID: second receives same old result at new revision.
  await session(first)
  const sameResult = await move(first, 2, 'start', null, '6', 205)
  await session(second)
  const identical = pendingMove(second, 2, 'start', null, '6', 205)
  await waitForLock()
  await first.query('commit')
  const beforeRetry = await state(observer)
  assert.deepEqual((await identical).result, sameResult)
  await second.query('commit')
  assert.deepEqual(await state(observer), beforeRetry, 'Simultaneous retry writes nothing, including timestamps')
  assert.deepEqual(await counts(observer), { revision: '7', moves: 5, receipts: 5 })
  await session(second)
  assert.deepEqual(await move(second, 5, 'start', null, '2', 201), accepted, 'Uncertain response resolved with historical result after later commits')
  await second.query('commit')
  assert.deepEqual(await state(observer), beforeRetry)

  // Simultaneous UUID collision: authorization/receipt processing wins over stale revision.
  await session(first)
  await move(first, 5, 'end', null, '7', 206)
  await session(second)
  const collision = pendingMove(second, 4, 'start', null, '7', 206)
  await waitForLock()
  await first.query('commit')
  const collisionState = await state(observer)
  assert.equal(((await collision).error as { code?: string }).code, '23505')
  assert.equal(((await collision).error as { message?: string }).message, 'operation_id_conflict')
  await second.query('rollback')
  assert.deepEqual(await state(observer), collisionState)

  // Concurrent noop receipt, still serialized but no intent/revision.
  await session(first)
  const noop = await move(first, 5, 'end', null, '8', 207)
  assert.equal(noop.outcome, 'noop')
  await session(second)
  const noopRetry = pendingMove(second, 5, 'end', null, '8', 207)
  await waitForLock()
  await first.query('commit')
  assert.deepEqual((await noopRetry).result, noop)
  await second.query('commit')
  assert.deepEqual(await counts(observer), { revision: '8', moves: 6, receipts: 7 })

  // Transaction rollback: accepted within a session is not a committed success.
  const beforeRollback = await state(observer)
  await session(first)
  await move(first, 5, 'start', null, '8', 208)
  assert.deepEqual(await state(observer), beforeRollback)
  await first.query('rollback')
  assert.deepEqual(await state(observer), beforeRollback)
  await session(second)
  const retriedRollback = await move(second, 5, 'start', null, '8', 208)
  assert.equal(retriedRollback.outcome, 'changed', 'Rolled-back UUID is a new accepted operation on retry')
  await second.query('commit')
  assert.deepEqual(await counts(observer), { revision: '9', moves: 7, receipts: 8 })

  for (const isolation of ['repeatable read', 'serializable'] as const) {
    await session(first, isolation)
    await assert.rejects(move(first, 1, 'start', null, '9', 209), { code: '40001', message: 'collection_structure_conflict' })
    await first.query('rollback')
  }
  // Real lock timeout is sanitized, all attempted changes rolled back.
  const beforeTimeout = await state(observer)
  await session(first)
  await first.query('select id from public.collections where id=$1 for update', [collection])
  await session(second)
  await second.query("set local lock_timeout='100ms'")
  await assert.rejects(move(second, 1, 'start', null, '9', 210), { code: '40001', message: 'collection_structure_conflict' })
  await second.query('rollback')
  await first.query('rollback')
  assert.deepEqual(await state(observer), beforeTimeout)
  const missing = (await observer.query<{ n: number }>(`select count(*)::int n from private.collection_order_intents i
    left join private.collection_operation_receipts r using(collection_id,operation_id)
    where i.collection_id=$1 and i.kind='move' and (r.operation_id is null or r.accepted_revision<>i.sequence)`, [collection])).rows[0]!.n
  assert.equal(missing, 0, 'Every concurrent move has exactly its coherent receipt')
  // Mixed-version window: a legacy waiter must see a mode installed while it
  // waited. Only this reserved synthetic parent changes contract in the test.
  await first.query('begin')
  await first.query('update public.collections set order_contract_version=2 where id=$1', [legacyCollection])
  await session(second)
  const legacyWaiter = second.query('select public.add_manual_collection_item($1,$2,$3)', [legacyCollection, '-95001', 'end'])
    .then(() => null).catch((error: unknown) => error)
  await waitForLock()
  await first.query('commit')
  const legacyError = await legacyWaiter as { code?: string; message?: string }
  assert.equal(legacyError.code, '23514')
  assert.equal(legacyError.message, 'order_contract_upgrade_required')
  await second.query('rollback')
  assert.equal((await observer.query<{ n: number }>('select count(*)::int n from public.collection_items where collection_id=$1', [legacyCollection])).rows[0]!.n, 0)
  console.log('PASS: four real connections; stale/fresh lock wait, fresh R1, independent parent, simultaneous UUID/retry/collision/noop, atomic visibility, rollback, exact revisions, fixed snapshots and timeout.')
  console.log('PASS: legacy writer refuses contract 2 installed during an observed parent lock wait.')
} finally {
  await Promise.allSettled(clients.map(client => client.query('rollback')))
  try {
    if (installed) {
      const observer = clients[0]!
      await observer.query('begin')
      await observer.query('delete from public.collections where id=any($1::uuid[])', [collections])
      await observer.query('delete from auth.users where id=any($1::uuid[])', [users])
      await observer.query('delete from public.automatic_target_states where id=-95001')
      await observer.query('delete from public.catalog_variants where id between -95006 and -95001')
      await observer.query('delete from public.source_cards where id=-95001')
      await observer.query('delete from public.tcg_sets where id=-95001')
      await observer.query('delete from public.tcg_series where id=-95001')
      await observer.query('commit')
      const remaining = (await observer.query<{ n: string }>(`select
        (select count(*) from auth.users where id=any($1::uuid[])) +
        (select count(*) from public.profiles where id=any($1::uuid[])) +
        (select count(*) from public.collections where id=any($2::uuid[])) +
        (select count(*) from public.collection_items where collection_id=any($2::uuid[])) +
        (select count(*) from private.collection_order_intents where collection_id=any($2::uuid[])) +
        (select count(*) from private.collection_operation_receipts where collection_id=any($2::uuid[])) +
        (select count(*) from public.catalog_variants where id between -95006 and -95001) +
        (select count(*) from public.source_cards where id=-95001) +
        (select count(*) from public.tcg_sets where id=-95001) +
        (select count(*) from public.tcg_series where id=-95001) +
        (select count(*) from public.automatic_target_states where id=-95001) n`, [users, collections])).rows[0]!.n
      assert.equal(remaining, '0', 'No committed fixture remains')
      console.log('PASS: all synthetic multi-session fixtures removed atomically.')
    }
  } finally { await Promise.allSettled(clients.map(client => client.end())) }
}
