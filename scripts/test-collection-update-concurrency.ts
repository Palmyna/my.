import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'
import { cleanup,install,item,operation,parent,state,target,users,type Client } from './collection-update-fixtures.ts'

type Plan = { token: { personal_revision: string; target_version: string; plan_hash: string }; final_order: {
  collection_item_id: string | null; variant_id: string; is_hidden: boolean }[] }
const clients: Client[]=[],pids=new Map<Client,number>()
let installed=false
async function session(db: Client,isolation='read committed') {
  await db.query(`begin isolation level ${isolation}`)
  await db.query('set local role authenticated')
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({ sub:users[0],aal:'aal2' })])
}
async function preview(db: Client,id=parent()) {
  return (await db.query<{ result:Plan }>('select public.preview_collection_update($1) result',[id])).rows[0]!.result
}
const pending = <T>(work: Promise<T>) => work.then(result=>({ result,error:null })).catch((error:unknown)=>({ result:null,error }))
async function blocked(observer: Client,waiter: Client,holder: Client) {
  const deadline=Date.now()+5000
  do {
    if ((await observer.query<{ blocked:boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked',[pids.get(waiter),pids.get(holder)])).rows[0]!.blocked) return
    await delay(25)
  } while (Date.now()<deadline)
  assert.fail('Actual lock wait not observed')
}
async function coherent(observer: Client,waiter: Client,plan: Plan) {
  const before=await state(observer)
  assert.deepEqual(await preview(waiter),plan,'Fresh reread exactly matches state read after wait')
  await waiter.query('commit')
  assert.deepEqual(await state(observer),before,'Preview adds no business write, UUID or receipt')
}
try {
  for(let i=0;i<4;i++) { const db=await connect();clients.push(db);await db.query("set statement_timeout='10s'");pids.set(db,(await db.query<{ pid:number }>('select pg_backend_pid() pid')).rows[0]!.pid) }
  const [observer,holder,waiter,independent]=clients as [Client,Client,Client,Client]
  await install(observer);installed=true
  await observer.query('begin');await observer.query('select pg_advisory_xact_lock(771402)')
  await target(observer,['-95005','-95002','-95001','9007199254740997'],'8');await observer.query('commit')
  await holder.query('begin');await holder.query('select pg_advisory_xact_lock(771402)')
  await target(holder,['9007199254740997','-95001','-95002','-95005'],'9')
  await session(waiter);const afterSync=pending(preview(waiter));await blocked(observer,waiter,holder)
  // Waiting on catalogue must not own the parent. A parent-only writer succeeds.
  await session(independent);await independent.query("set local lock_timeout='500ms'")
  await independent.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3)",[parent(),item(4),operation(900)])
  await independent.query('commit');await holder.query('commit')
  const syncPlan=(await afterSync).result!;assert.ok(syncPlan);assert.equal(syncPlan.token.target_version,'9');assert.equal(syncPlan.token.personal_revision,'3')
  await coherent(observer,waiter,syncPlan)

  let revision='3'
  for (const mutation of ['reorder','hide','add','remove'] as const) {
    const before=await state(observer)
    await session(holder)
    const op=operation(901+['reorder','hide','add','remove'].indexOf(mutation))
    if(mutation==='reorder') await holder.query("select public.reorder_collection_item_v2($1,$2,'end',null,$3::bigint,$4)",[parent(),item(2),revision,op])
    if(mutation==='hide') await holder.query('select public.set_collection_item_hidden($1,$2,false,$3::bigint,$4)',[parent(),item(1),revision,op])
    if(mutation==='add') await holder.query("select public.add_manual_collection_item_v2($1,-95021,'start',$2::bigint,$3)",[parent(),revision,op])
    if(mutation==='remove') await holder.query('select public.remove_manual_collection_item_v2($1,$2,$3::bigint,$4)',[parent(),item(4),revision,op])
    await session(waiter);const waiting=pending(preview(waiter));await blocked(observer,waiter,holder)
    assert.deepEqual(await state(observer),before,'Uncommitted writer remains invisible')
    await session(independent);await independent.query("set local lock_timeout='500ms'")
    const other=await preview(independent,parent(7));assert.equal(other.token.personal_revision,'0');await independent.query('commit')
    await holder.query('commit');const plan=(await waiting).result!;assert.ok(plan)
    revision=(BigInt(revision)+1n).toString();assert.equal(plan.token.personal_revision,revision)
    if(mutation==='hide') assert.equal(plan.final_order.find(i=>i.collection_item_id===item(1))!.is_hidden,false)
    if(mutation==='add') assert.ok(plan.final_order.some(i=>i.variant_id==='-95021'))
    if(mutation==='remove') assert.ok(!plan.final_order.some(i=>i.collection_item_id===item(4)))
    await coherent(observer,waiter,plan)
    console.log(`PASS: preview after real ${mutation} lock wait sees committed revision ${revision}; independent parent and read purity`)
  }

  // Three-way overlap: parent-only writer -> preview(shared catalogue + parent
  // wait) -> exclusive sync. The writer never requests catalogue after parent.
  await session(holder)
  await holder.query("select public.reorder_collection_item_v2($1,$2,'start',null,$3::bigint,$4)",[parent(),item(1),revision,operation(905)])
  await session(waiter);const waiting=pending(preview(waiter));await blocked(observer,waiter,holder)
  await independent.query('begin');const sync=pending(independent.query('select pg_advisory_xact_lock(771402)'))
  await blocked(observer,independent,waiter);await holder.query('commit')
  const plan=(await waiting).result!;assert.ok(plan);revision=plan.token.personal_revision
  await waiter.query('commit');assert.equal((await sync).error,null);await independent.query('rollback')
  // Preview -> add also completes: shared catalogue compatible, parent serializes.
  await session(holder);const stable=await preview(holder)
  await session(waiter);const add=pending(waiter.query("select public.add_manual_collection_item_v2($1,-95004,'end',$2::bigint,$3)",[parent(),revision,operation(906)]))
  // Variant -95004 is currently inactive: this still has to wait on the parent,
  // then refuse without side effects. Canonical remains unchanged.
  await blocked(observer,waiter,holder);await holder.query('commit')
  assert.ok((await add).error instanceof Error);await waiter.query('rollback')
  await session(waiter);await coherent(observer,waiter,stable)
  for (const isolation of ['repeatable read','serializable']) {
    await session(holder,isolation);await assert.rejects(preview(holder),{ code:'40001',message:'collection_structure_conflict' });await holder.query('rollback')
  }
  await holder.query('begin');await holder.query('select id from public.collections where id=$1 for update',[parent()])
  await session(waiter);await waiter.query("set local lock_timeout='100ms'")
  await assert.rejects(preview(waiter),{ code:'40001',message:'collection_structure_conflict' });await waiter.query('rollback');await holder.query('rollback')
  // Ownership and disappearance are reread after the observed parent wait.
  await holder.query('begin');await holder.query('update public.collections set owner_id=$1 where id=$2',[users[2],parent()])
  await session(waiter);const revoked=pending(preview(waiter));await blocked(observer,waiter,holder);await holder.query('commit')
  assert.ok((await revoked).error instanceof Error);await waiter.query('rollback')
  await observer.query('update public.collections set owner_id=$1 where id=$2',[users[0],parent()])
  await holder.query('begin');await holder.query('delete from public.collections where id=$1',[parent()])
  await session(waiter);const deleted=pending(preview(waiter));await blocked(observer,waiter,holder);await holder.query('commit')
  assert.ok((await deleted).error instanceof Error);assert.equal(((await deleted).error as { code:string }).code,'42501');await waiter.query('rollback')
  console.log('PASS: concurrent catalogue sync, catalogue-before-parent, committed reread, three-way no deadlock, reverse preview/add, fixed-snapshot refusal, timeout, ownership/deletion during real wait. Four PostgreSQL connections, synthetic fixtures only.')
} finally {
  await Promise.allSettled(clients.map(db=>db.query('rollback')))
  if(installed && clients[0]) await cleanup(clients[0])
  await Promise.allSettled(clients.map(db=>db.end()))
}
