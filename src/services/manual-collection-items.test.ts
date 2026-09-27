import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { addManualCollectionItem, CollectionItemsError, createCollectionItemsService, removeManualCollectionItem } from './collection-items'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const itemId = 'c1900000-0000-0000-0000-000000000001'
const bigId = '9007199254740995'
function setup(error: unknown = null) {
  const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({ data: name === 'add_manual_collection_item' ? itemId : null, error }))
  const from = vi.fn()
  const client = { rpc, from } as unknown as SupabaseClient<Database>
  return { rpc, from, client, service: createCollectionItemsService(client) }
}
test.each(['start', 'end'] as const)('add preserves exact BIGINT and %s business placement', async placement => {
  const { rpc, from, service } = setup()
  await expect(service.add('collection', bigId, placement)).resolves.toBe(itemId)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('add_manual_collection_item', {
    p_collection_id: 'collection', p_variant_id: bigId, p_placement: placement,
  })
  expect(from).not.toHaveBeenCalled()
})
test('default end; removal uses exact collectionItemId and no direct table writes', async () => {
  const { rpc, from, service } = setup()
  await service.add('collection', bigId)
  expect(rpc).toHaveBeenLastCalledWith('add_manual_collection_item', { p_collection_id: 'collection', p_variant_id: bigId, p_placement: 'end' })
  await service.remove('collection', itemId)
  expect(rpc).toHaveBeenLastCalledWith('remove_manual_collection_item', { p_collection_id: 'collection', p_collection_item_id: itemId })
  expect(from).not.toHaveBeenCalled()
})
test.each([
  ['42501', 'collection_action_unavailable', 'collection_action_unavailable'],
  ['22023', 'manual_item_invalid_placement', 'manual_item_invalid_placement'],
  ['P0002', 'manual_variant_unavailable', 'manual_variant_unavailable'], ['23505', 'already_present', 'already_present'],
  ['P0002', 'manual_item_unavailable', 'manual_item_unavailable'], ['23514', 'automatic_item_removal_forbidden', 'automatic_item_removal_forbidden'],
  ['XX000', 'manual_item_unexpected', 'manual_item_unexpected'], ['40001', 'collection_structure_conflict', 'collection_structure_conflict'],
  ['40P01', 'private deadlock', 'collection_structure_conflict'], ['55P03', 'private lock', 'collection_structure_conflict'],
  ['57014', 'private timeout', 'collection_structure_conflict'],
  ...['42501', 'PGRST301', 'PGRST302', 'PGRST303'].map(code => [code, 'private auth', 'not_authorized']),
  ['23505', 'private duplicate', 'manual_item_unexpected'], ['PGRST202', 'private schema', 'manual_item_unexpected'],
])('add/remove map %s / %s safely', async (code, message, expected) => {
  const { service } = setup({ code, message, details: 'private', hint: 'private' })
  for (const operation of [() => service.add('collection', bigId), () => service.remove('collection', itemId)]) {
    const error: unknown = await operation().catch((value: unknown) => value)
    expect(error).toBeInstanceOf(CollectionItemsError)
    expect(error).toMatchObject({ code: expected, message: expected })
    expect(JSON.stringify(error)).not.toContain('private')
    expect(error).not.toHaveProperty('details'); expect(error).not.toHaveProperty('hint')
  }
})
test.each([null, '', 42, {}, 'not-a-uuid'])('malformed add response is uncertain: %j', async data => {
  const { service, rpc } = setup(); rpc.mockResolvedValue({ data, error: null })
  await expect(service.add('collection', bigId)).rejects.toHaveProperty('code', 'manual_item_unexpected')
})
test('malformed remove, transport failure and missing session are sanitized', async () => {
  const { service, rpc, client } = setup()
  rpc.mockResolvedValue({ data: {}, error: null })
  await expect(service.remove('collection', itemId)).rejects.toHaveProperty('code', 'manual_item_unexpected')
  vi.mocked(getSupabaseClient).mockReturnValue(client)
  rpc.mockRejectedValue(new Error('private transport URL'))
  await expect(addManualCollectionItem('collection', bigId, 'end')).rejects.toHaveProperty('message', 'manual_item_unexpected')
  await expect(removeManualCollectionItem('collection', itemId)).rejects.toHaveProperty('message', 'manual_item_unexpected')
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(addManualCollectionItem('collection', bigId, 'end')).rejects.toHaveProperty('code', 'not_authorized')
  await expect(removeManualCollectionItem('collection', itemId)).rejects.toHaveProperty('code', 'not_authorized')
})
test('real supabase-js serialization keeps quoted BIGINT intact in HTTP body', async () => {
  const bodies: unknown[] = []
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    if (typeof init?.body !== 'string') throw new Error('Expected JSON request body')
    bodies.push(JSON.parse(init.body))
    return Promise.resolve(new Response(JSON.stringify(itemId), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  const client = createClient<Database>('http://127.0.0.1:55321', 'test-anon', {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  })
  await createCollectionItemsService(client).add('collection', bigId, 'start')
  expect(bodies).toEqual([{ p_collection_id: 'collection', p_variant_id: bigId, p_placement: 'start' }])
})
