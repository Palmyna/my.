import type { ReactNode } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'
import { CollectionContentCards } from './CollectionContentCards'
import { CollectionContentList } from './CollectionContentList'
import { CollectionItemReorderList } from './CollectionItemReorderList'
import { useCollectionItemReorder } from './useCollectionItemReorder'

type Props = {
  collectionId: string; items: CollectionContentItem[]; readOnly: boolean; view: 'list' | 'cards'
  partialView: boolean; fetching: boolean; renderRow: (item: CollectionContentItem) => ReactNode
}

// Both renderers consume the same filtered server order and mutation lifecycle.
export function CollectionContentRenderer({ readOnly, ...props }: Props) {
  if (!readOnly) return <OwnedContent {...props} />
  const Renderer = props.view === 'cards' ? CollectionContentCards : CollectionContentList
  return <Renderer items={props.items} renderRow={props.renderRow} />
}

function OwnedContent({ collectionId, items, partialView, fetching, renderRow, view }: Omit<Props, 'readOnly'>) {
  const reorder = useCollectionItemReorder({ collectionId, access: 'owned', availability: fetching
    ? { enabled: false, reason: 'Actualisation des cartes…' }
    : partialView ? { enabled: false, reason: 'Effacez la recherche pour réorganiser la collection.' } : { enabled: true } })
  const byId = new Map(items.map(item => [item.collectionItemId, item]))
  return <CollectionItemReorderList collectionId={collectionId} layout={view} hideHandles={partialView}
    items={items.map(item => ({ id: item.collectionItemId, label: item.cardNameFr || 'Nom indisponible' }))}
    availability={reorder.availability} onMove={reorder.move} feedback={reorder.error}
    recovery={<button type="button" className="button" disabled={reorder.isSaving}
      onClick={() => void reorder.refresh()}>Actualiser l’ordre</button>}
    renderItem={item => renderRow(byId.get(item.id)!)} />
}
