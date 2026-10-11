import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { updateItem, updateParent, updatePreview, updateToken } from '../test/collection-update'
import { applyCollectionUpdate, CollectionUpdateError, createCollectionUpdateService, decodeCollectionUpdateApplyResult,
  decodeCollectionUpdateToken, encodeCollectionUpdateToken, getCollectionUpdateOperationResult, validateCollectionUpdateApplyResult } from './collection-update'
import { createCollectionItemsService, decodeCollectionMutationResult } from './collection-items'
import { getSupabaseClient } from './supabase'
vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const operationId = 'e3500000-0000-0000-0000-000000000001'
const request = () => ({ operationId, token: decodeCollectionUpdateToken(updateToken()), addedVariantIds: updatePreview().added.map(item => item.variant_id) })
const result = () => ({ operation_id: operationId, outcome: 'applied', personal_revision: '9007199254741000',
  applied_target_version: updateToken().target_version, created_items: [{ variant_id: '9007199254740997', collection_item_id: updateItem(9) }] })
function setup() {
  const rpc = vi.fn().mockResolvedValue({ data: result(), error: null })
  const client = { rpc } as unknown as SupabaseClient<Database>
  return { rpc, client, service: createCollectionUpdateService(client) }
}
test('six exact SQL token fields and BIGINT beyond safe integers, generated RPC signature', async () => {
  const { service, rpc } = setup()
  expect(encodeCollectionUpdateToken(request().token)).toEqual(updateToken())
  expect(await service.applyCollectionUpdate(updateParent, request())).toEqual({ operationId, outcome: 'applied',
    personalRevision: '9007199254741000', appliedTargetVersion: '9007199254740998',
    createdItems: [{ variantId: '9007199254740997', collectionItemId: updateItem(9) }] })
  expect(rpc).toHaveBeenCalledExactlyOnceWith('apply_collection_update', {
    p_collection_id: updateParent, p_operation_id: operationId, p_preview_token: updateToken(),
  })
})
test.each(Object.keys(result()))('apply requires key %s', field => {
  const payload: Record<string, unknown> = result(); delete payload[field]
  expect(() => decodeCollectionUpdateApplyResult(payload)).toThrow(CollectionUpdateError)
})
test.each([null, undefined, [], { ...result(), extra: true }, { ...result(), outcome: 'changed' },
  { ...result(), operation_id: operationId.toUpperCase() }, { ...result(), operation_id: 'bad' },
  { ...result(), created_items: [{ ...result().created_items[0], extra: true }] },
  ...['0', '01', '-1', '+1', '1e3', '9223372036854775808', 9007199254741000].map(personal_revision => ({ ...result(), personal_revision })),
  ...['0', '-1', '01', '9223372036854775808', 1].map(applied_target_version => ({ ...result(), applied_target_version })),
  { ...result(), created_items: [{ variant_id: '01', collection_item_id: updateItem(9) }] },
  { ...result(), created_items: [{ variant_id: '1', collection_item_id: 'bad' }] },
  { ...result(), created_items: [...result().created_items, ...result().created_items] },
  { ...result(), created_items: [...result().created_items, { variant_id: '9007199254740997', collection_item_id: updateItem(8) }] },
  { ...result(), created_items: [...result().created_items, { variant_id: '1', collection_item_id: updateItem(9) }] },
])('strict five-key result refuses %j', payload => expect(() => decodeCollectionUpdateApplyResult(payload)).toThrow(CollectionUpdateError))
test.each([
  { ...result(), operation_id: updateItem(8) }, { ...result(), personal_revision: '9007199254741001' },
  { ...result(), applied_target_version: '9007199254740999' }, { ...result(), created_items: [] },
  { ...result(), created_items: [...result().created_items, { variant_id: '3', collection_item_id: updateItem(8) }] },
  { ...result(), created_items: [{ variant_id: '3', collection_item_id: updateItem(8) }] },
])('original context rejects incomplete/extra/mismatched result %j', payload => {
  expect(() => validateCollectionUpdateApplyResult(decodeCollectionUpdateApplyResult(payload), request())).toThrow(CollectionUpdateError)
})
test('empty addition set (removal/conversion only) is valid; PostgreSQL maximum exact', async () => {
  const { service, rpc } = setup()
  const original = { ...request(), token: { ...request().token, personalRevision: '9223372036854775806', targetVersion: '9223372036854775807' }, addedVariantIds: [] }
  rpc.mockResolvedValue({ data: { ...result(), personal_revision: '9223372036854775807', applied_target_version: '9223372036854775807', created_items: [] }, error: null })
  expect(await service.applyCollectionUpdate(updateParent, original)).toHaveProperty('personalRevision', '9223372036854775807')
})
test('general receipt recognizes apply; ordinary four-key decoder remains strict', async () => {
  const { client } = setup()
  expect(await createCollectionItemsService(client).operationResult(updateParent, operationId)).toHaveProperty('outcome', 'applied')
  expect(() => decodeCollectionMutationResult(result())).toThrow()
})
test.each(['move', 'add', 'remove', 'hide'] as const)('apply receipt cannot confirm ordinary %s after lost response', async kind => {
  const { client, rpc } = setup(); const service = createCollectionItemsService(client)
  rpc.mockRejectedValueOnce(new TypeError('lost'))
  const operation = { orderContractVersion: 2, operationId, expectedRevision: request().token.personalRevision } as const
  const write = kind === 'move' ? service.move(updateParent, { itemId: updateItem(1), destination: { placement: 'end' } }, operation)
    : kind === 'add' ? service.add(updateParent, '42', 'end', operation)
      : kind === 'remove' ? service.remove(updateParent, updateItem(1), operation)
        : service.setHidden(updateParent, updateItem(1), true, operation)
  await expect(write).rejects.toHaveProperty('code', 'operation_uncertain')
  expect(rpc).toHaveBeenCalledTimes(2)
})
test('ordinary receipt cannot confirm apply', async () => {
  const { service, rpc } = setup()
  rpc.mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce({ data: { operation_id: operationId, outcome: 'changed',
    personal_revision: '9007199254741000', collection_item_id: updateItem(9) }, error: null })
  await expect(service.applyCollectionUpdate(updateParent, request())).rejects.toHaveProperty('code', 'operation_uncertain')
})
test.each([new TypeError('response lost after simulated commit'), null, { ...result(), extra: true }])('lost/absent/invalid success recovers historical original receipt: %j', async failure => {
  const { service, rpc } = setup()
  if (failure instanceof Error) rpc.mockRejectedValueOnce(failure)
  else rpc.mockResolvedValueOnce({ data: failure, error: null })
  expect(await service.applyCollectionUpdate(updateParent, request())).toHaveProperty('outcome', 'applied')
  expect(rpc.mock.calls.map(call => call[0] as unknown)).toEqual(['apply_collection_update', 'get_collection_operation_result'])
  // Receipt remains the original result even after any later live revision.
  expect(await service.getCollectionUpdateOperationResult(updateParent, request())).toHaveProperty('personalRevision', '9007199254741000')
  expect(rpc).toHaveBeenLastCalledWith('get_collection_operation_result', { p_collection_id: updateParent, p_operation_id: operationId })
})
test.each([null, { ...result(), extra: true }, { ...result(), created_items: [] }, { ...result(), operation_id: updateItem(8) },
  { ...result(), personal_revision: '9007199254741001' }, new TypeError('receipt unavailable')])('absent/invalid/unavailable receipt preserves uncertainty %j', async receipt => {
  const { service, rpc } = setup()
  rpc.mockRejectedValueOnce(new TypeError('lost'))
  if (receipt instanceof Error) rpc.mockRejectedValueOnce(receipt)
  else rpc.mockResolvedValueOnce({ data: receipt, error: null })
  await expect(service.applyCollectionUpdate(updateParent, request())).rejects.toHaveProperty('code', 'operation_uncertain')
  expect(rpc).toHaveBeenCalledTimes(2)
})
test.each([
  ['40001', 'preview_stale', 'preview_stale'], ['23514', 'collection_update_not_available', 'collection_update_not_available'],
  ['23505', 'operation_id_conflict', 'operation_id_conflict'], ['23514', 'collection_update_ineligible', 'collection_update_ineligible'],
  ['23514', 'order_contract_upgrade_required', 'order_contract_upgrade_required'], ['23514', 'collection_update_state_invalid', 'inconsistent_state'],
  ['42501', 'collection_update_unavailable', 'not_authorized'], ['40001', 'collection_structure_conflict', 'collection_structure_conflict'],
  ['XX000', 'collection_update_unexpected', 'collection_update_unexpected'], ['22023', 'collection_operation_invalid', 'collection_operation_invalid'],
  ['XX000', 'private SQL text', 'collection_update_unexpected'],
])('definitive %s/%s never retries or reads receipt', async (code, message, expected) => {
  const { service, rpc } = setup(); rpc.mockResolvedValue({ data: null, error: { code, message, details: 'private' }, status: code === '40001' ? 409 : 400 })
  await expect(service.applyCollectionUpdate(updateParent, request())).rejects.toMatchObject({ code: expected, message: expected })
  expect(rpc).toHaveBeenCalledOnce()
})
test('invalid input stops before writer; explicit repetition retains exact UUID and token', async () => {
  const { service, rpc } = setup()
  for (const invalid of [{ ...request(), operationId: 'bad' }, { ...request(), addedVariantIds: ['1', '1'] },
    { ...request(), token: { ...request().token, personalRevision: '9223372036854775807' } },
    { ...request(), token: { ...request().token, extra: true } }]) {
    await expect(service.applyCollectionUpdate(updateParent, invalid)).rejects.toHaveProperty('code', 'collection_operation_invalid')
  }
  expect(rpc).not.toHaveBeenCalled()
  rpc.mockRejectedValueOnce(new TypeError('lost')).mockResolvedValueOnce({ data: null, error: null })
  await expect(service.applyCollectionUpdate(updateParent, request())).rejects.toHaveProperty('code', 'operation_uncertain')
  await service.applyCollectionUpdate(updateParent, request())
  expect(rpc.mock.calls[2]).toEqual(rpc.mock.calls[0])
})
test('real SDK JSON POST transport never automatically repeats writer on network failure', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(new Response(JSON.stringify(result()), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const client = createClient<Database>('http://127.0.0.1:55321', 'test-publishable', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  })
  await createCollectionUpdateService(client).applyCollectionUpdate(updateParent, request())
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[0]![0]).toContain('/rpc/apply_collection_update')
  expect(fetch.mock.calls[0]![1]?.method).toBe('POST')
  expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual({ p_collection_id: updateParent, p_operation_id: operationId, p_preview_token: updateToken() })
  expect(fetch.mock.calls[1]![0]).toContain('/rpc/get_collection_operation_result')
})
test('public apply/receipt helpers use factory and refuse missing client', async () => {
  const { client } = setup(); vi.mocked(getSupabaseClient).mockReturnValue(client)
  await applyCollectionUpdate(updateParent, request()); await getCollectionUpdateOperationResult(updateParent, request())
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(applyCollectionUpdate(updateParent, request())).rejects.toHaveProperty('code', 'not_authorized')
  await expect(getCollectionUpdateOperationResult(updateParent, request())).rejects.toHaveProperty('code', 'not_authorized')
})
