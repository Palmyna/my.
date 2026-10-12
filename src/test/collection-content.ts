import type { CollectionContent, CollectionContentItem, CollectionContentItemV2 } from '../types/collection-content'

export function contentFixture(items: (CollectionContentItem | CollectionContentItemV2)[], orderContractVersion: 1 | 2 = 1, personalRevision = '0'): CollectionContent {
  return { orderContractVersion, personalRevision, items: items.map(item => ({ ...item, isHidden: 'isHidden' in item ? item.isHidden : false })) }
}
