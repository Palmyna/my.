import type { CollectionContent, CollectionContentItem } from '../types/collection-content'

export function contentFixture(items: CollectionContentItem[], orderContractVersion: 1 | 2 = 1, personalRevision = '0'): CollectionContent {
  return { orderContractVersion, personalRevision, items: items.map(item => ({ ...item, isHidden: false })) }
}
