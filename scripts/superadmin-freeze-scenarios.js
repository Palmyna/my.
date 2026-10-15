import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { localConnection } from './catalog/database.ts'
import { target } from './collection-update-fixtures.ts'

// Called with real Auth/TOTP tokens by test-app-roles.js. All catalogue IDs
// belong to the reserved fixtures; every collection/copy belongs to a test user.
export async function businessWrites({ db, rest, token, userId, announcement, version }) {
  const rpc = async (name, body) => {
    const response = await rest(token, `rpc/${name}`, 'POST', body)
    assert.equal(response.status, 200, name)
    return response.body
  }
  const collection = await rest(token, 'collections', 'POST', { name: 'Synthetic freeze matrix', collection_type: 'free' })
  assert.equal(collection.status, 201)
  const free = collection.body[0].id
  const content = id => rpc('get_collection_content_v2', { p_collection_id: id })
  const add = (variant, revision) => rpc('add_manual_collection_item_v2', { p_collection_id: free,
    p_variant_id: variant, p_placement: 'end', p_expected_revision: revision, p_operation_id: randomUUID() })
  const first = await add('-95001', '0'), second = await add('-95005', '1')
  assert.equal(first.outcome, 'changed')
  assert.equal(second.personal_revision, '2')
  const moveRequest = { p_collection_id: free, p_item_id: second.collection_item_id,
    p_placement: 'start', p_anchor_id: null, p_expected_revision: '2', p_operation_id: randomUUID() }
  const moved = await rpc('reorder_collection_item_v2', moveRequest)
  assert.equal(moved.outcome, 'changed')
  assert.equal(moved.personal_revision, '3')
  assert.deepEqual((await content(free)).items.map(i => i.variant_id), ['-95005', '-95001'])
  assert.deepEqual(await rpc('reorder_collection_item_v2', moveRequest), moved, 'Exact receipt replay')
  assert.equal((await content(free)).personal_revision, '3')

  const copy = await rest(token, 'physical_copies', 'POST', { variant_id: '-95001', name: 'Synthetic copy', note: 'before' })
  assert.equal(copy.status, 201)
  const copyId = copy.body[0].id
  const copyPath = `physical_copies?id=eq.${copyId}`
  assert.equal((await content(free)).items.find(i => i.variant_id === '-95001').owned, true)
  assert.equal((await rest(token, copyPath, 'PATCH', { name: 'Renamed copy', note: 'after' })).status, 200)
  assert.deepEqual((await db.query('select name,note from public.physical_copies where id=$1 and user_id=$2',
    [copyId, userId])).rows, [{ name: 'Renamed copy', note: 'after' }])
  assert.equal((await rest(token, copyPath, 'DELETE')).status, 200)
  assert.equal((await content(free)).items.find(i => i.variant_id === '-95001').owned, false)
  const removed = await rpc('remove_manual_collection_item_v2', { p_collection_id: free,
    p_collection_item_id: second.collection_item_id, p_expected_revision: '3', p_operation_id: randomUUID() })
  assert.equal(removed.personal_revision, '4')
  assert.deepEqual((await content(free)).items.map(i => i.variant_id), ['-95001'])

  const [created] = await rpc('create_automatic_collection', { p_name: 'Synthetic automatic freeze', p_target_type: 'set', p_target_id: '-95001' })
  assert.equal(created.created, true)
  const automatic = created.collection_id
  const initial = await content(automatic)
  const hiddenItem = initial.items.find(i => i.variant_id === '-95001')
  const hidden = await rpc('set_collection_item_hidden', { p_collection_id: automatic,
    p_collection_item_id: hiddenItem.collection_item_id, p_is_hidden: true,
    p_expected_revision: initial.personal_revision, p_operation_id: randomUUID() })
  assert.equal(hidden.outcome, 'changed')
  assert.equal((await content(automatic)).items.find(i => i.variant_id === '-95001').is_hidden, true)
  const variants = version % 2 ? ['-95005', '-95001', '-95004'] : ['-95005', '-95001', '-95002']
  await target(db, variants, String(version)) // operator changes synthetic catalogue only
  const preview = await rpc('preview_collection_update', { p_collection_id: automatic })
  assert.equal(preview.token.target_version, String(version))
  assert.deepEqual(await rpc('mark_notification_read', { p_notification_key: `collection:${automatic}`,
    p_observed_revision: String(version) }), { outcome: 'recorded' })
  assert.equal((await db.query('select read_target_version::text v from private.collection_notification_reads where collection_id=$1',
    [automatic])).rows[0].v, String(version))
  const request = { p_collection_id: automatic, p_preview_token: preview.token, p_operation_id: randomUUID() }
  const applied = await rpc('apply_collection_update', request)
  assert.equal(applied.outcome, 'applied')
  assert.equal(applied.applied_target_version, String(version))
  const final = await content(automatic)
  assert.deepEqual(final.items.map(i => i.variant_id).sort(), [...variants].sort())
  assert.equal(final.items.find(i => i.variant_id === '-95001').is_hidden, true)
  assert.deepEqual(await rpc('apply_collection_update', request), applied)
  assert.deepEqual(await content(automatic), final, 'Replay changes neither content nor revision')
  assert.deepEqual(await rpc('get_collection_operation_result', { p_collection_id: automatic,
    p_operation_id: request.p_operation_id }), applied)

  assert.deepEqual(await rpc('mark_notification_read', { p_notification_key: `announcement:${announcement.announcement_id}`,
    p_observed_revision: announcement.content_hash }), { outcome: 'recorded' })
  assert.deepEqual(await rpc('process_announcement_notification', { p_announcement_id: announcement.announcement_id,
    p_observed_hash: announcement.content_hash }), { outcome: 'recorded' })
  assert.deepEqual((await db.query(`select read_at is not null as read,processed_at is not null as processed
    from private.notification_announcement_states where user_id=$1 and announcement_id=$2`,
  [userId, announcement.announcement_id])).rows, [{ read: true, processed: true }])
  for (const id of [free, automatic]) assert.equal((await rest(token, `collections?id=eq.${id}`, 'DELETE')).status, 200)
  assert.equal((await db.query('select count(*)::int n from public.collections where id=any($1::uuid[])', [[free, automatic]])).rows[0].n, 0)
}

