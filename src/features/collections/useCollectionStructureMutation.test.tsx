import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { addManualCollectionItem, CollectionItemsError, getCollectionOperationResult, moveCollectionItem,
  removeManualCollectionItem } from '../../services/collection-items'
import { contentFixture } from '../../test/collection-content'
import { collectionContentKey } from './collection-query'
import { useCollectionStructureMutation, type CollectionStructureAction } from './useCollectionStructureMutation'

const auth = vi.hoisted(() => ({ user: { id: 'a2900000-0000-0000-0000-000000000001' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(),
  addManualCollectionItem: vi.fn(), removeManualCollectionItem: vi.fn(), moveCollectionItem: vi.fn(), getCollectionOperationResult: vi.fn() }))
const add = vi.mocked(addManualCollectionItem), remove = vi.mocked(removeManualCollectionItem), move = vi.mocked(moveCollectionItem), receipt = vi.mocked(getCollectionOperationResult)
const actions: CollectionStructureAction[] = [{ type: 'move', move: { itemId: 'd2900000-0000-0000-0000-000000000001', destination: { placement: 'end' } } },
  { type: 'add', variantId: '9007199254740995', placement: 'end' }, { type: 'remove', collectionItemId: 'd2900000-0000-0000-0000-000000000001' }]
beforeEach(() => {
  sessionStorage.clear(); auth.user.id = 'a2900000-0000-0000-0000-000000000001'; auth.isAuthorized = true
  add.mockReset().mockResolvedValue('d2900000-0000-0000-0000-000000000001'); remove.mockReset().mockResolvedValue(undefined); move.mockReset().mockResolvedValue(undefined)
  receipt.mockReset().mockResolvedValue(null)
})
function setup(version: 1 | 2 = 2, client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })) {
  const read = vi.fn().mockResolvedValue(contentFixture([], version, '9007199254740994'))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const mounted = renderHook(({ viewerId, collectionId }) => {
    const content = useQuery({ queryKey: collectionContentKey(viewerId, collectionId), queryFn: read, retry: false,
      enabled: auth.isAuthorized && auth.user.id === viewerId })
    return { ...useCollectionStructureMutation(viewerId, collectionId), ready: content.isSuccess && !content.isFetching }
  }, { wrapper, initialProps: { viewerId: 'a2900000-0000-0000-0000-000000000001', collectionId: 'c2900000-0000-0000-0000-000000000001' } })
  return { ...mounted, client, read }
}
async function submit(hook: ReturnType<typeof setup>, action: CollectionStructureAction) {
  let confirmed = false
  await act(async () => { confirmed = await hook.result.current.submit(action) })
  return confirmed
}
test.each([1, 2] as const)('three existing mutations route actual contract %s and reread each time', async version => {
  const hook = setup(version); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  for (const action of actions) expect(await submit(hook, action)).toBe(true)
  for (const fn of [move, add, remove]) {
    expect(fn).toHaveBeenCalledOnce()
    if (version === 2) expect(fn.mock.calls[0]!.at(-1)).toEqual({ orderContractVersion: 2, expectedRevision: '9007199254740994', operationId: expect.any(String) as unknown })
    else expect(fn.mock.calls[0]!.at(-1)).not.toEqual(expect.objectContaining({ operationId: expect.anything() as unknown }))
  }
  if (version === 2) expect(new Set([move, add, remove].map(fn => fn.mock.calls[0]!.at(-1))).size).toBe(3)
  expect(hook.read).toHaveBeenCalledTimes(4)
})
test.each(actions)('uncertain $type retry retains UUID and all parameters despite fresh revision', async action => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  const write = action.type === 'move' ? move : action.type === 'add' ? add : remove
  write.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  hook.read.mockResolvedValue(contentFixture([], 2, '9007199254740999'))
  expect(await submit(hook, action)).toBe(false)
  const original = structuredClone(write.mock.calls[0])
  await act(async () => { await hook.result.current.refresh() })
  expect(receipt).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledOnce() // NULL never generates another intention.
  expect(await submit(hook, action)).toBe(true)
  expect(write.mock.calls[1]).toEqual(original)
  expect(await submit(hook, action)).toBe(true) // A genuine next action gets a new UUID/revision.
  const next = write.mock.calls[2]!.at(-1)
  expect(next).toMatchObject({ expectedRevision: '9007199254740999' })
  expect(next).not.toEqual(original!.at(-1))
})
test('uncertain action blocks different kind/parameters; navigation and cache clear keep same request', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  move.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await submit(hook, actions[0]!)).toBe(false)
  const original = structuredClone(move.mock.calls[0])
  expect(await submit(hook, actions[1]!)).toBe(false); expect(add).not.toHaveBeenCalled()
  hook.unmount(); hook.client.clear()
  const resumed = setup(2, hook.client); await waitFor(() => expect(resumed.result.current.ready).toBe(true))
  expect(await submit(resumed, actions[0]!)).toBe(true)
  expect(move.mock.calls[1]).toEqual(original)
})
test('revision conflict rereads without automatic write; explicit next action gets new UUID/revision', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  move.mockRejectedValueOnce(new CollectionItemsError('collection_structure_conflict'))
  hook.read.mockResolvedValue(contentFixture([], 2, '9007199254741000'))
  expect(await submit(hook, actions[0]!)).toBe(false)
  expect(move).toHaveBeenCalledOnce(); expect(receipt).not.toHaveBeenCalled()
  expect(hook.read).toHaveBeenCalledTimes(2)
  expect(await submit(hook, actions[0]!)).toBe(true)
  expect(move.mock.calls[1]![2]).toMatchObject({ expectedRevision: '9007199254741000' })
  expect(move.mock.calls[1]![2]).not.toEqual(move.mock.calls[0]![2])
})
test('successful write with failed reread cannot confirm or perform a second write', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  hook.read.mockRejectedValue(new Error('read offline'))
  expect(await submit(hook, actions[1]!)).toBe(false)
  await waitFor(() => expect(hook.result.current.error).toHaveProperty('code', 'content_refresh_failed'))
  expect(await submit(hook, actions[1]!)).toBe(false); expect(add).toHaveBeenCalledOnce()
  hook.read.mockResolvedValue(contentFixture([], 2, '9007199254740995'))
  expect(await submit(hook, actions[1]!)).toBe(true); expect(add).toHaveBeenCalledOnce()
})
test('receipt recovery clears uncertainty after authoritative reread and never writes', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  remove.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await submit(hook, actions[2]!)).toBe(false)
  const operation = remove.mock.calls[0]![2]!
  expect(operation.orderContractVersion).toBe(2)
  receipt.mockResolvedValue({ operationId: operation.orderContractVersion === 2 ? operation.operationId : '', outcome: 'changed',
    personalRevision: '9007199254740995', collectionItemId: 'd2900000-0000-0000-0000-000000000001' })
  await act(async () => { await hook.result.current.refresh() })
  expect(remove).toHaveBeenCalledOnce(); await waitFor(() => expect(hook.result.current.error).toBeNull())
  expect(await submit(hook, actions[1]!)).toBe(true)
})
test('logout/account switch cannot retry another viewer; restoring original viewer retains request', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  add.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await submit(hook, actions[1]!)).toBe(false)
  const original = structuredClone(add.mock.calls[0])
  auth.isAuthorized = false; hook.client.clear(); hook.rerender({ viewerId: 'a2900000-0000-0000-0000-000000000001', collectionId: 'c2900000-0000-0000-0000-000000000001' })
  expect(await submit(hook, actions[1]!)).toBe(false)
  await act(async () => { await hook.result.current.refresh() }); expect(receipt).not.toHaveBeenCalled()
  auth.isAuthorized = true; auth.user.id = 'a2900000-0000-0000-0000-000000000002'; hook.rerender({ viewerId: 'a2900000-0000-0000-0000-000000000002', collectionId: 'c2900000-0000-0000-0000-000000000001' })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  expect(await submit(hook, actions[0]!)).toBe(true)
  expect(add).toHaveBeenCalledOnce()
  auth.user.id = 'a2900000-0000-0000-0000-000000000001'; hook.rerender({ viewerId: 'a2900000-0000-0000-0000-000000000001', collectionId: 'c2900000-0000-0000-0000-000000000001' })
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  expect(await submit(hook, actions[1]!)).toBe(true)
  expect(add.mock.calls[1]).toEqual(original)
})
test.each(['revision', 'item', 'outcome'] as const)('invalid receipt %s cannot release an uncertain action', async field => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  remove.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await submit(hook, actions[2]!)).toBe(false)
  const operation = remove.mock.calls[0]![2]!
  receipt.mockResolvedValue({ operationId: operation.orderContractVersion === 2 ? operation.operationId : '',
    outcome: field === 'outcome' ? 'noop' : 'changed', personalRevision: field === 'revision' ? '9007199254740999' : '9007199254740995',
    collectionItemId: field === 'item' ? 'd2900000-0000-0000-0000-000000000002' : 'd2900000-0000-0000-0000-000000000001' })
  await act(async () => { await hook.result.current.refresh() })
  expect(await submit(hook, actions[1]!)).toBe(false); expect(add).not.toHaveBeenCalled()
  expect(await submit(hook, actions[2]!)).toBe(true)
  expect(remove.mock.calls[1]).toEqual(remove.mock.calls[0])
})
test('navigation during accepted write produces no confirmation in destination', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  let finish!: () => void; move.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let result!: Promise<boolean>; act(() => { result = hook.result.current.submit(actions[0]!) })
  await waitFor(() => expect(move).toHaveBeenCalledOnce())
  hook.rerender({ viewerId: 'a2900000-0000-0000-0000-000000000001', collectionId: 'c2900000-0000-0000-0000-000000000002' })
  await act(async () => { finish(); expect(await result).toBe(false) })
  expect(hook.client.getQueryState(collectionContentKey('a2900000-0000-0000-0000-000000000001', 'c2900000-0000-0000-0000-000000000001'))?.isInvalidated).toBe(true)
  expect(hook.client.getQueryState(collectionContentKey('a2900000-0000-0000-0000-000000000001', 'c2900000-0000-0000-0000-000000000002'))?.isInvalidated).toBe(false)
})

