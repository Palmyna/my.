import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Requires the Phase 6A.3 migration in the local database.
// connect() enforces localhost:55322/postgres. No migration application here.
const users = [1, 2, 3].map(n => `a1500000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const collection = 'c1500000-0000-0000-0000-000000000001'
const otherCollection = 'c1500000-0000-0000-0000-000000000002'
const item = (n: number) => `d1500000-0000-0000-0000-${String(n).padStart(12, '0')}`
type Client = Awaited<ReturnType<typeof connect>>
const clients: Client[] = []
let installed = false

async function session(client: Client, isolation = 'read committed') {
  // Called below with fixed values only, never external input.
  await client.query(`begin isolation level ${isolation}`)
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users[0], aal: 'aal2' })])
}
function move(client: Client, collectionId: string, itemId: string, placement: string, anchor: string | null = null) {
  return client.query('select public.reorder_collection_item($1,$2,$3,$4)', [collectionId, itemId, placement, anchor])
}
async function order(client: Client) {
  return (await client.query<{ id: string }>('select id from public.collection_items where collection_id=$1 order by sort_position,id', [collection])).rows.map(row => row.id)
}

try {
  for (let i = 0; i < 4; i++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout = '10s'")
  }
  const [observer, first, second, independent] = clients as [Client, Client, Client, Client]
  const exists = await observer.query<{ present: boolean }>("select to_regprocedure('public.reorder_collection_item(uuid,uuid,text,uuid)') is not null as present")
  assert.equal(exists.rows[0]?.present, true, 'Apply pending local migrations before this test')
  const fixture = readFileSync(new URL('../supabase/tests/database/collection_reorder.fixtures.inc', import.meta.url), 'utf8')
  await observer.query('begin')
  await observer.query(fixture)
  await observer.query('commit')
  installed = true
  const firstPid = (await first.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid
  const secondPid = (await second.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid

  await session(first)
  await move(first, collection, item(3), 'before', item(2))
  assert.deepEqual(await order(observer), [item(1), item(2), item(3)], 'Uncommitted reorder not visible')
  await session(second)
  // Attach rejection handler immediately while the observer proves the real wait.
  const pending = move(second, collection, item(1), 'after', item(3))
    .then(() => ({ error: null })).catch((error: unknown) => ({ error }))
  let blocked = false
  const deadline = Date.now() + 5000
  do {
    blocked = (await observer.query<{ blocked: boolean }>('select $2::int = any(pg_blocking_pids($1::int)) as blocked', [secondPid, firstPid])).rows[0]!.blocked
    if (!blocked) await delay(25)
  } while (!blocked && Date.now() < deadline)
  assert.equal(blocked, true, 'Second reorder waits for same collection transaction')

  await session(independent)
  await independent.query("set local lock_timeout = '500ms'")
  await move(independent, otherCollection, item(4), 'end')
  await independent.query('commit')
  await first.query('commit')
  const completed = await pending
  if (completed.error) throw completed.error instanceof Error ? completed.error : new Error('Concurrent reorder failed', { cause: completed.error })
  assert.deepEqual(await order(observer), [item(1), item(3), item(2)], 'Second operation remains atomic before commit')
  await second.query('commit')
  assert.deepEqual(await order(observer), [item(3), item(1), item(2)], 'Second reorder used fresh neighbours after waiting')
  const counts = (await observer.query<{ total: number; unique_positions: number }>(
    'select count(*)::int as total,count(distinct sort_position)::int as unique_positions from public.collection_items where collection_id=$1', [collection])).rows[0]
  assert.deepEqual(counts, { total: 3, unique_positions: 3 }, 'No missing items or duplicate positions')

  await session(first)
  await move(first, collection, item(2), 'start')
  await first.query('rollback')
  assert.deepEqual(await order(observer), [item(3), item(1), item(2)], 'Rollback restores complete order')
  await session(first, 'repeatable read')
  await assert.rejects(move(first, collection, item(2), 'start'), { code: '40001' }, 'Fixed snapshot fails cleanly instead of using stale neighbours')
  await first.query('rollback')
  console.log('PASS: serialization, fresh neighbours, independent collection, atomicity, rollback and fixed-snapshot rejection.')
} finally {
  await Promise.allSettled(clients.map(client => client.query('rollback')))
  try {
    if (installed) {
      const observer = clients[0]!
      await observer.query('begin')
      await observer.query('delete from public.collections where id=any($1::uuid[])', [[collection, otherCollection]])
      await observer.query('delete from auth.users where id=any($1::uuid[])', [users])
      await observer.query('delete from public.automatic_target_states where id=-85001')
      await observer.query('delete from public.catalog_variants where id in (-85001,-85002,-85003)')
      await observer.query('delete from public.source_cards where id=-85001')
      await observer.query('delete from public.tcg_sets where id=-85001')
      await observer.query('delete from public.tcg_series where id=-85001')
      await observer.query('commit')
      const remaining = (await observer.query<{ n: string }>(`select
        (select count(*) from auth.users where id=any($1::uuid[])) +
        (select count(*) from public.profiles where id=any($1::uuid[])) +
        (select count(*) from public.collections where id=any($2::uuid[])) +
        (select count(*) from public.collection_items where collection_id=any($2::uuid[])) +
        (select count(*) from public.catalog_variants where id in (-85001,-85002,-85003)) +
        (select count(*) from public.automatic_target_states where id=-85001) as n`, [users, [collection, otherCollection]])).rows[0]!.n
      assert.equal(remaining, '0', 'No committed fixture remains')
    }
  } finally { await Promise.allSettled(clients.map(client => client.end())) }
}
