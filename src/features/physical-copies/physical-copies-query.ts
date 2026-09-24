import type { QueryClient } from '@tanstack/react-query'
import type { CollectionContentItem } from '../../types/collection-content'
import { collectionContentKeys } from '../collections/collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'

export const physicalCopiesKey = (viewerId: string, ownerId: string, variantId: number) =>
  ['physical-copies', viewerId, ownerId, variantId] as const

export async function invalidateCopyPossession(client: QueryClient, viewerId: string, variantId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: dashboardCollectionsKey(viewerId), exact: true }),
    // Overview has no variant membership, so refresh this viewer's summaries.
    client.invalidateQueries({ queryKey: ['collections', 'detail', viewerId] }),
    client.invalidateQueries({ queryKey: collectionContentKeys(viewerId), predicate: query => {
      const content = client.getQueryData<CollectionContentItem[]>(query.queryKey)
      // Pending/error queries without data cannot prove the variant is absent.
      return content === undefined || content.some(item => item.variantId === variantId)
    } }),
  ])
}