// Real SQL sessions isolate lock behavior from network/Auth timing. Claims here
// are SQL fixtures, never evidence of JWT verification (the caller tests HTTP).
export async function freezeConcurrency(db, adminId, ordinaryId, token) {
  const clients = []
  const open = async (user = 'authenticator') => {
    const url = new URL(localConnection()); url.username = user
    const client = new pg.Client({ connectionString: url.href, statement_timeout: 10_000 })
    await client.connect(); clients.push(client)
    client.pid = (await client.query('select pg_backend_pid() pid')).rows[0].pid
    return client
  }
  const begin = async (client, id, isolation = 'read committed') => {
    await client.query(`begin isolation level ${isolation}`)
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ ...JSON.parse(Buffer.from(token.split('.')[1], 'base64url')), sub: id })])
  }
  const pending = promise => promise.then(result => ({ result }), error => ({ error }))
  const blocked = async (waiter, holder) => {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      if ((await db.query('select $2::int=any(pg_blocking_pids($1::int)) b', [waiter.pid, holder.pid])).rows[0].b) return
      await delay(20)
    }
    assert.fail('Expected admission lock queue missing')
  }
  const write = client => client.query('update public.user_preferences set binder_default_format=binder_default_format where false')
  try {
    const privileged = await open(), ordinary = await open(), operator = await open('postgres')
    // A super_admin admitted while closed also holds the barrier until commit.
    await begin(privileged, adminId); await write(privileged)
    const reopening = pending(operator.query('select private.set_business_write_freeze(false)'))
    await blocked(operator, privileged)
    await privileged.query('commit'); assert.equal((await reopening).error, undefined)

    // Ordinary admitted first, closure queued, super_admin queued after closure.
    await begin(ordinary, ordinaryId); await write(ordinary)
    const closing = pending(operator.query('select private.set_business_write_freeze(true)'))
    await blocked(operator, ordinary)
    await begin(privileged, adminId)
    const admitted = pending(write(privileged))
    await blocked(privileged, operator)
    await ordinary.query('commit'); assert.equal((await closing).error, undefined)
    assert.equal((await admitted).error, undefined)
    await privileged.query('commit')
    await begin(ordinary, ordinaryId)
    await assert.rejects(write(ordinary), { code: 'PT503', message: 'business_writes_frozen' })
    await ordinary.query('rollback')

    // Even eligible users cannot use an old RR/serializable freeze snapshot.
    for (const isolation of ['repeatable read', 'serializable']) {
      await operator.query('select private.set_business_write_freeze(false)')
      await begin(privileged, adminId, isolation)
      await privileged.query('select count(*) from public.collections')
      await operator.query('select private.set_business_write_freeze(true)')
      await assert.rejects(write(privileged), { code: '40001' })
      await privileged.query('rollback')
    }
    // A cancelled transition cannot release or implicitly reopen the freeze.
    await begin(privileged, adminId); await write(privileged)
    await operator.query('begin'); await operator.query("set local lock_timeout='100ms'")
    await assert.rejects(operator.query('select private.set_business_write_freeze(false)'), { code: '55P03' })
    await operator.query('rollback'); await privileged.query('rollback')
    assert.equal((await db.query('select frozen from private.business_write_freeze')).rows[0].frozen, true)
  } finally {
    for (const client of clients) { await client.query('rollback').catch(() => undefined); await client.end() }
  }
}