test('reload restores stored exact request into a fresh query client', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  add.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await submit(hook, actions[1]!)).toBe(false)
  const original = structuredClone(add.mock.calls[0])
  expect(sessionStorage.length).toBe(1)
  hook.unmount(); hook.client.clear()
  const reloaded = setup(); await waitFor(() => expect(reloaded.result.current.ready).toBe(true))
  reloaded.read.mockResolvedValue(contentFixture([], 2, '9007199254741000'))
  expect(await submit(reloaded, actions[1]!)).toBe(true)
  expect(add.mock.calls[1]).toEqual(original)
  expect(sessionStorage.length).toBe(0)
})
test('unavailable persistence prevents v2 dispatch; legacy does not depend on persistence', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
  expect(await submit(hook, actions[1]!)).toBe(false)
  expect(add).not.toHaveBeenCalled()
  await waitFor(() => expect(hook.result.current.error).toHaveProperty('code', 'operation_storage_unavailable'))
  const legacy = setup(1); await waitFor(() => expect(legacy.result.current.ready).toBe(true))
  expect(await submit(legacy, actions[1]!)).toBe(true)
  storage.mockRestore()
})
test('corrupt saved request blocks a replacement UUID and writer', async () => {
  const hook = setup(); await waitFor(() => expect(hook.result.current.ready).toBe(true))
  const key = 'my.collection.operation.v2:' + JSON.stringify(['a2900000-0000-0000-0000-000000000001', 'c2900000-0000-0000-0000-000000000001'])
  sessionStorage.setItem(key, '{"unexpected":true}')
  expect(await submit(hook, actions[1]!)).toBe(false)
  expect(add).not.toHaveBeenCalled()
  expect(sessionStorage.getItem(key)).toBe('{"unexpected":true}')
})
