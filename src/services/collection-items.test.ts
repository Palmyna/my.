import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import type { ItemDestination, ItemMove } from '../types/collection-items'
import { CollectionItemsError, createCollectionItemsService, listCollectionItemOrder, moveCollectionItem } from './collection-items'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
function setup(data: unknown = ['a', 'b'], error: unknown = null) {
  const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({ data: name === 'get_collection_item_order' ? data : null, error }))
  const from = vi.fn()
  const client = { from, rpc } as unknown as SupabaseClient<Database>
  return { client, rpc, from, service: createCollectionItemsService(client) }
}

test('order reads only IDs in deterministic server order, scoped to the collection', async () => {
  const mock = setup()
  await expect(mock.service.listOrder('collection')).resolves.toEqual(['a', 'b'])
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('get_collection_item_order', { p_collection_id: 'collection' })
  expect(mock.from).not.toHaveBeenCalled()
})
test.each([null, {}, [null], [3], [''], ['a', 'a']])('invalid order fails closed: %j', async data => {
  await expect(setup(data).service.listOrder('collection')).rejects.toHaveProperty('code', 'unexpected')
})
test.each<ItemDestination>([{ placement: 'start' }, { placement: 'end' },
  { placement: 'before', anchorId: 'b' }, { placement: 'after', anchorId: 'b' }])('move sends only business intent: %j', async destination => {
  const mock = setup()
  const move = { itemId: 'a', destination, sort_position: 100, automatic_rank: 1, user_id: 'intruder' } as ItemMove
  await expect(mock.service.move('collection', move)).resolves.toBeUndefined()
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('reorder_collection_item', {
    p_collection_id: 'collection', p_item_id: 'a', p_placement: destination.placement,
    ...('anchorId' in destination ? { p_anchor_id: destination.anchorId } : {}),
  })
  expect(mock.from).not.toHaveBeenCalled()
})
test.each([
  ['42501', 'private', 'not_authorized'], ['PGRST301', 'JWT private', 'not_authorized'],
  ['PGRST302', 'JWT private', 'not_authorized'], ['PGRST303', 'JWT private', 'not_authorized'],
  ['P0002', 'reorder_item_unavailable', 'item_unavailable'], ['P0002', 'other', 'unexpected'],
  ['22023', 'reorder_invalid_move', 'order_conflict'], ['22023', 'other', 'unexpected'],
  ['40001', 'private serialization failure', 'order_conflict'], ['40P01', 'deadlock', 'order_conflict'],
  ['55P03', 'lock timeout', 'order_conflict'], ['57014', 'timeout', 'order_conflict'],
  ['23514', 'private constraint', 'unexpected'], ['PGRST202', 'RPC not applied', 'unexpected'],
])('maps %s without leaking backend details', async (code, message, expected) => {
  const mock = setup(null, { code, message, details: 'private details', hint: 'private hint' })
  for (const operation of [() => mock.service.listOrder('collection'),
    () => mock.service.move('collection', { itemId: 'a', destination: { placement: 'end' } })]) {
    const error: unknown = await operation().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CollectionItemsError)
    expect(error).toMatchObject({ code: expected, message: expected })
    expect(error).not.toHaveProperty('details'); expect(error).not.toHaveProperty('hint'); expect(error).not.toHaveProperty('cause')
    expect(JSON.stringify(error)).not.toContain(message)
  }
})
test('transport exceptions and runtime wrappers stay safe', async () => {
  const mock = setup()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await expect(listCollectionItemOrder('collection')).resolves.toEqual(['a', 'b'])
  mock.rpc.mockRejectedValue(new Error('private transport URL'))
  const move: ItemMove = { itemId: 'a', destination: { placement: 'start' } }
  await expect(moveCollectionItem('collection', move)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(listCollectionItemOrder('collection')).rejects.toHaveProperty('code', 'not_authorized')
  await expect(moveCollectionItem('collection', move)).rejects.toHaveProperty('code', 'not_authorized')
})
