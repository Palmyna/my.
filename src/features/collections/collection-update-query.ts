import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { CollectionUpdateError, getCollectionUpdateStatus, previewCollectionUpdate } from '../../services/collection-update'
import { collectionUpdatePreviewKey, collectionUpdateStatusKey } from './collection-query'

// Consultation only: mount, focus, reconnect and invalidation never fetch a plan.
// Future owner flow calls refetch explicitly; cached data can still be stale.
const consultation = { enabled: false, retry: false, refetchOnMount: false, refetchOnWindowFocus: false,
  refetchOnReconnect: false, refetchInterval: false } as const
export function collectionUpdateStatusOptions(viewerId: string | undefined, collectionId: string) {
  return queryOptions({ ...consultation, queryKey: collectionUpdateStatusKey(viewerId,collectionId),
    queryFn: () => { if (!viewerId) throw new CollectionUpdateError('not_authorized'); return getCollectionUpdateStatus(collectionId) } })
}
export function collectionUpdatePreviewOptions(viewerId: string | undefined, collectionId: string) {
  return queryOptions({ ...consultation, queryKey: collectionUpdatePreviewKey(viewerId,collectionId),
    queryFn: () => { if (!viewerId) throw new CollectionUpdateError('not_authorized'); return previewCollectionUpdate(collectionId) } })
}
// Reorder/add/remove/hide/apply share this same invalidation
// alongside existing content/order/overview/dashboard keys. No notifications.
export async function invalidateCollectionUpdateQueries(client: QueryClient, viewerId: string, collectionId: string) {
  const filters = [collectionUpdateStatusKey(viewerId,collectionId),collectionUpdatePreviewKey(viewerId,collectionId)]
    .map(queryKey => ({ queryKey,exact: true }))
  await Promise.all(filters.map(filter => client.cancelQueries(filter)))
  await Promise.all(filters.map(filter => client.invalidateQueries({ ...filter,refetchType: 'none' })))
}
