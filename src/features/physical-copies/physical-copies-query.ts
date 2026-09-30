import type { QueryClient, QueryFilters } from '@tanstack/react-query'
import { variantIdString, type VariantIdInput } from '../../lib/variant-id'
import type { CollectionContentItem } from '../../types/collection-content'
import { collectionContentKeys } from '../collections/collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'

export const physicalCopiesKey = (viewerId: string, ownerId: string, variantId: VariantIdInput) =>
  ['physical-copies', viewerId, ownerId, variantIdString(variantId)] as const

export async function invalidateCopyPossession(client: QueryClient, viewerId: string, variantId: string) {
  const filters: QueryFilters[] = [
    { queryKey: dashboardCollectionsKey(viewerId), exact: true },
    // Overview has no variant membership, so refresh this viewer's summaries.
    { queryKey: ['collections', 'detail', viewerId] },
    { queryKey: collectionContentKeys(viewerId), predicate: query => {
      const content = client.getQueryData<CollectionContentItem[]>(query.queryKey)
      // Pending/error queries without data cannot prove the variant is absent.
      return content === undefined || content.some(item => item.variantId === variantId)
    } },
  ]
  // invalidateQueries alone reuses an initial pending read without cached data.
  // Cancel its pre-write snapshot first, even if transport cannot be aborted.
  await Promise.all(filters.map(filter => client.cancelQueries(filter)))
  await Promise.all(filters.map(filter => client.invalidateQueries(filter)))
}
