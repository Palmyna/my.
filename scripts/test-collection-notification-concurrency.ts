import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'
import { cleanup, install, parent, target, users, type Client } from './collection-update-fixtures.ts'

type Event = { notification_key: string; target_version: string; is_read: boolean }
const clients: Client[] = []
let installed = false

async function events(db: Client): Promise<Event[]> {
  return (await db.query<Event>(`select notification_key,target_version::text,is_read
    from private.read_collection_update_notifications($1) where collection_id=$2`, [users[0], parent()])).rows
}

async function observeWait(observer: Client, readerPid: number, holderPid: number) {
  const deadline = Date.now() + 5000
  do {
    const result = await observer.query<{ blocked: boolean }>(
      'select $2::int=any(pg_blocking_pids($1::int)) blocked', [readerPid, holderPid])
    if (result.rows[0]!.blocked) return
    await delay(25)
  } while (Date.now() < deadline)
  assert.fail('Snapshot barrier wait was not observed')
}

try {
  for (let i = 0; i < 3; i++) {
    const db = await connect()
    clients.push(db)
    await db.query("set statement_timeout='10s'")
  }
  const [holder, reader, observer] = clients as [Client, Client, Client]
  await install(holder)
  installed = true
  await holder.query('begin')
  await holder.query('select pg_advisory_xact_lock(771402)')
  await target(holder, ['-95005', '-95002', '-95001', '9007199254740997'], '8')
  await holder.query('commit')
  const initial = await events(reader)
  assert.equal(initial.length, 1)
  assert.equal(initial[0]!.target_version, '8')

  await holder.query('begin')
  await holder.query('select pg_advisory_xact_lock(771402)')
  // Test-only barrier forces a commit between outer snapshot and nested reads.
  // No production projection function acquires this lock.
  await holder.query('select pg_advisory_xact_lock(771499)')
  await target(holder, ['9007199254740997', '-95001', '-95002', '-95005'], '9')
  await reader.query("set statement_timeout='500ms'")
  assert.deepEqual(await events(reader), initial, 'Uncommitted sync is invisible; projection does not wait on catalogue')
  await reader.query("set statement_timeout='10s'")
  const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  const readerPid = (await reader.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!.pid
  const waiting = reader.query<Event>(`with gate as materialized (
      select $1::uuid owner_id, pg_advisory_xact_lock(771499) barrier
    ) select e.notification_key,e.target_version::text,e.is_read
      from gate cross join lateral private.read_collection_update_notifications(gate.owner_id) e
      where e.collection_id=$2`, [users[0], parent()])
    .then(result => ({ result, error: null }), (error: unknown) => ({ result: null, error }))
  await observeWait(observer, readerPid, holderPid)
  await holder.query('commit')
  const snapshot = await waiting
  assert.equal(snapshot.error, null)
  assert.deepEqual(snapshot.result!.rows, initial, 'Nested STABLE reads retain pre-commit version/hash/canonical snapshot')
  assert.equal((await events(reader))[0]!.target_version, '9', 'Next statement observes committed sync')
  console.log('PASS: real sync overlap, observed test barrier, one statement snapshot, no production catalogue lock')

  await holder.query('begin')
  await holder.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
  await holder.query(`select public.apply_collection_update($1,
    public.preview_collection_update($1)->'token',$2)`, [parent(), 'e3500000-0000-0000-0000-000000000009'])
  await reader.query("set statement_timeout='500ms'")
  assert.equal((await events(reader))[0]!.target_version, '9', 'Uncommitted apply remains active without waiting on parent')
  await holder.query('commit')
  assert.deepEqual(await events(reader), [], 'Committed applied version excludes event atomically')
  assert.equal((await observer.query<{ count: number }>(
    'select count(*)::int count from private.collection_notification_reads where collection_id=$1', [parent()])).rows[0]!.count, 0)
  console.log('PASS: real 8F apply overlap, no parent lock, atomic exclusion, no implicit read state')
} finally {
  for (const db of clients) await db.query('rollback').catch(() => undefined)
  try {
    if (installed) await cleanup(clients[0]!)
  } finally {
    await Promise.all(clients.map(db => db.end()))
  }
}
