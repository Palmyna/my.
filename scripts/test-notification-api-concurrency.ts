import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'
import { announcement, cleanup, install, parent, target, users, type Client } from './notification-fixtures.ts'
type Result = { outcome: 'recorded' | 'obsolete' }
const clients: Client[] = []
let installed = false
async function call(db: Client, sql: string, args: unknown[] = []) {
  return (await db.query<{ result: Result }>(`select ${sql} result`,args)).rows[0]!.result
}
async function waitBlocked(observer: Client, waitingPid: number, holderPid: number) {
  const until = Date.now()+5000
  do {
    if ((await observer.query<{ blocked: boolean }>('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waitingPid,holderPid])).rows[0]!.blocked) return
    await delay(20)
  } while (Date.now()<until)
  assert.fail('Real PostgreSQL lock wait not observed')
}
async function state(db: Client, n: number) {
  return (await db.query<{ user_id: string; announcement_id: string; read_at: string | null; processed_at: string | null }>(
    'select * from private.notification_announcement_states where user_id=$1 and announcement_id=$2',[users[0],announcement(n)])).rows
}
try {
  for (let i=0;i<3;i++) {
    const db = await connect(); clients.push(db)
    await db.query("set statement_timeout='10s'")
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({ sub: users[0], aal: 'aal2' })])
  }
  const [holder,writer,observer] = clients as [Client,Client,Client]
  await holder.query('select pg_advisory_lock(830011)')
  await install(holder); installed = true
  const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  const writerPid = (await writer.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  await holder.query('begin'); await holder.query('select pg_advisory_xact_lock(771402)')
  await target(holder,['-95005','-95003','-95001'],'8'); await holder.query('commit')
  const readCollection = (db: Client, version: string) => call(db,'public.mark_notification_read($1,$2)',[`collection:${parent()}`,version])

  await holder.query('begin'); await holder.query('select pg_advisory_xact_lock(771402)')
  await target(holder,['-95005','-95003','-95001'],'9')
  const oldRead = readCollection(writer,'8')
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.equal((await oldRead).outcome,'recorded')
  assert.equal((await observer.query<{ v: string }>('select read_target_version::text v from private.collection_notification_reads where collection_id=$1',[parent()])).rows[0]!.v,'8')
  assert.equal((await observer.query<{ s: string }>(`select e->>'state' s from jsonb_array_elements(public.get_notification_center()->'items') e where e->>'kind'='collection_update'`)).rows[0]!.s,'unread')
  console.log('PASS: real sync/read overlap; fresh target 9, observed 8 only, 9 remains unread')

  await holder.query('begin'); await readCollection(holder,'9')
  const newest = (await holder.query('select * from private.collection_notification_reads where collection_id=$1',[parent()])).rows
  const older = readCollection(writer,'8')
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.equal((await older).outcome,'recorded')
  assert.deepEqual((await observer.query('select * from private.collection_notification_reads where collection_id=$1',[parent()])).rows,newest)
  console.log('PASS: concurrent newer/older collection reads preserve version and timestamp')

  await holder.query('begin')
  await holder.query('select public.apply_collection_update($1,public.preview_collection_update($1)->\'token\',$2)',[parent(),'e3800000-0000-0000-0000-000000000001'])
  const appliedRead = readCollection(writer,'9')
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.equal((await appliedRead).outcome,'obsolete')
  assert.deepEqual((await observer.query('select * from private.collection_notification_reads where collection_id=$1',[parent()])).rows,newest)
  console.log('PASS: real apply/read overlap; no event resurrection or read progression')

  await holder.query('begin'); await call(holder,'public.process_announcement_notification($1,$2)',[announcement(1),'a'.repeat(64)])
  const processed = await state(holder,1)
  const lateRead = call(writer,'public.mark_notification_read($1,$2)',[`announcement:${announcement(1)}`,'a'.repeat(64)])
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.equal((await lateRead).outcome,'obsolete'); assert.deepEqual(await state(observer,1),processed)
  await holder.query('begin'); await call(holder,'public.mark_notification_read($1,$2)',[`announcement:${announcement(2)}`,'a'.repeat(64)])
  const read = await state(holder,2)
  const lateProcess = call(writer,'public.process_announcement_notification($1,$2)',[announcement(2),'a'.repeat(64)])
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.equal((await lateProcess).outcome,'recorded')
  assert.equal((await state(observer,2))[0]!.read_at,read[0]!.read_at)
  assert.ok((await state(observer,2))[0]!.processed_at)
  console.log('PASS: both announcement read/process orders; acquired dates preserved, no resurrection')

  for (const n of [3,4]) {
    await holder.query('begin')
    await holder.query('update private.notification_announcements set withdrawn_at=clock_timestamp() where id=$1',[announcement(n)])
    const pending = n===3 ? call(writer,'public.mark_notification_read($1,$2)',[`announcement:${announcement(n)}`,'a'.repeat(64)])
      : call(writer,'public.process_announcement_notification($1,$2)',[announcement(n),'a'.repeat(64)])
    await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
    assert.equal((await pending).outcome,'obsolete'); assert.deepEqual(await state(observer,n),[])
  }
  console.log('PASS: withdrawal/read and withdrawal/process waits revalidate activity before first state')

  await holder.query('begin'); await holder.query('select pg_advisory_xact_lock(771498)')
  await holder.query(`insert into private.notification_announcements(id,publication_key,category,title,body,requires_action,published_at,content_hash,published_by,publication_context)
    values($1,'8g2.concurrent.8','announcement','Synthetic concurrent publication','Plain text',false,clock_timestamp(),repeat('a',64),'synthetic','{}')`,[announcement(8)])
  await writer.query("set statement_timeout='500ms'")
  assert.equal((await writer.query<{ data: { unread_count: string } }>('select public.get_notification_unread_count() data')).rows[0]!.data.unread_count,'0')
  await writer.query("set statement_timeout='10s'")
  const snapshot = writer.query<{ data: { items: unknown[]; unread_count: string } }>(`with gate as materialized (select pg_advisory_xact_lock(771498))
    select public.get_notification_center() data from gate`)
  await waitBlocked(observer,writerPid,holderPid); await holder.query('commit')
  assert.deepEqual((await snapshot).rows[0]!.data,{ items: [], unread_count: '0', next_cursor: null })
  assert.equal((await writer.query<{ data: { unread_count: string } }>('select public.get_notification_unread_count() data')).rows[0]!.data.unread_count,'1')
  console.log('PASS: real publication overlap; centre/items/count retain one pre-commit snapshot, next read sees publication')

  await holder.query(`insert into private.notification_announcements(id,publication_key,category,title,body,requires_action,published_at,expires_at,content_hash,published_by,publication_context)
    values($1,'8g2.concurrent.9','announcement','Synthetic expiring publication','Plain text',false,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 second',repeat('a',64),'synthetic','{}')`,[announcement(9)])
  await holder.query('begin')
  await holder.query("select pg_advisory_xact_lock(hashtextextended('my.notification.state:'||$1::text||':'||$2::text,0))",[users[0],announcement(9)])
  const expires = call(writer,'public.process_announcement_notification($1,$2)',[announcement(9),'a'.repeat(64)])
  await waitBlocked(observer,writerPid,holderPid); await delay(1200); await holder.query('commit')
  assert.equal((await expires).outcome,'obsolete'); assert.deepEqual(await state(observer,9),[])
  console.log('PASS: expiration during state-lock wait rechecked with fresh server clock')

  for (const isolation of ['repeatable read','serializable']) {
    await writer.query(`begin isolation level ${isolation}`)
    await assert.rejects(call(writer,'public.process_announcement_notification($1,$2)',[announcement(8),'a'.repeat(64)]),{ code: '25000', message: 'notification_isolation_invalid' })
    await writer.query('rollback')
    await writer.query(`begin isolation level ${isolation}`)
    await assert.rejects(readCollection(writer,'9'),{ code: '25000', message: 'notification_isolation_invalid' })
    await writer.query('rollback')
  }
  console.log('PASS: both writers refuse fixed snapshots; READ COMMITTED required')
} finally {
  for (const db of clients) await db.query('rollback').catch(() => undefined)
  try { if (installed) await cleanup(clients[0]!) }
  finally { await Promise.all(clients.map(db => db.end())) }
}
