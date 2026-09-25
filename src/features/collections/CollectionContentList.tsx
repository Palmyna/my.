import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCollectionContent } from '../../services/collection-content'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionContentItem } from '../../types/collection-content'
import { PhysicalCopiesDialog } from '../physical-copies/PhysicalCopiesDialog'
import { collectionContentKey } from './collection-query'
import { CollectionContentRow } from './CollectionContentRow'
import { CollectionItemReorderList } from './CollectionItemReorderList'
import { useCollectionItemReorder } from './useCollectionItemReorder'
import './collection-content.css'

// Mounted only after an authorized, available overview. Page keys this boundary
// by viewer + collection, so selection and dialogs cannot survive navigation.
export function CollectionContentList({ collection, viewerId }: { collection: CollectionOverview; viewerId: string }) {
  const content = useQuery({ queryKey: collectionContentKey(viewerId, collection.collectionId),
    queryFn: () => getCollectionContent(collection.collectionId), retry: false })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const items = content.isSuccess ? content.data : []
  const selected = items.find(item => item.collectionItemId === selectedId)
  const readOnly = collection.access !== 'owned'
  const row = (item: CollectionContentItem) => <CollectionContentRow item={item} readOnly={readOnly}
    onCopies={() => setSelectedId(item.collectionItemId)} />

  return <section className="collection-content" aria-label="Contenu de la collection">
    {content.isPending && <p role="status">Chargement des cartes…</p>}
    {content.isError && <div className="collection-page-error">
      <p role="alert">Impossible de charger les cartes. Veuillez réessayer.</p>
      <button className="button" disabled={content.isFetching} onClick={() => void content.refetch()}>Réessayer</button>
    </div>}
    {content.isSuccess && (items.length === 0 ? <p>Cette collection ne contient encore aucune carte.</p>
      : readOnly ? <ul className="collection-content-list">{items.map(item => <li key={item.collectionItemId}>{row(item)}</li>)}</ul>
        : <OwnedContent collectionId={collection.collectionId} items={items} fetching={content.isFetching} renderRow={row} />)}
    {selected && <PhysicalCopiesDialog ownerId={collection.ownerId} variantId={selected.variantId}
      readOnly={readOnly} variantName={[selected.cardNameFr || 'Nom indisponible', selected.variantLabel].filter(Boolean).join(' · ')}
      onClose={() => setSelectedId(null)} />}
  </section>
}

function OwnedContent({ collectionId, items, fetching, renderRow }: {
  collectionId: string; items: CollectionContentItem[]; fetching: boolean; renderRow: (item: CollectionContentItem) => ReactNode
}) {
  const reorder = useCollectionItemReorder({ collectionId, access: 'owned', availability: fetching
    ? { enabled: false, reason: 'Actualisation des cartes…' } : { enabled: true } })
  const byId = new Map(items.map(item => [item.collectionItemId, item]))
  return <>
    <CollectionItemReorderList collectionId={collectionId}
      items={items.map(item => ({ id: item.collectionItemId, label: item.cardNameFr || 'Nom indisponible' }))}
      availability={reorder.availability} onMove={reorder.move} feedback={reorder.error}
      renderItem={item => renderRow(byId.get(item.id)!)} />
    {reorder.error && <button type="button" className="button" disabled={reorder.isSaving}
      onClick={() => void reorder.refresh()}>Actualiser l’ordre</button>}
  </>
}
