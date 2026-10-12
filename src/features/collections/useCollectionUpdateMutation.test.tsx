import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { applyCollectionUpdate, CollectionUpdateError, decodeCollectionUpdatePreview, getCollectionUpdateOperationResult,
  getCollectionUpdateStatus, previewCollectionUpdate } from '../../services/collection-update'
import { addManualCollectionItem, CollectionItemsError } from '../../services/collection-items'
import type { CollectionUpdateApplyRequest, CollectionUpdatePreview } from '../../types/collection-update'
import { contentFixture } from '../../test/collection-content'
import { updateItem, updateParent, updatePreview } from '../../test/collection-update'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionUpdatePreviewKey, collectionUpdateStatusKey } from './collection-query'
import { collectionUpdatePreviewOptions, collectionUpdateStatusOptions } from './collection-update-query'
import { useCollectionStructureMutation } from './useCollectionStructureMutation'
import { useCollectionUpdateMutation } from './useCollectionUpdateMutation'

const viewer = 'a3500000-0000-0000-0000-000000000001'
const otherViewer = 'a3500000-0000-0000-0000-000000000002'
const otherParent = 'c3500000-0000-0000-0000-000000000002'
const auth = vi.hoisted(() => ({ user: { id: 'a3500000-0000-0000-0000-000000000001' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collection-update', async original => ({ ...await original<typeof import('../../services/collection-update')>(),
  applyCollectionUpdate: vi.fn(), getCollectionUpdateOperationResult: vi.fn(), getCollectionUpdateStatus: vi.fn(), previewCollectionUpdate: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(), addManualCollectionItem: vi.fn() }))
const apply = vi.mocked(applyCollectionUpdate), lookup = vi.mocked(getCollectionUpdateOperationResult), add = vi.mocked(addManualCollectionItem)
const originalPreview = () => decodeCollectionUpdatePreview(updatePreview())
const accepted = (request: CollectionUpdateApplyRequest) => ({ operationId: request.operationId, outcome: 'applied' as const,
  personalRevision: (BigInt(request.token.personalRevision) + 1n).toString(), appliedTargetVersion: request.token.targetVersion,
  createdItems: [{ variantId: '9007199254740997', collectionItemId: updateItem(9) }] })
const storageKey = (v = viewer, p = updateParent) => 'my.collection.operation.v2:' + JSON.stringify([v, p])
const addAction = { type: 'add', variantId: '42', placement: 'end' } as const
beforeEach(() => {
  sessionStorage.clear(); auth.user.id = viewer; auth.isAuthorized = true
  apply.mockReset().mockImplementation((_id, request) => Promise.resolve(accepted(request)))
  lookup.mockReset().mockResolvedValue(null); add.mockReset().mockResolvedValue(updateItem(8))
  vi.mocked(getCollectionUpdateStatus).mockReset(); vi.mocked(previewCollectionUpdate).mockReset()
})
function overview(v: string, p: string) {
  return { collectionId: p, ownerId: v, access: 'owned', collectionType: 'automatic', name: 'Fixture', targetType: 'pokemon',
    targetId: '1', targetName: 'Fixture', targetPrimaryType: null, targetSecondaryType: null, ownedCount: 0, totalCount: 0 } as const
}
function setup(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }), summariesActive = true) {
  const read = vi.fn().mockResolvedValue(contentFixture([], 2, originalPreview().token.personalRevision))
  const order = vi.fn().mockResolvedValue([])
  const summary = vi.fn().mockImplementation((v: string, p: string) => Promise.resolve(overview(v, p)))
  const dashboard = vi.fn().mockResolvedValue([])
  if (!summariesActive) {
    client.setQueryData(collectionItemOrderKey(viewer, updateParent), [])
    client.setQueryData(collectionOverviewKey(viewer, updateParent), overview(viewer, updateParent))
    client.setQueryData(dashboardCollectionsKey(viewer), [])
  }
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const mounted = renderHook(({ viewerId, collectionId }) => {
    const enabled = auth.isAuthorized && auth.user.id === viewerId
    const content = useQuery({ queryKey: collectionContentKey(viewerId, collectionId), queryFn: read, enabled })
    const technical = useQuery({ queryKey: collectionItemOrderKey(viewerId, collectionId), queryFn: order, enabled: enabled && summariesActive })
    const detail = useQuery({ queryKey: collectionOverviewKey(viewerId, collectionId), queryFn: () => summary(viewerId, collectionId) as Promise<ReturnType<typeof overview>>, enabled: enabled && summariesActive })
    const dash = useQuery({ queryKey: dashboardCollectionsKey(viewerId), queryFn: dashboard, enabled: enabled && summariesActive })
    useQuery(collectionUpdatePreviewOptions(viewerId, collectionId)); useQuery(collectionUpdateStatusOptions(viewerId, collectionId))
    const ordinary = useCollectionStructureMutation(viewerId, collectionId)
    const update = useCollectionUpdateMutation(viewerId, collectionId)
    return { update, ordinary, ready: [content, technical, detail, dash].every(query => query.isSuccess && !query.isFetching) }
  }, { wrapper, initialProps: { viewerId: viewer, collectionId: updateParent } })
  return { ...mounted, client, read, order, summary, dashboard }
}
async function ready(hook: ReturnType<typeof setup>) { await waitFor(() => expect(hook.result.current.ready).toBe(true)) }
async function present(hook: ReturnType<typeof setup>, preview = originalPreview()) {
  await act(async () => { await Promise.resolve(hook.client.setQueryData(collectionUpdatePreviewKey(viewer, updateParent), preview)) })
  expect(hook.result.current.update.presentPreview(hook.client.getQueryData<CollectionUpdatePreview>(collectionUpdatePreviewKey(viewer, updateParent))!)).toBe(true)
}
async function run(operation: () => Promise<boolean>) {
  let confirmed = false; await act(async () => { confirmed = await operation() }); return confirmed
}
test('no automatic application; only explicitly presented successful contextual preview can dispatch', async () => {
  const hook = setup(); await ready(hook)
  expect(await run(hook.result.current.update.apply)).toBe(false)
  hook.client.setQueryData(collectionUpdatePreviewKey(viewer, updateParent), originalPreview())
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(hook.result.current.update.presentPreview(originalPreview())).toBe(false) // Different object was never presented from this query.
  expect(apply).not.toHaveBeenCalled()
  await present(hook)
  expect(await run(hook.result.current.update.apply)).toBe(true)
  expect(apply).toHaveBeenCalledOnce(); expect(lookup).not.toHaveBeenCalled()
})
test('original UUID/token/variants stored before dispatch, no Auth token or secrets; all active reads before confirmation', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockImplementationOnce((_id, request) => {
    const stored = JSON.parse(sessionStorage.getItem(storageKey())!) as Record<string, unknown>
    expect(stored).toMatchObject({ viewerId: viewer, collectionId: updateParent, confirmed: false,
      operation: { operationId: request.operationId, expectedRevision: request.token.personalRevision },
      action: { type: 'apply', request: { token: request.token, addedVariantIds: request.addedVariantIds } } })
    expect(Object.keys(stored).sort()).toEqual(['action', 'collectionId', 'confirmed', 'operation', 'viewerId'])
    return Promise.resolve(accepted(request))
  })
  expect(await run(hook.result.current.update.apply)).toBe(true)
  for (const read of [hook.read, hook.order, hook.summary, hook.dashboard]) expect(read).toHaveBeenCalledTimes(2)
  expect(sessionStorage.length).toBe(0)
  expect(hook.client.getQueryState(collectionUpdatePreviewKey(viewer, updateParent))?.isInvalidated).toBe(true)
  expect(hook.client.getQueryState(collectionUpdateStatusKey(viewer, updateParent))?.isInvalidated).toBe(true)
  expect(previewCollectionUpdate).not.toHaveBeenCalled(); expect(getCollectionUpdateStatus).not.toHaveBeenCalled()
})
test.each(['legacy', 'free', 'shared', 'wrong owner', 'no delta', 'changed revision', 'invalidated preview', 'replaced preview'] as const)('new apply blocks before storage/writer: %s', async reason => {
  const hook = setup(); await ready(hook); await present(hook)
  await act(async () => {
    if (reason === 'legacy') hook.client.setQueryData(collectionContentKey(viewer, updateParent), contentFixture([], 1))
    if (reason === 'free' || reason === 'shared' || reason === 'wrong owner') hook.client.setQueryData(collectionOverviewKey(viewer, updateParent), {
      ...overview(viewer, updateParent), collectionType: reason === 'free' ? 'free' : 'automatic', access: reason === 'shared' ? 'shared' : 'owned',
      ownerId: reason === 'wrong owner' ? otherViewer : viewer,
    })
    if (reason === 'changed revision') hook.client.setQueryData(collectionContentKey(viewer, updateParent), contentFixture([], 2, '9007199254741001'))
    if (reason === 'invalidated preview') await hook.client.invalidateQueries({ queryKey: collectionUpdatePreviewKey(viewer, updateParent), refetchType: 'none' })
    if (reason === 'replaced preview') hook.client.setQueryData(collectionUpdatePreviewKey(viewer, updateParent), originalPreview(), { updatedAt: Date.now() + 1 })
    if (reason === 'no delta') {
      const preview = { ...originalPreview(), updateAvailable: false }
      hook.client.setQueryData(collectionUpdatePreviewKey(viewer, updateParent), preview)
      hook.result.current.update.presentPreview(hook.client.getQueryData<CollectionUpdatePreview>(collectionUpdatePreviewKey(viewer, updateParent))!)
    }
  })
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(apply).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0)
})
test('uncertain apply blocks every ordinary gesture and other apply; explicit retry reuses original request despite new live revision', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain'))
  hook.read.mockResolvedValue(contentFixture([], 2, '9007199254741009'))
  expect(await run(hook.result.current.update.apply)).toBe(false)
  const original = structuredClone(apply.mock.calls[0]!)
  for (const action of [addAction, { type: 'move', move: { itemId: updateItem(1), destination: { placement: 'end' } } },
    { type: 'remove', collectionItemId: updateItem(1) }, { type: 'hide', collectionItemId: updateItem(1), isHidden: true }] as const) {
    expect(await run(() => hook.result.current.ordinary.submit(action))).toBe(false)
  }
  expect(add).not.toHaveBeenCalled()
  const otherPreview = originalPreview(); otherPreview.token.personalRevision = '9007199254741009'; otherPreview.token.planHash = 'c'.repeat(64)
  await present(hook, otherPreview)
  expect(await run(hook.result.current.update.apply)).toBe(false)
  await act(async () => { await hook.result.current.update.refresh() })
  expect(lookup).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(1)
  expect(await run(hook.result.current.update.retry)).toBe(true)
  expect(apply.mock.calls[1]).toEqual(original)
  expect(lookup.mock.calls[1]).toEqual(original)
})
test('ordinary uncertain request blocks apply through the same retained slot', async () => {
  const hook = setup(); await ready(hook)
  add.mockRejectedValueOnce(new CollectionItemsError('operation_uncertain'))
  expect(await run(() => hook.result.current.ordinary.submit(addAction))).toBe(false)
  await present(hook)
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(apply).not.toHaveBeenCalled(); expect(add).toHaveBeenCalledOnce()
})
test('common busy exclusion holds in both directions while writer pending', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  let finish!: () => void
  apply.mockImplementationOnce((_id, request) => new Promise(resolve => { finish = () => resolve(accepted(request)) }))
  let applying!: Promise<boolean>; act(() => { applying = hook.result.current.update.apply() })
  await waitFor(() => expect(hook.result.current.ordinary.busy).toBe(true))
  expect(await run(() => hook.result.current.ordinary.submit(addAction))).toBe(false)
  expect(add).not.toHaveBeenCalled()
  await act(async () => { finish(); expect(await applying).toBe(true) })
  let finishAdd!: () => void
  add.mockImplementationOnce(() => new Promise(resolve => { finishAdd = () => resolve(updateItem(8)) }))
  let adding!: Promise<boolean>; act(() => { adding = hook.result.current.ordinary.submit(addAction) })
  await waitFor(() => expect(hook.result.current.update.busy).toBe(true))
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(apply).toHaveBeenCalledOnce()
  await act(async () => { finishAdd(); expect(await adding).toBe(true) })
})
test('receipt consultation/recovery also excludes an ordinary submission across hook instances', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  const original = apply.mock.calls[0]![1]
  let finish!: () => void
  lookup.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(accepted(original)) }))
  let refreshing!: Promise<boolean>; act(() => { refreshing = hook.result.current.update.refresh() })
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  expect(await run(() => hook.result.current.ordinary.submit(addAction))).toBe(false)
  await act(async () => { finish(); await refreshing })
  expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0)
})
test.each(['remount', 'reload'] as const)('uncertain original request survives %s and resolves historical receipt after revision changes', async recovery => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  const original = structuredClone(apply.mock.calls[0]!)
  hook.unmount(); hook.client.clear()
  const resumed = setup(recovery === 'remount' ? hook.client : undefined); await ready(resumed)
  resumed.read.mockResolvedValue(contentFixture([], 2, '9007199254741010'))
  lookup.mockResolvedValue(accepted(original[1]))
  expect(apply).toHaveBeenCalledOnce() // Mount never dispatches.
  await act(async () => { await resumed.result.current.update.refresh() })
  expect(lookup).toHaveBeenCalledExactlyOnceWith(...original)
  expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0)
})
test.each(['absent', 'invalid', 'offline'] as const)('receipt %s cannot clear uncertainty or create a replacement', async kind => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  if (kind !== 'absent') lookup.mockRejectedValue(new CollectionUpdateError(kind === 'invalid' ? 'unexpected' : 'operation_uncertain'))
  await act(async () => { await hook.result.current.update.refresh() })
  expect(sessionStorage.length).toBe(1); expect(apply).toHaveBeenCalledOnce()
  expect(await run(() => hook.result.current.ordinary.submit(addAction))).toBe(false)
  expect(add).not.toHaveBeenCalled()
})
test('explicit retry recovers valid receipt without sending writer again', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  lookup.mockResolvedValue(accepted(apply.mock.calls[0]![1]))
  expect(await run(hook.result.current.update.retry)).toBe(true)
  expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.length).toBe(0)
})
test('recovered receipt with failed authoritative reread stays confirmed across reload; retry only reads', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  lookup.mockResolvedValue(accepted(apply.mock.calls[0]![1]))
  hook.read.mockRejectedValueOnce(new Error('read offline'))
  await act(async () => { await hook.result.current.update.refresh() })
  expect(JSON.parse(sessionStorage.getItem(storageKey())!)).toHaveProperty('confirmed', true)
  hook.unmount(); hook.client.clear()
  const resumed = setup(); await ready(resumed)
  expect(await run(resumed.result.current.update.retry)).toBe(true)
  expect(apply).toHaveBeenCalledOnce(); expect(lookup).toHaveBeenCalledOnce()
})
test.each(['navigation', 'logout', 'account switch', 'unmount'] as const)('scope changes during retry receipt lookup prevent writer: %s', async change => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  let finish!: () => void
  lookup.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(null) }))
  let retrying!: Promise<boolean>; act(() => { retrying = hook.result.current.update.retry() })
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  if (change === 'unmount') hook.unmount()
  else {
    if (change === 'logout') { auth.isAuthorized = false; hook.client.clear() }
    if (change === 'account switch') auth.user.id = otherViewer
    hook.rerender({ viewerId: change === 'account switch' ? otherViewer : viewer, collectionId: change === 'navigation' ? otherParent : updateParent })
  }
  await act(async () => { finish(); expect(await retrying).toBe(false) })
  expect(apply).toHaveBeenCalledOnce(); expect(sessionStorage.getItem(storageKey())).not.toBeNull()
})
test.each(['content', 'order', 'overview', 'dashboard'] as const)('failed active %s read blocks confirmation; reload resumes reads without second writer', async failed => {
  const hook = setup(); await ready(hook); await present(hook)
  const read = failed === 'content' ? hook.read : failed === 'order' ? hook.order : failed === 'overview' ? hook.summary : hook.dashboard
  read.mockRejectedValueOnce(new Error('read offline'))
  expect(await run(hook.result.current.update.apply)).toBe(false)
  await waitFor(() => expect(hook.result.current.update.error).toHaveProperty('code', 'content_refresh_failed'))
  expect(JSON.parse(sessionStorage.getItem(storageKey())!)).toHaveProperty('confirmed', true)
  hook.unmount(); hook.client.clear()
  const resumed = setup(); await ready(resumed)
  expect(await run(resumed.result.current.update.retry)).toBe(true)
  expect(apply).toHaveBeenCalledOnce(); expect(lookup).not.toHaveBeenCalled(); expect(sessionStorage.length).toBe(0)
})
test('writer HTTP success alone does not confirm until authoritative read settles', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  let finish!: () => void
  hook.read.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(contentFixture([], 2, '9007199254741000')) }))
  let settled = false, applying!: Promise<boolean>
  act(() => { applying = hook.result.current.update.apply().then(result => { settled = true; return result }) })
  await waitFor(() => expect(apply).toHaveBeenCalledOnce())
  await waitFor(() => expect(hook.read).toHaveBeenCalledTimes(2))
  expect(settled).toBe(false); expect(sessionStorage.length).toBe(1)
  await act(async () => { finish(); expect(await applying).toBe(true) })
})
test('inactive summaries remain invalidated; unrelated viewer/parent/copy caches untouched', async () => {
  const hook = setup(undefined, false); await ready(hook); await present(hook)
  const inactive = [collectionOverviewKey(viewer, updateParent), collectionItemOrderKey(viewer, updateParent), dashboardCollectionsKey(viewer)]
  const unrelated = [collectionContentKey(viewer, otherParent), collectionOverviewKey(viewer, otherParent),
    dashboardCollectionsKey(otherViewer), ['physical-copies', viewer]]
  for (const key of unrelated) hook.client.setQueryData(key, [])
  expect(await run(hook.result.current.update.apply)).toBe(true)
  for (const key of inactive) expect(hook.client.getQueryState(key)?.isInvalidated).toBe(true)
  for (const key of unrelated) expect(hook.client.getQueryState(key)?.isInvalidated).toBe(false)
  for (const read of [hook.order, hook.summary, hook.dashboard]) expect(read).not.toHaveBeenCalled()
})
test('preview_stale is definitive and explicit, invalidates without obtaining/applying new preview', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('preview_stale'))
  expect(await run(hook.result.current.update.apply)).toBe(false)
  await waitFor(() => expect(hook.result.current.update.previewStale).toBe(true))
  expect(sessionStorage.length).toBe(0); expect(lookup).not.toHaveBeenCalled()
  expect(await run(hook.result.current.update.retry)).toBe(false)
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(apply).toHaveBeenCalledOnce(); expect(previewCollectionUpdate).not.toHaveBeenCalled()
  const preview = originalPreview(); preview.token.planHash = 'c'.repeat(64)
  await present(hook, preview)
  expect(await run(hook.result.current.update.apply)).toBe(true)
  expect(apply.mock.calls[1]![1].operationId).not.toBe(apply.mock.calls[0]![1].operationId)
  expect(apply.mock.calls[1]![1].token).toEqual(preview.token)
})
test.each(['storage unavailable', 'corrupt storage'] as const)('blocks before writer or replacement UUID: %s', async failure => {
  const hook = setup(); await ready(hook); await present(hook)
  const uuid = vi.spyOn(crypto, 'randomUUID')
  const storage = failure === 'storage unavailable'
    ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') }) : null
  if (!storage) sessionStorage.setItem(storageKey(), '{"unexpected":true}')
  expect(await run(hook.result.current.update.apply)).toBe(false)
  expect(apply).not.toHaveBeenCalled()
  if (!storage) { expect(uuid).not.toHaveBeenCalled(); expect(sessionStorage.getItem(storageKey())).toBe('{"unexpected":true}') }
  storage?.mockRestore(); uuid.mockRestore()
})
test('corrupt persisted original context on reload blocks all writers without replacement UUID', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  const stored = JSON.parse(sessionStorage.getItem(storageKey())!) as { operation: { expectedRevision: string } }
  stored.operation.expectedRevision = '9007199254741010'
  sessionStorage.setItem(storageKey(), JSON.stringify(stored))
  hook.unmount(); hook.client.clear()
  const resumed = setup(); await ready(resumed)
  const uuid = vi.spyOn(crypto, 'randomUUID')
  expect(await run(resumed.result.current.update.retry)).toBe(false)
  expect(await run(() => resumed.result.current.ordinary.submit(addAction))).toBe(false)
  expect(apply).toHaveBeenCalledOnce(); expect(add).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled()
  uuid.mockRestore()
})
test('logout, account/parent change and cache removal retain original scoped request', async () => {
  const hook = setup(); await ready(hook); await present(hook)
  apply.mockRejectedValueOnce(new CollectionUpdateError('operation_uncertain')); await run(hook.result.current.update.apply)
  const original = structuredClone(apply.mock.calls[0]!)
  auth.isAuthorized = false; hook.client.clear(); hook.rerender({ viewerId: viewer, collectionId: updateParent })
  expect(await run(hook.result.current.update.retry)).toBe(false)
  await act(async () => { await hook.result.current.update.refresh() }); expect(lookup).not.toHaveBeenCalled()
  auth.isAuthorized = true; auth.user.id = otherViewer; hook.rerender({ viewerId: otherViewer, collectionId: updateParent }); await ready(hook)
  expect(await run(hook.result.current.update.retry)).toBe(false)
  auth.user.id = viewer; hook.rerender({ viewerId: viewer, collectionId: otherParent }); await ready(hook)
  expect(await run(hook.result.current.update.retry)).toBe(false)
  hook.rerender({ viewerId: viewer, collectionId: updateParent }); await ready(hook)
  expect(await run(hook.result.current.update.retry)).toBe(true)
  expect(apply.mock.calls[1]).toEqual(original)
})
test.each(['navigation', 'logout', 'account switch'] as const)('accepted write during %s cannot confirm destination/account', async change => {
  const hook = setup(); await ready(hook); await present(hook)
  let finish!: () => void
  apply.mockImplementationOnce((_id, request) => new Promise(resolve => { finish = () => resolve(accepted(request)) }))
  let applying!: Promise<boolean>; act(() => { applying = hook.result.current.update.apply() })
  await waitFor(() => expect(apply).toHaveBeenCalledOnce())
  if (change === 'logout') { auth.isAuthorized = false; hook.client.clear() }
  if (change === 'account switch') auth.user.id = otherViewer
  hook.rerender({ viewerId: change === 'account switch' ? otherViewer : viewer, collectionId: change === 'navigation' ? otherParent : updateParent })
  await act(async () => { finish(); expect(await applying).toBe(false) })
  expect(apply).toHaveBeenCalledOnce()
})
