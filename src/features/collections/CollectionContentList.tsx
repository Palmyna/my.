import type { ReactNode } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'
import { CollectionItemReorderList } from './CollectionItemReorderList'
import { useCollectionItemReorder } from './useCollectionItemReorder'

type Props = {
  collectionId: string; items: CollectionContentItem[]; readOnly: boolean
  partialView: boolean; fetching: boolean; renderRow: (item: CollectionContentItem) => ReactNode
}

// Pure list renderer: content reads and search belong to the common orchestration.
export function CollectionContentList({ readOnly, ...props }: Props) {
  return readOnly
    ? <ul className="collection-content-list">{props.items.map(item => <li key={item.collectionItemId}>{props.renderRow(item)}</li>)}</ul>
    : <OwnedContent {...props} />
}

function OwnedContent({ collectionId, items, partialView, fetching, renderRow }: {
  collectionId: string; items: CollectionContentItem[]; partialView: boolean; fetching: boolean; renderRow: (item: CollectionContentItem) => ReactNode
}) {
  const reorder = useCollectionItemReorder({ collectionId, access: 'owned', availability: fetching
    ? { enabled: false, reason: 'Actualisation des cartes…' }
    : partialView ? { enabled: false, reason: 'Effacez la recherche pour réorganiser la collection.' } : { enabled: true } })
  const byId = new Map(items.map(item => [item.collectionItemId, item]))
  return <>
    <CollectionItemReorderList collectionId={collectionId}
      items={items.map(item => ({ id: item.collectionItemId, label: item.cardNameFr || 'Nom indisponible' }))}
      availability={reorder.availability} onMove={reorder.move} feedback={reorder.error}
      recovery={<button type="button" className="button" disabled={reorder.isSaving}
        onClick={() => void reorder.refresh()}>Actualiser l’ordre</button>}
      renderItem={item => renderRow(byId.get(item.id)!)} />
  </>
}
