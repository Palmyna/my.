import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Local-only guardrails come from connect(). These tests need committed fixtures so
// independent sessions can see them; finally removes only this test's explicit IDs.
const fixture = readFileSync(new URL('../supabase/tests/database/automatic_collection.fixtures.inc', import.meta.url), 'utf8')
const users = [1, 2, 3].map(n => `a1100000-0000-0000-0000-${String(n).padStart(12, '0')}`)
const clients: Awaited<ReturnType<typeof connect>>[] = []
let installed = false
let checks = 0
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message)
  checks++
}
type Result = { collection_id: string; created: boolean }
type Client = Awaited<ReturnType<typeof connect>>
async function session(client: Client, owner: string) {
  await client.query('begin isolation level read committed')
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner, aal: 'aal2' })])
}
function create(client: Client, name: string, type = 'pokemon') {
  // Attach rejection handling immediately while another connection observes locks.
  return client.query<Result>('select * from public.create_automatic_collection($1,$2,-82001)', [name, type])
    .then(result => ({ result: result.rows[0]!, error: null }))
    .catch((error: unknown) => ({ result: null, error: error instanceof Error ? error : new Error('RPC failed', { cause: error }) }))
}
async function waitFor(observer: Client, sql: string, params: unknown[], message: string) {
  const deadline = Date.now() + 8000
  do {
    if ((await observer.query<{ ready: boolean }>(sql, params)).rows[0]?.ready) { checks++; return }
    await delay(25)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${message}`)
}
async function pid(client: Client) {
  return (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid
}

try {
  for (let i = 0; i < 4; i++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout = '12s'")
  }
  const [observer, first, second, writer] = clients as [Client, Client, Client, Client]
  const pids = await Promise.all([pid(first), pid(second), pid(writer)])
  await observer.query('begin')
  await observer.query('select pg_advisory_xact_lock(771402)')
  await observer.query(fixture)
  await observer.query('commit')
  installed = true

  // Simulate a catalogue sync with an intermediate invalid hash. Both RPC calls
  // must wait before reading it and then see the final state/version after commit.
  await writer.query('begin')
  await writer.query('select pg_advisory_xact_lock(771402)')
  await writer.query("update public.automatic_target_states set content_hash='sync-in-progress' where id=-82001")
  await session(first, users[0]!)
  await session(second, users[0]!)
  const pending = [create(first, 'Concurrent A'), create(second, 'Concurrent B')]
  await waitFor(observer, `select count(*) = 2 as ready from pg_locks
    where pid = any($1::int[]) and locktype='advisory' and mode='ShareLock'
      and classid=0 and objid=771402 and objsubid=1 and not granted`,
  [pids.slice(0, 2)], 'Both simultaneous calls wait on the catalogue writer')
  check((await observer.query<{ n: number }>('select count(*)::int as n from public.collections where owner_id=any($1::uuid[])', [users])).rows[0]!.n,
    0, 'No parent while catalogue sync is in progress')
  await writer.query(`update public.automatic_target_states set generation_version=8,
    content_hash=encode(extensions.digest('["-82101","-9007199254740995"]','sha256'),'hex') where id=-82001`)
  await writer.query('commit')

  const winner = await Promise.race(pending.map(async (operation, index) => ({ index, ...await operation })))
  if (winner.error) throw winner.error
  assert.ok(winner.result)
  check(winner.result.created, true, 'First completed call creates the collection')
  const loserIndex = 1 - winner.index
  await waitFor(observer, `select $2::int = any(pg_blocking_pids($1)) and exists (
    select 1 from pg_locks where pid=$1 and locktype='transactionid' and not granted) as ready`,
  [pids[loserIndex], pids[winner.index]], 'Second call really waits on the unique-index winner')
  check((await observer.query<{ n: number }>(`select count(*)::int as n from pg_locks
    where pid=any($1::int[]) and locktype='advisory' and mode='ShareLock' and objid=771402 and granted`,
  [pids.slice(0, 2)])).rows[0]!.n, 2, 'Both creators hold the shared catalogue lock simultaneously')

  // A different owner can finish before the first owner's winning transaction commits.
  await session(writer, users[1]!)
  const other = await create(writer, 'Independent owner')
  if (other.error) throw other.error
  assert.ok(other.result)
  check(other.result.created, true, 'Different owner creates without waiting for first owner')
  check(other.result.collection_id !== winner.result.collection_id, true, 'Different owners have distinct UUIDs')
  await writer.query('commit')
  await clients[winner.index + 1]!.query('commit')
  const loser = await pending[loserIndex]!
  if (loser.error) throw loser.error
  assert.ok(loser.result)
  check(loser.result, { collection_id: winner.result.collection_id, created: false }, 'Loser retrieves exact winning UUID')
  await clients[loserIndex + 1]!.query('commit')
  const stored = (await observer.query<{ id: string; name: string; applied_target_version: string }>(`select id,name,applied_target_version from public.collections
    where owner_id=$1 and target_pokemon_id=-82001`, [users[0]])).rows
  check(stored, [{ id: winner.result.collection_id, name: winner.index === 0 ? 'Concurrent A' : 'Concurrent B', applied_target_version: '8' }],
    'Exactly one parent, unchanged winning name and final committed sync version')
  const items = (await observer.query<{ variant_id: string; origin: string; automatic_rank: string; sort_position: string }>(`select variant_id,origin,automatic_rank,sort_position::text from public.collection_items
    where collection_id=$1 order by automatic_rank`, [winner.result.collection_id])).rows
  check(items, [
    { variant_id: '-82101', origin: 'automatic', automatic_rank: '1', sort_position: '1.00000000000000000000' },
    { variant_id: '-9007199254740995', origin: 'automatic', automatic_rank: '2', sort_position: '2.00000000000000000000' },
  ], 'Exactly one canonical item structure; no duplicate or replacement')

  // The opposite direction: sync waits until the caller commits, even after RPC return.
  await session(first, users[2]!)
  const held = await create(first, 'Hold shared catalogue lock', 'set')
  if (held.error) throw held.error
  check(held.result?.created, true, 'A set creation holds its shared lock after function return')
  await writer.query('begin')
  const exclusive = writer.query('select pg_advisory_xact_lock(771402)').then(() => null)
    .catch((error: unknown) => error instanceof Error ? error : new Error('Catalogue lock failed', { cause: error }))
  await waitFor(observer, `select $2::int = any(pg_blocking_pids($1)) and exists (
    select 1 from pg_locks where pid=$1 and locktype='advisory' and mode='ExclusiveLock'
      and objid=771402 and not granted) as ready`, [pids[2], pids[0]], 'Sync waits for active creation transaction')
  await first.query('commit')
  const exclusiveError = await exclusive
  if (exclusiveError) throw exclusiveError
  checks++
  await writer.query('commit')
  console.log(`PASS: ${checks} concurrency/locking checks; same UUID, one created=true, one created=false; independent owner and catalogue locks verified.`)
} finally {
  // Release any pending operations first (bounded by statement_timeout).
  await Promise.allSettled(clients.map(client => client.query('rollback')))
  try {
    if (installed) {
      const observer = clients[0]!
      await observer.query('begin')
      await observer.query('select pg_advisory_xact_lock(771402)')
      await observer.query('delete from auth.users where id=any($1::uuid[])', [users])
      await observer.query('delete from public.automatic_target_states where id in (-82001,-82002,-82003,-82004,-82005)')
      await observer.query('delete from public.card_pokemon where card_id in (-82001,-82002)')
      await observer.query('delete from public.catalog_variants where id in (-82101,-82103,-9007199254740995)')
      await observer.query('delete from public.source_cards where id in (-82001,-82002)')
      await observer.query('delete from public.tcg_sets where id in (-82001,-82002,-82003,-82004)')
      await observer.query('delete from public.tcg_series where id=-82001')
      await observer.query('delete from public.pokemon where id in (-82001,-82002,-82003)')
      await observer.query('commit')
      const remaining = (await observer.query<{ n: string }>(`select
        (select count(*) from auth.users where id=any($1::uuid[])) +
        (select count(*) from public.profiles where id=any($1::uuid[])) +
        (select count(*) from public.collections where owner_id=any($1::uuid[])) +
        (select count(*) from public.collection_items where variant_id in (-82101,-82103,-9007199254740995)) +
        (select count(*) from public.catalog_variants where id in (-82101,-82103,-9007199254740995)) +
        (select count(*) from public.automatic_target_states where id in (-82001,-82002,-82003,-82004,-82005)) as n`, [users])).rows[0]!.n
      assert.equal(remaining, '0', 'No committed fixture remains')
      console.log('PASS: all committed concurrency fixtures removed.')
    }
  } finally {
    await Promise.allSettled(clients.map(client => client.end()))
  }
}
