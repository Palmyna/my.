import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { notifyManager, QueryClient, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { addManualCollectionItem, CollectionItemsError, getCollectionOperationResult,
  moveCollectionItem, removeManualCollectionItem, setCollectionItemHidden, validateCollectionOperationResult } from '../../services/collection-items'
import type { CollectionContent } from '../../types/collection-content'
import type { CollectionOperation, ItemMove, ManualItemPlacement } from '../../types/collection-items'
import type { CollectionUpdateApplyRequest, CollectionUpdatePreview } from '../../types/collection-update'
import type { CollectionOverview } from '../../types/collections'
import { applyCollectionUpdate, CollectionUpdateError, collectionUpdateApplyRequestSchema, encodeCollectionUpdateToken,
  getCollectionUpdateOperationResult } from '../../services/collection-update'
import { collectionBigint, collectionUuid, personalRevision } from '../../lib/collection-contract'
import { useAuth } from '../auth/auth-context'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionStructureMutationKey, collectionUpdatePreviewKey } from './collection-query'
import { invalidateCollectionUpdateQueries } from './collection-update-query'

export type CollectionStructureAction = { type: 'move'; move: ItemMove }
  | { type: 'add'; variantId: string; placement: ManualItemPlacement }
  | { type: 'remove'; collectionItemId: string }
  | { type: 'hide'; collectionItemId: string; isHidden: boolean }
  | { type: 'apply'; request: Omit<CollectionUpdateApplyRequest, 'operationId'>;
      presented: { viewerId: string; collectionId: string; previewUpdatedAt: number } }
type Request = { viewerId: string; collectionId: string; action: CollectionStructureAction;
  operation: CollectionOperation; confirmed: boolean }

