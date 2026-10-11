import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'
import { cleanup, install, item, operation, parent, state, target, users, type Client, type Plan, type Result } from './collection-update-apply-fixtures.ts'

// Same four-connection/pg_blocking_pids protocol as the existing 8E proof.
const clients: Client[] = [], pids = new Map<Client, number>()
let installed = false
async function session(db: Client, isolation = 'read committed', user = users[0]!, aal = 'aal2') {
  await db.query(`begin isolation level ${isolation}`)
  await db.query('set local role authenticated')
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, aal })])
}
async function preview(db: Client) {
  await session(db)
  const plan = (await db.query<{ result: Plan }>('select public.preview_collection_update($1) result', [parent()])).rows[0]!.result
  await db.query('commit')
  return plan
}
const apply = async (db: Client, plan: Plan, n: number): Promise<Result> =>
  (await db.query<{ result: Result }>('select public.apply_collection_update($1,$2::jsonb,$3) result', [parent(), plan.token, operation(n)])).rows[0]!.result
const pending = <T>(work: Promise<T>) => work.then(result => ({ result, error: null })).catch((error: unknown) => ({ result: null, error }))
async function blocked(observer: Client, waiter: Client, holder: Client) {
  const deadline = Date.now() + 5000
  do {
    if ((await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked', [pids.get(waiter), pids.get(holder)])).rows[0]!.blocked) return
    await delay(25)
  } while (Date.now() < deadline)
  assert.fail('Actual PostgreSQL lock wait not observed')
}
function errorIs(error: unknown, code: string, message: string) {
  assert.ok(error instanceof Error)
  assert.equal((error as Error & { code: string }).code, code)
  assert.equal(error.message, message)
}
async function comparePlan(db: Client, plan: Plan, result: Result) {
  const materialized = (await db.query<{ entry: Plan['final_order'][number]; position: string }>(`select jsonb_build_object(
    'collection_item_id',id,'variant_id',variant_id::text,'origin',origin,'automatic_rank',automatic_rank::text,'is_hidden',is_hidden) entry,
    sort_position::text position from public.collection_items where collection_id=$1 order by sort_position,id`, [parent()])).rows
  const allocated = new Map(result.created_items.map(i => [i.variant_id, i.collection_item_id]))
  assert.deepEqual(materialized.map(i => i.entry), plan.final_order.map(i => ({ ...i, collection_item_id: i.collection_item_id ?? allocated.get(i.variant_id) })),
    'Only placeholder substitution: actual 8E plan equals committed application')
  assert.deepEqual(materialized.map(i => i.position), plan.final_order.map((_, n) => `${n + 1}.00000000000000000000`))
}
try {
  for (let i = 0; i < 4; i++) {
    const db = await connect(); clients.push(db)
    await db.query("set statement_timeout='10s'")
    pids.set(db, (await db.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid)
  }
  const [observer, holder, waiter, independent] = clients as [Client, Client, Client, Client]
  await observer.query('select pg_advisory_lock(830011)')
  await install(observer); installed = true
  let plan = await preview(holder)

  // Sync owns exclusive catalogue; apply must wait BEFORE acquiring parent.
  await holder.query('begin'); await holder.query('select pg_advisory_xact_lock(771402)')
  await target(holder, ['9007199254740997', '-95005', '-95002', '-95001'], '9')
  await session(waiter); const syncWait = pending(apply(waiter, plan, 500))
  await blocked(observer, waiter, holder)
  await session(independent); await independent.query("set local lock_timeout='500ms'")
  await independent.query('select public.set_collection_item_hidden($1,$2,false,2,$3)', [parent(), item(1), operation(501)])
  await independent.query('commit')
  const afterHide = await state(observer)
  await holder.query('commit')
  errorIs((await syncWait).error, '40001', 'preview_stale'); await waiter.query('rollback')
  assert.deepEqual(await state(observer), afterHide, 'Catalogue wait rereads committed version/revision and never silently applies new target')
  console.log('PASS: apply waits for real catalogue changes before parent; parent-only mutation progresses; stale token refused after wait')

  plan = await preview(holder)
  assert.equal(plan.token.target_version, '9'); assert.equal(plan.token.personal_revision, '3')
  // Parent writer -> apply (shared catalogue, parent wait) -> sync exclusive.
  await session(holder)
  await holder.query("select public.reorder_collection_item_v2($1,$2,'start',null,3,$3)", [parent(), item(4), operation(502)])
  await session(waiter); const structuralWait = pending(apply(waiter, plan, 503))
  await blocked(observer, waiter, holder)
  await independent.query('begin'); const exclusive = pending(independent.query('select pg_advisory_xact_lock(771402)'))
  await blocked(observer, independent, waiter)
  await holder.query('commit')
  errorIs((await structuralWait).error, '40001', 'preview_stale'); await waiter.query('rollback')
  assert.equal((await exclusive).error, null); await independent.query('rollback')
  console.log('PASS: three real overlapping transactions, structural writer/apply/sync; revision reread after wait; no deadlock')

  plan = await preview(holder)
  assert.equal(plan.token.personal_revision, '4')
  const before = await state(observer)
  // Positive RPC return does not disable deferred constraints at true COMMIT.
  await session(holder); await apply(holder, plan, 504)
  await holder.query('reset role')
  await holder.query("delete from private.collection_order_intents where collection_id=$1 and subject_item_id=$2 and kind='manual_add'", [parent(), item(2)])
  await assert.rejects(holder.query('commit'), { code: '23514', message: 'collection_initial_placement_invalid' })
  await holder.query('rollback')
  assert.deepEqual(await state(observer), before, 'Failed true COMMIT restores all items/introductions/version/revision/receipt')
  console.log('PASS: injected invalid converted introduction rejected at actual COMMIT, complete transaction restored')

  // Same UUID overlaps while first application has not committed.
  await session(holder); const first = await apply(holder, plan, 600)
  assert.equal(first.personal_revision, '5'); assert.equal(first.created_items.length, 1)
  await session(waiter); const duplicate = pending(apply(waiter, plan, 600))
  await blocked(observer, waiter, holder)
  assert.deepEqual(await state(observer), before, 'Uncommitted partial application invisible')
  await independent.query('begin'); const syncBehindApply = pending(independent.query('select pg_advisory_xact_lock(771402)'))
  await blocked(observer, independent, holder)
  await holder.query('commit') // Real COMMIT validates conversion and surviving manual introductions.
  assert.deepEqual((await duplicate).result, first, 'Concurrent duplicate returns original UUID mapping')
  await waiter.query('commit')
  assert.equal((await syncBehindApply).error, null); await independent.query('rollback')
  await comparePlan(observer, plan, first)
  assert.equal((await observer.query<{ n: number }>("select count(*)::int n from private.collection_operation_receipts where collection_id=$1 and kind='apply'", [parent()])).rows[0]!.n, 1)
  const after = await state(observer)
  console.log('PASS: two applications/same UUID serialize; one receipt/revision/allocation; real successful COMMIT and exact plan permutation')

  // Simulated lost response after real commit: retrieve, then retry exact request.
  await session(holder)
  const recovered = (await holder.query<{ result: Result }>('select public.get_collection_operation_result($1,$2) result', [parent(), operation(600)])).rows[0]!.result
  assert.deepEqual(recovered, first); assert.deepEqual(await apply(holder, plan, 600), first)
  await holder.query('commit'); assert.deepEqual(await state(observer), after)
  await session(holder)
  await assert.rejects(apply(holder, { ...plan, token: { ...plan.token, personal_revision: '5' } }, 600), { code: '23505', message: 'operation_id_conflict' })
  await holder.query('rollback')

  // Reverse direction: application owns parent; a structural mutation waits and
  // must refuse its now-obsolete expected revision after application commits.
  await observer.query('begin'); await observer.query('select pg_advisory_xact_lock(771402)')
  await target(observer, ['-95005', '-95002', '-95001', '9007199254740997'], '10'); await observer.query('commit')
  const next = await preview(holder)
  await session(holder); const second = await apply(holder, next, 601)
  await session(waiter); const hideWait = pending(waiter.query('select public.set_collection_item_hidden($1,$2,true,5,$3)', [parent(), item(1), operation(602)]))
  await blocked(observer, waiter, holder); await holder.query('commit')
  errorIs((await hideWait).error, '40001', 'collection_structure_conflict'); await waiter.query('rollback')
  await comparePlan(observer, next, second)
  assert.equal(second.personal_revision, '6')
  console.log('PASS: apply/structural mutation reverse wait; stale writer revision rejected after actual application commit')

  await session(holder)
  await holder.query('select public.remove_manual_collection_item_v2($1,$2,6,$3)', [parent(), item(4), operation(603)])
  await holder.query('commit')
  await observer.query('begin'); await observer.query('select pg_advisory_xact_lock(771402)')
  await target(observer, [], '11'); await observer.query('commit')
  const changed = await state(observer)
  await session(holder); assert.deepEqual(await apply(holder, plan, 600), first); await holder.query('commit')
  assert.deepEqual(await state(observer), changed, 'Historical retry survives removed item and different canonical target')
  console.log('PASS: post-commit lost-response recovery; historical receipt after later application/removal/catalogue changes; no second allocation')

  for (const isolation of ['repeatable read', 'serializable']) {
    await session(holder, isolation)
    await assert.rejects(apply(holder, plan, 600), { code: '40001', message: 'collection_structure_conflict' })
    await holder.query('rollback')
  }
  await holder.query('begin'); await holder.query('select id from public.collections where id=$1 for update', [parent()])
  await session(waiter); await waiter.query("set local lock_timeout='100ms'")
  await assert.rejects(apply(waiter, plan, 600), { code: '40001', message: 'collection_structure_conflict' })
  await waiter.query('rollback'); await holder.query('rollback')
  for (const [user, aal] of [[users[0]!, 'aal1'], [users[3]!, 'aal2'], [users[1]!, 'aal2'], [users[2]!, 'aal2']]) {
    await session(holder, 'read committed', user, aal)
    await assert.rejects(apply(holder, plan, 600), { code: '42501', message: 'collection_update_unavailable' })
    await holder.query('rollback')
  }
  // Current ownership and parent existence are reread even for accepted retries.
  await holder.query('begin'); await holder.query('update public.collections set owner_id=$1 where id=$2', [users[2], parent()])
  await session(waiter); const revoked = pending(apply(waiter, plan, 600)); await blocked(observer, waiter, holder)
  await holder.query('commit'); errorIs((await revoked).error, '42501', 'collection_update_unavailable'); await waiter.query('rollback')
  await observer.query('update public.collections set owner_id=$1 where id=$2', [users[0], parent()])
  await holder.query('begin'); await holder.query('delete from public.collections where id=$1', [parent()])
  await session(waiter); const deleted = pending(apply(waiter, plan, 600)); await blocked(observer, waiter, holder)
  await holder.query('commit'); errorIs((await deleted).error, '42501', 'collection_update_unavailable'); await waiter.query('rollback')
  console.log('PASS: READ COMMITTED requirement, lock timeout, current retry authorization, ownership/deletion after real wait. Four PostgreSQL connections; synthetic fixtures only.')
} finally {
  await Promise.allSettled(clients.map(db => db.query('rollback')))
  if (installed && clients[0]) await cleanup(clients[0])
  await Promise.allSettled(clients.map(db => db.end()))
}
