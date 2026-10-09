import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { notifyManager, QueryClient, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { addManualCollectionItem, CollectionItemsError, getCollectionOperationResult,
  moveCollectionItem, removeManualCollectionItem, validateCollectionOperationResult } from '../../services/collection-items'
import type { CollectionContent } from '../../types/collection-content'
import type { CollectionOperation, ItemMove, ManualItemPlacement } from '../../types/collection-items'
import { collectionBigint, collectionUuid, personalRevision } from '../../lib/collection-contract'
import { useAuth } from '../auth/auth-context'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionStructureMutationKey } from './collection-query'

export type CollectionStructureAction = { type: 'move'; move: ItemMove }
  | { type: 'add'; variantId: string; placement: ManualItemPlacement }
  | { type: 'remove'; collectionItemId: string }
type Request = { viewerId: string; collectionId: string; action: CollectionStructureAction;
  operation: CollectionOperation; confirmed: boolean }

// Retain uncertain requests across unmount/navigation and QueryClient.clear on
// logout. Scope by viewer AND parent; never dispatch them under another account.
// sessionStorage also preserves the exact request across a reload of this tab.
// No time-based expiry, auth tokens, possession data or new intention on retry.
const retained = new WeakMap<QueryClient, Map<string, Request>>()
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
  if (left.type === 'add' && right.type === 'add') return left.variantId === right.variantId && left.placement === right.placement
  if (left.type === 'remove' && right.type === 'remove') return left.collectionItemId === right.collectionItemId
  if (left.type !== 'move' || right.type !== 'move') return false
  return left.move.itemId === right.move.itemId && left.move.destination.placement === right.move.destination.placement
    && ('anchorId' in left.move.destination ? left.move.destination.anchorId : null)
      === ('anchorId' in right.move.destination ? right.move.destination.anchorId : null)
}
function keys(request: Request) {
  const { viewerId, collectionId } = request
  return [collectionContentKey(viewerId, collectionId), collectionItemOrderKey(viewerId, collectionId),
    ...(request.action.type === 'move' ? [] : [collectionOverviewKey(viewerId, collectionId), dashboardCollectionsKey(viewerId)])]
}
async function reread(client: QueryClient, request: Request) {
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
    return !query || query.getObserversCount() === 0
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
      if (request && !sameAction(request.action, action)) {
        await reread(client, request)
        throw new CollectionItemsError('operation_uncertain')
      }
      if (!request) {
        if (!contentReady(client, viewerId, collectionId)) throw new CollectionItemsError('content_refresh_failed')
        const content = client.getQueryData<CollectionContent>(collectionContentKey(viewerId, collectionId))!
        request = { viewerId, collectionId, action: structuredClone(action), confirmed: false,
          operation: content.orderContractVersion === 2
            ? { orderContractVersion: 2, expectedRevision: content.personalRevision, operationId: crypto.randomUUID() }
            : { orderContractVersion: 1 } }
        if (request.operation.orderContractVersion === 2) retainRequest(map, key, request)
      }
      try {
        if (!request.confirmed) {
          const operation = request.operation.orderContractVersion === 2 ? request.operation : undefined
          // Keep the original legacy calls/signatures and no artificial operation.
          if (request.action.type === 'move') {
            if (operation) await moveCollectionItem(collectionId, request.action.move, operation)
            else await moveCollectionItem(collectionId, request.action.move)
          } else if (request.action.type === 'add') {
            if (operation) await addManualCollectionItem(collectionId, request.action.variantId, request.action.placement, operation)
            else await addManualCollectionItem(collectionId, request.action.variantId, request.action.placement)
          } else {
            if (operation) await removeManualCollectionItem(collectionId, request.action.collectionItemId, operation)
            else await removeManualCollectionItem(collectionId, request.action.collectionItemId)
          }
          request.confirmed = true
        }
      } catch (error) {
        if (!(error instanceof CollectionItemsError) || error.code !== 'operation_uncertain') {
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
    if (running.current || !isAuthorized || user?.id !== viewerId || client.isMutating({ mutationKey, exact: true })) return false
    running.current = true
    try {
      await mutation.mutateAsync(action)
      // Release DnD only after query rows AND mutation busy notifications reach
      // React. Card handles can remount when a busy reason outlives the drop.
      await new Promise<void>(resolve => notifyManager.schedule(resolve))
      return active.current && scope.current.authorized && scope.current.viewerId === viewerId && scope.current.collectionId === collectionId
    } catch { return false }
    finally { running.current = false }
  }
  async function refresh() {
    if (!isAuthorized || user?.id !== viewerId || running.current || client.isMutating({ mutationKey, exact: true })) return
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
            const receipt = await getCollectionOperationResult(collectionId, request.operation.operationId)
            if (receipt) {
              const itemId = request.action.type === 'move' ? request.action.move.itemId
                : request.action.type === 'remove' ? request.action.collectionItemId : null
              validateCollectionOperationResult(receipt, request.operation, request.action.type, itemId)
              request.confirmed = true
            }
          } catch { /* Unavailable/absent receipt retains the exact request. */ }
        }
        await reread(client, request)
        if (request.confirmed && readsConfirmed(client, request)) { forgetRequest(map, key); mutation.reset() }
      } else {
        await rereadKeys(client, [collectionContentKey(viewerId, collectionId), collectionItemOrderKey(viewerId, collectionId)])
      }
    } finally { running.current = false }
  }
  return { submit, refresh, busy, pending: mutation.isPending,
    error: mutation.error, reset: mutation.reset }
}
