import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './catalog/database.ts'

// Local-only connector, same as the 6A.3 concurrency test. No migration application.
const owner = 'a1700000-0000-0000-0000-000000000001'
const users = [owner, 'a1700000-0000-0000-0000-000000000002', 'a1700000-0000-0000-0000-000000000003']
const collection = 'c1700000-0000-0000-0000-000000000001'
const other = 'c1700000-0000-0000-0000-000000000002'
const automatic = 'd1700000-0000-0000-0000-000000000001'
const manual = 'd1700000-0000-0000-0000-000000000002'
const clients = []
let installed = false
async function session(client, isolation = 'read committed') {
  assert.ok(['read committed', 'repeatable read', 'serializable'].includes(isolation))
  await client.query(`begin isolation level ${isolation}`)
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: owner, aal: 'aal2' })])
}
const add = (client, variant, parent = collection) => client.query('select public.add_manual_collection_item($1,$2)', [parent, variant])
const remove = (client, item = manual) => client.query('select public.remove_manual_collection_item($1,$2)', [collection, item])
const reorder = (client, item, placement = 'end') => client.query('select public.reorder_collection_item($1,$2,$3)', [collection, item, placement])
const deletion = client => client.query('delete from public.collections where id=$1', [collection])
async function order(client) {
  return (await client.query('select variant_id::text from public.collection_items where collection_id=$1 order by sort_position,id', [collection])).rows.map(r => r.variant_id)
}