// Retain uncertain requests across unmount/navigation and QueryClient.clear on
// logout. Scope by viewer AND parent; never dispatch them under another account.
// sessionStorage also preserves the exact request across a reload of this tab.
// No time-based expiry, auth tokens, possession data or new intention on retry.
const retained = new WeakMap<QueryClient, Map<string, Request>>()
const coordinating = new WeakMap<QueryClient, Set<string>>()
function locks(client: QueryClient) {
  let set = coordinating.get(client)
  if (!set) { set = new Set(); coordinating.set(client, set) }
  return set
}
function requests(client: QueryClient) {
  let map = retained.get(client)
  if (!map) { map = new Map(); retained.set(client, map) }
  return map
}
const resourceKey = (viewerId: string, collectionId: string) => JSON.stringify([viewerId, collectionId])
const storageKey = (key: string) => `my.collection.operation.v2:${key}`
const storedRequest = z.strictObject({
  viewerId: collectionUuid, collectionId: collectionUuid, confirmed: z.boolean(),
  operation: z.strictObject({ orderContractVersion: z.literal(2), expectedRevision: personalRevision, operationId: collectionUuid }),
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('add'), variantId: collectionBigint, placement: z.enum(['start', 'end']) }),
    z.strictObject({ type: z.literal('remove'), collectionItemId: collectionUuid }),
    z.strictObject({ type: z.literal('hide'), collectionItemId: collectionUuid, isHidden: z.boolean() }),
    z.strictObject({ type: z.literal('apply'), request: collectionUpdateApplyRequestSchema.omit({ operationId: true }),
      presented: z.strictObject({ viewerId: collectionUuid, collectionId: collectionUuid, previewUpdatedAt: z.number().nonnegative() }) }),
    z.strictObject({ type: z.literal('move'), move: z.strictObject({ itemId: collectionUuid,
      destination: z.union([z.strictObject({ placement: z.enum(['start', 'end']) }),
        z.strictObject({ placement: z.enum(['before', 'after']), anchorId: collectionUuid })]) }) }),
  ]),
})
function retainedRequest(map: Map<string, Request>, key: string): Request | undefined {
  const cached = map.get(key)
  if (cached) return cached
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (raw === null) return undefined
    const parsed = storedRequest.safeParse(JSON.parse(raw))
    if (!parsed.success || resourceKey(parsed.data.viewerId, parsed.data.collectionId) !== key) throw new Error('Invalid saved request')
    if (parsed.data.action.type === 'apply' && (parsed.data.action.presented.viewerId !== parsed.data.viewerId
      || parsed.data.action.presented.collectionId !== parsed.data.collectionId
      || parsed.data.operation.expectedRevision !== parsed.data.action.request.token.personalRevision
      || BigInt(parsed.data.action.request.token.targetVersion) <= BigInt(parsed.data.action.request.token.appliedTargetVersion))) throw new Error('Invalid apply context')
    map.set(key, parsed.data)
    return parsed.data
  } catch { throw new CollectionItemsError('operation_uncertain') }
}
function retainRequest(map: Map<string, Request>, key: string, request: Request) {
  // Persist BEFORE dispatch. If browser storage is unavailable, no v2 writer is
  // sent; there can be no accepted action whose UUID was not preserved.
  try { sessionStorage.setItem(storageKey(key), JSON.stringify(request)) }
  catch { throw new CollectionItemsError('operation_storage_unavailable') }
  map.set(key, request)
}
function forgetRequest(map: Map<string, Request>, key: string) {
  try { sessionStorage.removeItem(storageKey(key)) }
  catch { throw new CollectionItemsError('operation_storage_unavailable') }
  map.delete(key)
}
function sameAction(left: CollectionStructureAction, right: CollectionStructureAction) {
  if (left.type === 'apply' && right.type === 'apply') return JSON.stringify(encodeCollectionUpdateToken(left.request.token))
    === JSON.stringify(encodeCollectionUpdateToken(right.request.token))
    && JSON.stringify(left.request.addedVariantIds) === JSON.stringify(right.request.addedVariantIds)
    && left.presented.viewerId === right.presented.viewerId && left.presented.collectionId === right.presented.collectionId
  if (left.type === 'add' && right.type === 'add') return left.variantId === right.variantId && left.placement === right.placement
  if (left.type === 'remove' && right.type === 'remove') return left.collectionItemId === right.collectionItemId
  if (left.type === 'hide' && right.type === 'hide') return left.collectionItemId === right.collectionItemId && left.isHidden === right.isHidden
  if (left.type !== 'move' || right.type !== 'move') return false
  return left.move.itemId === right.move.itemId && left.move.destination.placement === right.move.destination.placement
    && ('anchorId' in left.move.destination ? left.move.destination.anchorId : null)
      === ('anchorId' in right.move.destination ? right.move.destination.anchorId : null)
}
function applyRequest(request: Request): CollectionUpdateApplyRequest {
  if (request.action.type !== 'apply' || request.operation.orderContractVersion !== 2) throw new CollectionUpdateError('collection_operation_invalid')
  return { ...request.action.request, operationId: request.operation.operationId }
}
function requirePresentedPreview(client: QueryClient, viewerId: string, collectionId: string,
  action: Extract<CollectionStructureAction, { type: 'apply' }>, content: CollectionContent) {
  const overview = client.getQueryData<CollectionOverview>(collectionOverviewKey(viewerId, collectionId))
  if (overview?.ownerId !== viewerId || overview.collectionId !== collectionId || overview.access !== 'owned') throw new CollectionUpdateError('not_authorized')
  if (overview.collectionType !== 'automatic') throw new CollectionUpdateError('collection_update_ineligible')
  if (content.orderContractVersion !== 2) throw new CollectionUpdateError('order_contract_upgrade_required')
  const state = client.getQueryState<CollectionUpdatePreview>(collectionUpdatePreviewKey(viewerId, collectionId))
  const preview = state?.data
  if (state?.status !== 'success' || state.fetchStatus !== 'idle' || state.isInvalidated || !preview
    || preview.collectionId !== collectionId || action.presented.viewerId !== viewerId || action.presented.collectionId !== collectionId
    || action.presented.previewUpdatedAt !== state.dataUpdatedAt
    || JSON.stringify(encodeCollectionUpdateToken(preview.token)) !== JSON.stringify(encodeCollectionUpdateToken(action.request.token))
    || JSON.stringify(preview.added.map(item => item.variantId)) !== JSON.stringify(action.request.addedVariantIds)) {
    throw new CollectionUpdateError('preview_not_presented')
  }
  if (preview.token.personalRevision !== content.personalRevision) throw new CollectionUpdateError('preview_stale')
  if (!preview.updateAvailable) throw new CollectionUpdateError('collection_update_not_available')
}
function keys(request: Request) {
  const { viewerId, collectionId } = request
  return [collectionContentKey(viewerId, collectionId), collectionItemOrderKey(viewerId, collectionId),
    ...(request.action.type === 'move' ? [] : [collectionOverviewKey(viewerId, collectionId), dashboardCollectionsKey(viewerId)])]
}
async function reread(client: QueryClient, request: Request) {
  await invalidateCollectionUpdateQueries(client, request.viewerId, request.collectionId)
  await rereadKeys(client, keys(request))
}
async function rereadKeys(client: QueryClient, queryKeys: readonly (readonly unknown[])[]) {
  const filters = queryKeys.map(queryKey => ({ queryKey, exact: true }))
  await Promise.all(filters.map(filter => client.cancelQueries(filter)))
  await Promise.all(filters.map(filter => client.invalidateQueries(filter)))
  await new Promise<void>(resolve => notifyManager.schedule(resolve))
}
function contentReady(client: QueryClient, viewerId: string, collectionId: string) {
  const state = client.getQueryState<CollectionContent>(collectionContentKey(viewerId, collectionId))
  return state?.status === 'success' && state.fetchStatus === 'idle' && !state.isInvalidated && state.data !== undefined
}
function readsConfirmed(client: QueryClient, request: Request) {
  return contentReady(client, request.viewerId, request.collectionId) && keys(request).every(queryKey => {
    const query = client.getQueryCache().find({ queryKey, exact: true })
    // Inactive summaries remain invalidated for their next ordinary consultation.
    return !query || !query.isActive()
      || (query.state.status === 'success' && query.state.fetchStatus === 'idle' && !query.state.isInvalidated)
  })
}

