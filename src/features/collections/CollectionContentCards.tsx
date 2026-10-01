import type { ReactNode } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'

export function CollectionContentCards({ items, renderRow }: {
  items: CollectionContentItem[]; renderRow: (item: CollectionContentItem) => ReactNode
}) {
  return <ul className="collection-card-grid">{items.map(item => <li key={item.collectionItemId}>{renderRow(item)}</li>)}</ul>
}