try {
  for (let i = 0; i < 4; i++) {
    const client = await connect()
    clients.push(client)
    await client.query("set statement_timeout = '10s'")
  }
  const [observer, first, second, independent] = clients
  assert.equal((await observer.query("select to_regprocedure('public.add_manual_collection_item(uuid,bigint,text)') is not null as ready")).rows[0].ready, true,
    'Install the additive RPC migrations before this test')
  await observer.query('begin')
  await observer.query(readFileSync(new URL('../supabase/tests/database/manual_collection_items.fixtures.inc', import.meta.url), 'utf8'))
  await observer.query('commit')
  installed = true
  const firstPid = (await first.query('select pg_backend_pid() pid')).rows[0].pid
  const secondPid = (await second.query('select pg_backend_pid() pid')).rows[0].pid

  // First transaction optionally commits; the follower always rolls back.
  async function race(label, leading, following, { error, expected, commitFirst = false, independentCheck = false } = {}) {
    await session(first)
    await leading(first)
    await session(second)
    const pending = following(second).then(() => null, caught => caught)
    let blocked
    const deadline = Date.now() + 5000
    do {
      blocked = (await observer.query('select $2::int=any(pg_blocking_pids($1::int)) blocked', [secondPid, firstPid])).rows[0].blocked
      if (!blocked) await delay(25)
    } while (!blocked && Date.now() < deadline)
    assert.equal(blocked, true, `${label}: parent transaction blocks follower`)
    if (independentCheck) {
      await session(independent)
      await independent.query("set local lock_timeout = '500ms'")
      await add(independent, '-87003', other)
      await independent.query('rollback')
    }
    await first.query(commitFirst ? 'commit' : 'rollback')
    const caught = await pending
    if (error) {
      assert.equal(caught?.code, error[0], label)
      assert.equal(caught?.message, error[1], label)
    } else {
      if (caught) throw caught
      if (expected) assert.deepEqual(await order(second), expected, label)
    }
    await second.query('rollback')
    console.log(`PASS: ${label}`)
  }

  await race('different additions serialize; other collection remains writable', c => add(c, '-87003'), c => add(c, '-87004'),
    { commitFirst: true, independentCheck: true, expected: ['-87001', '-87002', '-87003', '-87004'] })
  const addedId = (await observer.query('select id from public.collection_items where collection_id=$1 and variant_id=-87003', [collection])).rows[0].id
  await race('same variant yields stable already_present after concurrent commit', c => add(c, '-87004'), c => add(c, '-87004'),
    { commitFirst: true, error: ['23505', 'already_present'] })
  assert.equal((await observer.query('select count(*)::int n from public.collection_items where collection_id=$1 and variant_id=-87004', [collection])).rows[0].n, 1)
  await race('add then reorder reads newly committed last position', c => add(c, '9007199254740995'), c => reorder(c, automatic),
    { commitFirst: true, expected: ['-87002', '-87003', '-87004', '9007199254740995', '-87001'] })
  // Free one variant for the inverse reorder/add race.
  await session(first)
  await remove(first, addedId)
  await first.query('commit')
  await race('reorder then add computes fresh tail', c => reorder(c, automatic), c => add(c, '-87003'),
    { commitFirst: true, expected: ['-87002', '-87004', '9007199254740995', '-87001', '-87003'] })
  await race('remove then reorder rejects committed missing item', c => remove(c), c => reorder(c, manual),
    { commitFirst: true, error: ['P0002', 'reorder_item_unavailable'] })
  const losslessId = (await observer.query('select id from public.collection_items where collection_id=$1 and variant_id=$2', [collection, '9007199254740995'])).rows[0].id
  await race('reorder then remove serializes', c => reorder(c, losslessId, 'start'), c => remove(c, losslessId),
    { commitFirst: true, expected: ['-87004', '-87001'] })
  await race('add rollback releases collection deletion', c => add(c, '-87002'), deletion)
  await race('remove rollback releases collection deletion', c => remove(c, losslessId), deletion)
  await race('collection deletion rollback releases add', deletion, c => add(c, '-87002'))
  for (const isolation of ['repeatable read', 'serializable']) {
    for (const operation of [c => add(c, '-87002'), c => remove(c, losslessId)]) {
      await session(first, isolation)
      await assert.rejects(operation(first), { code: '40001', message: 'collection_structure_conflict' })
      await first.query('rollback')
    }
  }
  await race('collection deletion commit makes remove unavailable',
    c => c.query('delete from public.collections where id=$1', [other]),
    c => c.query('select public.remove_manual_collection_item($1,$2)', [other, manual]),
    { commitFirst: true, error: ['42501', 'collection_action_unavailable'] })
  await race('collection deletion commit makes add unavailable', deletion, c => add(c, '-87002'),
    { commitFirst: true, error: ['42501', 'collection_action_unavailable'] })
  await session(first)
  await assert.rejects(remove(first, losslessId), { code: '42501', message: 'collection_action_unavailable' })
  await first.query('rollback')
  assert.equal((await observer.query('select count(*)::int n from public.physical_copies where user_id=$1', [owner])).rows[0].n, 2,
    'Physical copies survive removal and parent deletion')
  console.log('PASS: isolation rejection, exact BIGINT and physical-copy preservation')
} finally {
  await Promise.allSettled(clients.map(c => c.query('rollback')))
  try {
    if (installed) {
      const observer = clients[0]
      await observer.query('begin')
      await observer.query('delete from public.collections where id=any($1::uuid[])', [[collection, other]])
      await observer.query('delete from auth.users where id=any($1::uuid[])', [users])
      await observer.query('delete from public.automatic_target_states where id=-87001')
      await observer.query('delete from public.catalog_variants where source_card_id between -87003 and -87001')
      await observer.query('delete from public.source_cards where id between -87003 and -87001')
      await observer.query('delete from public.tcg_sets where id between -87002 and -87001')
      await observer.query('delete from public.tcg_series where id=-87001')
      await observer.query('commit')
      assert.equal((await observer.query(`select
        (select count(*) from auth.users where id=any($1::uuid[])) +
        (select count(*) from public.profiles where id=any($1::uuid[])) +
        (select count(*) from public.physical_copies where user_id=any($1::uuid[])) +
        (select count(*) from public.collections where id=any($2::uuid[])) +
        (select count(*) from public.collection_items where collection_id=any($2::uuid[])) +
        (select count(*) from public.catalog_variants where source_card_id between -87003 and -87001) as n`, [users, [collection, other]])).rows[0].n, '0')
      console.log('PASS: temporary fixtures removed')
    }
  } finally { await Promise.allSettled(clients.map(c => c.end())) }
}