export function useCollectionStructureMutation(viewerId: string, collectionId: string) {
  const client = useQueryClient()
  const { user, isAuthorized } = useAuth()
  const active = useRef(false), running = useRef(false)
  const scope = useRef({ viewerId, collectionId, authorized: isAuthorized && user?.id === viewerId })
  useEffect(() => {
    scope.current = { viewerId, collectionId, authorized: isAuthorized && user?.id === viewerId }
    active.current = true
    return () => { active.current = false }
  }, [viewerId, collectionId, isAuthorized, user?.id])
  const mutationKey = collectionStructureMutationKey(viewerId, collectionId)
  const busy = useIsMutating({ mutationKey, exact: true }) > 0
  const mutation = useMutation({
    mutationKey, retry: false,
    mutationFn: async (action: CollectionStructureAction) => {
      if (!scope.current.authorized || scope.current.viewerId !== viewerId || scope.current.collectionId !== collectionId) {
        throw new CollectionItemsError('not_authorized')
      }
      const map = requests(client), key = resourceKey(viewerId, collectionId)
      const current = client.getQueryData<CollectionContent>(collectionContentKey(viewerId, collectionId))
      let request = current?.orderContractVersion === 1 ? map.get(key) : retainedRequest(map, key)
      const resuming = !!request
      if (request && !sameAction(request.action, action)) {
        await reread(client, request)
        throw new CollectionItemsError('operation_uncertain')
      }
      if (!request) {
        if (!contentReady(client, viewerId, collectionId)) throw new CollectionItemsError('content_refresh_failed')
        const content = client.getQueryData<CollectionContent>(collectionContentKey(viewerId, collectionId))!
        if (action.type === 'apply') requirePresentedPreview(client, viewerId, collectionId, action, content)
        if (action.type === 'hide' && content.orderContractVersion !== 2) throw new CollectionItemsError('order_contract_upgrade_required')
        request = { viewerId, collectionId, action: structuredClone(action), confirmed: false,
          operation: content.orderContractVersion === 2
            ? { orderContractVersion: 2, expectedRevision: content.personalRevision, operationId: crypto.randomUUID() }
            : { orderContractVersion: 1 } }
        if (request.operation.orderContractVersion === 2) retainRequest(map, key, request)
      }
      let dispatched = false
      try {
        if (resuming && !request.confirmed && request.action.type === 'apply' && request.operation.orderContractVersion === 2) {
          try {
            if (await getCollectionUpdateOperationResult(collectionId, applyRequest(request))) {
              request.confirmed = true
              retainRequest(map, key, request)
            }
          } catch { /* An explicit retry keeps the original request even without a receipt. */ }
        }
        if (!request.confirmed) {
          if (!active.current || !scope.current.authorized || scope.current.viewerId !== viewerId || scope.current.collectionId !== collectionId) {
            throw new CollectionItemsError('not_authorized')
          }
          const operation = request.operation.orderContractVersion === 2 ? request.operation : undefined
          dispatched = true
          // Keep the original legacy calls/signatures and no artificial operation.
          if (request.action.type === 'apply') {
            await applyCollectionUpdate(collectionId, applyRequest(request))
          } else if (request.action.type === 'move') {
            if (operation) await moveCollectionItem(collectionId, request.action.move, operation)
            else await moveCollectionItem(collectionId, request.action.move)
          } else if (request.action.type === 'add') {
            if (operation) await addManualCollectionItem(collectionId, request.action.variantId, request.action.placement, operation)
            else await addManualCollectionItem(collectionId, request.action.variantId, request.action.placement)
          } else if (request.action.type === 'hide') {
            if (!operation) throw new CollectionItemsError('order_contract_upgrade_required')
            await setCollectionItemHidden(collectionId, request.action.collectionItemId, request.action.isHidden, operation)
          } else {
            if (operation) await removeManualCollectionItem(collectionId, request.action.collectionItemId, operation)
            else await removeManualCollectionItem(collectionId, request.action.collectionItemId)
          }
          request.confirmed = true
          if (request.operation.orderContractVersion === 2) retainRequest(map, key, request)
        }
      } catch (error) {
        if (dispatched && !request.confirmed && !((error instanceof CollectionItemsError || error instanceof CollectionUpdateError) && error.code === 'operation_uncertain')) {
          // A definitive refusal ends this action. Revisions are never changed
          // and resubmitted automatically; another gesture is a new intention.
          if (request.operation.orderContractVersion === 2) forgetRequest(map, key)
        }
        throw error
      } finally { await reread(client, request) }
      if (!readsConfirmed(client, request)) throw new CollectionItemsError('content_refresh_failed')
      if (request.operation.orderContractVersion === 2) forgetRequest(map, key)
    },
  })
  const reset = mutation.reset
  useEffect(() => { reset() }, [collectionId, viewerId, isAuthorized, reset])
  async function submit(action: CollectionStructureAction): Promise<boolean> {
    const key = resourceKey(viewerId, collectionId), occupied = locks(client)
    if (!active.current || !scope.current.authorized || scope.current.viewerId !== viewerId || scope.current.collectionId !== collectionId
      || running.current || occupied.has(key) || !isAuthorized || user?.id !== viewerId || client.isMutating({ mutationKey, exact: true })) return false
    occupied.add(key)
    running.current = true
    try {
      await mutation.mutateAsync(action)
      // Release DnD only after query rows AND mutation busy notifications reach
      // React. Card handles can remount when a busy reason outlives the drop.
      await new Promise<void>(resolve => notifyManager.schedule(resolve))
      return active.current && scope.current.authorized && scope.current.viewerId === viewerId && scope.current.collectionId === collectionId
    } catch { return false }
    finally { running.current = false; occupied.delete(key) }
  }
  async function refresh() {
    const lockKey = resourceKey(viewerId, collectionId), occupied = locks(client)
    if (!active.current || !scope.current.authorized || scope.current.viewerId !== viewerId || scope.current.collectionId !== collectionId
      || !isAuthorized || user?.id !== viewerId || running.current || occupied.has(lockKey) || client.isMutating({ mutationKey, exact: true })) return
    occupied.add(lockKey)
    running.current = true
    try {
      const map = requests(client), key = resourceKey(viewerId, collectionId)
      let request: Request | undefined
      try {
        request = client.getQueryData<CollectionContent>(collectionContentKey(viewerId, collectionId))?.orderContractVersion === 1
          ? map.get(key) : retainedRequest(map, key)
      } catch { return }
      if (request?.operation.orderContractVersion === 2) {
        if (!request.confirmed) {
          try {
            if (request.action.type === 'apply') {
              if (await getCollectionUpdateOperationResult(collectionId, applyRequest(request))) request.confirmed = true
            } else {
              const receipt = await getCollectionOperationResult(collectionId, request.operation.operationId)
              if (receipt) {
                const itemId = request.action.type === 'move' ? request.action.move.itemId
                  : request.action.type === 'remove' || request.action.type === 'hide' ? request.action.collectionItemId : null
                validateCollectionOperationResult(receipt, request.operation, request.action.type, itemId)
                request.confirmed = true
              }
            }
            if (request.confirmed) retainRequest(map, key, request)
          } catch { /* Unavailable/absent receipt retains the exact request. */ }
        }
        await reread(client, request)
        if (request.confirmed && readsConfirmed(client, request)) { forgetRequest(map, key); mutation.reset() }
      } else {
        await rereadKeys(client, [collectionContentKey(viewerId, collectionId), collectionItemOrderKey(viewerId, collectionId)])
      }
    } finally { running.current = false; occupied.delete(lockKey) }
  }
  async function retry() {
    if (!isAuthorized || user?.id !== viewerId) return false
    try {
      const request = retainedRequest(requests(client), resourceKey(viewerId, collectionId))
      return request ? await submit(request.action) : false
    } catch { return false }
  }
  return { submit, refresh, retry, busy, pending: mutation.isPending,
    error: mutation.error, reset: mutation.reset }
}
