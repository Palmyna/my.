import type { CollectionContentItem } from '../../types/collection-content'
import { localSearchTerms, normalizeLocalSearchText } from '../../lib/local-search'

export function collectionSearchKey(query: string): string {
  return localSearchTerms(query).join(' ')
}

export function filterCollectionContent(items: CollectionContentItem[], query: string): CollectionContentItem[] {
  const terms = collectionSearchKey(query).split(' ').filter(Boolean)
  if (terms.length === 0) return items
  return items.filter(item => {
    const fields = [item.cardNameFr, item.setNameFr, item.setAbbreviationFr, item.setAbbreviation,
      item.seriesNameFr, item.seriesNameSource, item.localId, item.variantLabel]
      .filter((field): field is string => field !== null).map(normalizeLocalSearchText)
    return terms.every(term => fields.some(field => field.includes(term)))
  })
}
