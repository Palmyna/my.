import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { createCollectionItemsService, decodeCollectionMutationResult, CollectionItemsError } from './collection-items'

const collection = 'c2900000-0000-0000-0000-000000000001'
const item = 'd2900000-0000-0000-0000-000000000001'
const operation = { orderContractVersion: 2, expectedRevision: '9007199254740994', operationId: 'e2900000-0000-0000-0000-000000000001' } as const
const result = () => ({ operation_id: operation.operationId, personal_revision: '9007199254740995', collection_item_id: item, outcome: 'changed' })
function setup() {
  const rpc = vi.fn().mockResolvedValue({ data: result(), error: null })
  return { rpc, service: createCollectionItemsService({ rpc } as unknown as SupabaseClient<Database>) }
}
test.each(['move', 'add', 'remove', 'hide'] as const)('%s v2 uses generated RPC with exact decimal transport', async kind => {
  const { rpc, service } = setup()
  if (kind === 'move') await service.move(collection, { itemId: item, destination: { placement: 'end' } }, operation)
  if (kind === 'add') expect(await service.add(collection, '9223372036854775807', 'end', operation)).toBe(item)
  if (kind === 'remove') await service.remove(collection, item, operation)
  if (kind === 'hide') expect(await service.setHidden(collection, item, true, operation)).toHaveProperty('outcome', 'changed')
  expect(rpc).toHaveBeenCalledExactlyOnceWith(kind === 'move' ? 'reorder_collection_item_v2'
    : kind === 'add' ? 'add_manual_collection_item_v2' : kind === 'hide' ? 'set_collection_item_hidden' : 'remove_manual_collection_item_v2', {
    p_collection_id: collection, p_expected_revision: operation.expectedRevision, p_operation_id: operation.operationId,
    ...(kind === 'move' ? { p_item_id: item, p_placement: 'end', p_anchor_id: null }
      : kind === 'add' ? { p_variant_id: '9223372036854775807', p_placement: 'end' }
        : { p_collection_item_id: item, ...(kind === 'hide' ? { p_is_hidden: true } : {}) }),
  })
})
test('contract 1 preserves legacy calls and no revision/UUID', async () => {
  const { rpc, service } = setup()
  rpc.mockResolvedValue({ data: item, error: null })
  await service.add(collection, '9007199254740995', 'end', { orderContractVersion: 1 })
  expect(rpc).toHaveBeenLastCalledWith('add_manual_collection_item', { p_collection_id: collection, p_variant_id: '9007199254740995', p_placement: 'end' })
  rpc.mockResolvedValue({ data: null, error: null })
  await service.remove(collection, item, { orderContractVersion: 1 })
  await service.move(collection, { itemId: item, destination: { placement: 'start' } }, { orderContractVersion: 1 })
  expect(rpc.mock.calls.map(call => call[0] as unknown)).toEqual(['add_manual_collection_item', 'remove_manual_collection_item', 'reorder_collection_item'])
})
test.each(['move', 'add', 'remove', 'hide'] as const)('lost %s response resolves historical receipt without second write', async kind => {
  const { rpc, service } = setup()
  rpc.mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce({ data: result(), error: null })
  if (kind === 'move') await service.move(collection, { itemId: item, destination: { placement: 'end' } }, operation)
  if (kind === 'add') await service.add(collection, '42', 'end', operation)
  if (kind === 'remove') await service.remove(collection, item, operation)
  if (kind === 'hide') await service.setHidden(collection, item, true, operation)
  expect(rpc).toHaveBeenCalledTimes(2)
  expect(rpc).toHaveBeenLastCalledWith('get_collection_operation_result', { p_collection_id: collection, p_operation_id: operation.operationId })
})
test.each([null, { ...result(), extra: true }, { ...result(), operation_id: item }, { ...result(), personal_revision: 42 }])('absent/invalid receipt remains uncertain: %j', async receipt => {
  const { rpc, service } = setup()
  rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'fetch failed' } }).mockResolvedValueOnce({ data: receipt, error: null })
  await expect(service.remove(collection, item, operation)).rejects.toHaveProperty('code', 'operation_uncertain')
  expect(rpc).toHaveBeenCalledTimes(2)
})
test('malformed success is resolved through receipt; receipt lookup failure remains uncertain', async () => {
  const { rpc, service } = setup()
  rpc.mockResolvedValueOnce({ data: { ...result(), extra: true }, error: null })
  await service.remove(collection, item, operation)
  rpc.mockRejectedValueOnce(new Error('lost')).mockRejectedValueOnce(new Error('receipt offline'))
  await expect(service.remove(collection, item, operation)).rejects.toHaveProperty('code', 'operation_uncertain')
})
test.each([
  ['40001', 'collection_structure_conflict'], ['23505', 'operation_id_conflict'], ['23514', 'order_contract_upgrade_required'],
  ['42501', 'collection_action_unavailable'], ['22023', 'collection_operation_invalid'], ['P0002', 'collection_item_unavailable'],
  ['P0002', 'manual_variant_unavailable'], ['23505', 'already_present'], ['23514', 'automatic_item_removal_forbidden'], ['XX000', 'phase8_operation_unexpected'],
  ['23514', 'collection_item_hidden_invalid'],
])('exact business pair %s/%s never retries or consults receipt', async (code, message) => {
  const { rpc, service } = setup(); rpc.mockResolvedValue({ data: null, error: { code, message, details: 'SQL private' } })
  await expect(service.remove(collection, item, operation)).rejects.toMatchObject({ code: message, message })
  expect(rpc).toHaveBeenCalledOnce()
})
test('no-op revision exact; foreign identity/revision/outcome cannot confirm writer', async () => {
  const { rpc, service } = setup()
  rpc.mockResolvedValue({ data: { ...result(), outcome: 'noop', personal_revision: operation.expectedRevision }, error: null })
  await service.move(collection, { itemId: item, destination: { placement: 'end' } }, operation)
  for (const bad of [{ ...result(), collection_item_id: collection }, { ...result(), personal_revision: '9007199254740996' },
    { ...result(), outcome: 'noop' }, { ...result(), collection_item_id: null }]) {
    rpc.mockResolvedValue({ data: bad, error: null })
    await expect(service.remove(collection, item, operation)).rejects.toHaveProperty('code', 'operation_uncertain')
  }
})
test('mutation and receipt decoders reject every missing/extra field and invalid primitive', () => {
  for (const key of Object.keys(result())) {
    const value: Record<string, unknown> = result(); delete value[key]
    expect(() => decodeCollectionMutationResult(value)).toThrow(CollectionItemsError)
  }
  for (const value of [null, [], { ...result(), extra: true }, { ...result(), outcome: 'future' },
    { ...result(), operation_id: 'bad' }, { ...result(), collection_item_id: 'bad' },
    ...[12, '-1', '01', '9223372036854775808'].map(personal_revision => ({ ...result(), personal_revision }))]) {
    expect(() => decodeCollectionMutationResult(value)).toThrow(CollectionItemsError)
  }
  expect(decodeCollectionMutationResult({ ...result(), collection_item_id: null, personal_revision: '9223372036854775807' })).toHaveProperty('collectionItemId', null)
})
test('receipt NULL remains NULL and BIGINT is exact; invalid input never calls RPC', async () => {
  const { rpc, service } = setup()
  expect(await service.operationResult(collection, operation.operationId)).toHaveProperty('personalRevision', '9007199254740995')
  rpc.mockResolvedValue({ data: null, error: null })
  await expect(service.operationResult(collection, operation.operationId)).resolves.toBeNull()
  rpc.mockClear()
  await expect(service.operationResult('bad', operation.operationId)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.add(collection, '9223372036854775808', 'end', operation)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.remove(collection, item, { ...operation, expectedRevision: '01' })).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.move(collection, { itemId: item, destination: { placement: 'before', anchorId: item } }, operation)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  expect(rpc).not.toHaveBeenCalled()
})

