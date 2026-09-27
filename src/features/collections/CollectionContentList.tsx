import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCollectionContent } from '../../services/collection-content'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionContentItem } from '../../types/collection-content'
import { PhysicalCopiesDialog } from '../physical-copies/PhysicalCopiesDialog'
import { collectionContentKey } from './collection-query'
import { CollectionContentRow } from './CollectionContentRow'
import { CollectionItemReorderList } from './CollectionItemReorderList'
import { useCollectionItemReorder } from './useCollectionItemReorder'
import { AddCollectionItemDialog } from './AddCollectionItemDialog'
import { CollectionItemDialog } from './CollectionItemDialog'
import { manualItemErrorMessage, useManualCollectionItems } from './useManualCollectionItems'
import './collection-content.css'

// Mounted only after an authorized, available overview. Page keys this boundary
// by viewer + collection, so selection and dialogs cannot survive navigation.
export function CollectionContentList({ collection, viewerId }: { collection: CollectionOverview; viewerId: string }) {
  const content = useQuery({ queryKey: collectionContentKey(viewerId, collection.collectionId),
    queryFn: () => getCollectionContent(collection.collectionId), retry: false })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const addTrigger = useRef<HTMLButtonElement>(null)
  const focusAfterWrite = useRef(false)
  const [action, setAction] = useState<{ type: 'add'; opener: HTMLElement } | { type: 'remove'; item: CollectionContentItem; opener: HTMLElement } | null>(null)
  const [notice, setNotice] = useState('')
  const manual = useManualCollectionItems(viewerId, collection.collectionId, request => {
    setAction(null)
    setNotice(request.type === 'add' ? 'Carte ajoutée à la collection.' : 'Carte retirée de la collection. Vos exemplaires physiques sont conservés.')
    // A removed row cannot remain the focus target after the authoritative refetch.
    focusAfterWrite.current = true
  })
  useEffect(() => {
    if (!manual.busy && focusAfterWrite.current) { focusAfterWrite.current = false; addTrigger.current?.focus() }
  }, [manual.busy, notice])
  const items = content.isSuccess ? content.data : []
  const selected = items.find(item => item.collectionItemId === selectedId)
  const readOnly = collection.access !== 'owned'
  const row = (item: CollectionContentItem) => <CollectionContentRow item={item} readOnly={readOnly}
    automatic={collection.collectionType === 'automatic'} busy={manual.busy}
    onCopies={() => setSelectedId(item.collectionItemId)} onRemove={opener => {
      manual.reset(); setNotice(''); setAction({ type: 'remove', item, opener })
    }} />

  return <section className="collection-content" aria-label="Contenu de la collection">
    {!readOnly && <button ref={addTrigger} type="button" className="button collection-add-trigger" aria-disabled={manual.busy}
      onClick={event => { if (!manual.busy) { manual.reset(); setNotice(''); setAction({ type: 'add', opener: event.currentTarget }) } }}>Ajouter une carte</button>}
    {notice && <p role="status">{notice}</p>}
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
    {!readOnly && action?.type === 'add' && <AddCollectionItemDialog viewerId={viewerId} opener={action.opener}
      busy={manual.pending} error={manualItemErrorMessage(manual.error)} onReset={manual.reset} onClose={() => setAction(null)}
      onAdd={(variantId, placement) => manual.submit({ type: 'add', variantId, placement })} />}
    {!readOnly && action?.type === 'remove' && <CollectionItemDialog title="Retirer cette carte de la collection ?"
      description="La variante sera retirée de cette collection. Vos exemplaires physiques seront conservés."
      busy={manual.pending} error={manualItemErrorMessage(manual.error)} opener={action.opener} onClose={() => setAction(null)}>
      <p>{[action.item.cardNameFr || 'Nom indisponible', action.item.setNameFr, action.item.localId, action.item.variantLabel].filter(Boolean).join(' · ')}</p>
      <div className="collection-dialog-actions">
        <button data-initial-focus type="button" className="button collection-cancel" disabled={manual.pending} onClick={() => setAction(null)}>Annuler</button>
        <button type="button" className="button collection-danger-action" disabled={manual.pending}
          onClick={() => manual.submit({ type: 'remove', collectionItemId: action.item.collectionItemId })}>Retirer</button>
      </div>
    </CollectionItemDialog>}
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