test.each([true, false])('hide target %s accepts exact noop and never increments client revision', async hidden => {
  const { rpc, service } = setup()
  rpc.mockResolvedValue({ data: { ...result(), outcome: 'noop', personal_revision: operation.expectedRevision }, error: null })
  expect(await service.setHidden(collection, item, hidden, operation)).toMatchObject({ outcome: 'noop', personalRevision: operation.expectedRevision })
  expect(rpc).toHaveBeenCalledOnce()
})
test.each([null, { ...result(), collection_item_id: collection }, { ...result(), personal_revision: '9007199254740996' },
  { ...result(), outcome: 'noop' }])('hide absent/inconsistent historical receipt remains uncertain: %j', async data => {
  const { rpc, service } = setup()
  rpc.mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce({ data, error: null })
  await expect(service.setHidden(collection, item, true, operation)).rejects.toHaveProperty('code', 'operation_uncertain')
  expect(rpc).toHaveBeenCalledTimes(2)
})
test('hide definitively stale never consults receipt or resubmits', async () => {
  const { rpc, service } = setup()
  rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'collection_structure_conflict' } })
  await expect(service.setHidden(collection, item, true, operation)).rejects.toHaveProperty('code', 'collection_structure_conflict')
  expect(rpc).toHaveBeenCalledOnce()
})
test('hide invalid boolean, UUID, revision or legacy operation cannot dispatch', async () => {
  const { rpc, service } = setup()
  await expect(service.setHidden(collection, item, 'true' as unknown as boolean, operation)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.setHidden(collection, 'bad', true, operation)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.setHidden(collection, item, true, { ...operation, expectedRevision: '01' })).rejects.toHaveProperty('code', 'collection_operation_invalid')
  await expect(service.setHidden(collection, item, true, { orderContractVersion: 1 } as unknown as typeof operation)).rejects.toHaveProperty('code', 'order_contract_upgrade_required')
  expect(rpc).not.toHaveBeenCalled()
})
