import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCollectionContent } from '../../services/collection-content'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionView } from '../../types/view-preferences'
import { CollectionContentRenderer } from './CollectionContentRenderer'
import { CollectionViewSelector } from './CollectionViewSelector'
import type { CollectionContentItem } from '../../types/collection-content'
import { PhysicalCopiesDialog } from '../physical-copies/PhysicalCopiesDialog'
import { VariantDetailPanel } from '../variant-detail/VariantDetailPanel'
import { collectionContentKey } from './collection-query'
import { CollectionContentRow } from './CollectionContentRow'
import { AddCollectionItemDialog } from './AddCollectionItemDialog'
import { CollectionItemDialog } from './CollectionItemDialog'
import { manualItemErrorMessage, useManualCollectionItems } from './useManualCollectionItems'
import { filterCollectionContent } from './filter-collection-content'
import './collection-content.css'
import { useFooterAwareFab } from '../../lib/useFooterAwareFab'
import { useBinderFormat } from './useBinderFormat'
import { useBinderNavigation } from './useBinderNavigation'
import { BinderOccurrences, BinderToolbar } from './BinderToolbar'
import { CollectionContentBinder } from './CollectionContentBinder'

// Mounted only after an authorized, available overview. Page keys this boundary
// by viewer + collection, so selection and dialogs cannot survive navigation.
export function CollectionContentView({ collection, viewerId, currentView, setCurrentView, query, setQuery }: {
  collection: CollectionOverview; viewerId: string; currentView: CollectionView
  query: string; setQuery: (query: string) => void
  setCurrentView: (view: CollectionView) => Promise<boolean>
}) {
  const content = useQuery({ queryKey: collectionContentKey(viewerId, collection.collectionId),
    queryFn: () => getCollectionContent(collection.collectionId), retry: false })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ variantId: string; opener: HTMLElement } | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const addTrigger = useRef<HTMLButtonElement>(null)
  useFooterAwareFab(addTrigger)
  const [addSuccess, setAddSuccess] = useState(false)
  useEffect(() => {
    if (!addSuccess) return
    const timer = window.setTimeout(() => setAddSuccess(false), 2000)
    return () => window.clearTimeout(timer)
  }, [addSuccess])
  const focusAfterWrite = useRef(false)
  const [action, setAction] = useState<{ type: 'add'; opener: HTMLElement } | { type: 'remove'; item: CollectionContentItem; opener: HTMLElement } | null>(null)
  const [notice, setNotice] = useState('')
  const manual = useManualCollectionItems(viewerId, collection.collectionId, request => {
    setAction(null)
    setNotice(request.type === 'add' ? 'Carte ajoutée.' : 'Carte retirée. Vos exemplaires sont conservés.')
    setAddSuccess(request.type === 'add')
    // A removed row cannot remain the focus target after the authoritative refetch.
    focusAfterWrite.current = true
  })
  useEffect(() => {
    if (!manual.busy && focusAfterWrite.current) { focusAfterWrite.current = false; addTrigger.current?.focus({ preventScroll: true }) }
  }, [manual.busy, notice])
  const items = content.isSuccess ? content.data : []
  const visibleItems = filterCollectionContent(items, query)
  const partialView = visibleItems.length < items.length
  const selected = items.find(item => item.collectionItemId === selectedId)
  const readOnly = collection.access !== 'owned'
  const view = currentView
  const binder = view === 'binder'
  const binderPreferences = useBinderFormat(viewerId, collection.collectionId, binder, () => setQuery(''))
  const binderNavigation = useBinderNavigation(items, visibleItems, binderPreferences.format, query, binder && binderPreferences.ready && content.isSuccess)
  const row = (item: CollectionContentItem) => <CollectionContentRow item={item} readOnly={readOnly}
    view={view === 'cards' ? 'cards' : 'list'}
    busy={manual.busy}
    onDetail={opener => setDetail({ variantId: item.variantId, opener })}
    onCopies={() => setSelectedId(item.collectionItemId)} onRemove={opener => {
      manual.reset(); setNotice(''); setAddSuccess(false); setAction({ type: 'remove', item, opener })
    }} />

  return <section className="collection-content" aria-label="Contenu de la collection">
    <div className="collection-content-toolbar">
      <div className="collection-content-search">
        <input ref={searchInput} type="search" aria-label="Rechercher dans la collection…"
          placeholder="Rechercher dans la collection…" autoComplete="off" value={query}
          onChange={event => setQuery(event.target.value)} />
        {query !== '' && <button type="button" className="collection-search-clear" aria-label="Effacer la recherche"
          onClick={() => { setQuery(''); searchInput.current?.focus() }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>}
      </div>
      {binder && binderPreferences.ready && items.length > 0 && <BinderOccurrences navigation={binderNavigation} />}
      <div className="collection-view-controls">
        <CollectionViewSelector currentView={view} onChange={setCurrentView} />
        {binder && <BinderToolbar preferences={binderPreferences} navigation={binderNavigation} />}
      </div>
    </div>
    {!readOnly && <button ref={addTrigger} type="button" className="button context-fab collection-fab" aria-disabled={manual.busy}
      aria-label="Ajouter une carte" aria-haspopup="dialog" data-state={addSuccess ? 'success' : 'idle'}
      onClick={event => { if (!manual.busy) { manual.reset(); setNotice(''); setAddSuccess(false); setAction({ type: 'add', opener: event.currentTarget }) } }}>
      <span aria-hidden="true">{addSuccess ? '✓' : '+'}</span>
    </button>}
    <p className="visually-hidden" role="status" aria-live="polite">{notice}</p>
    {content.isPending && <p role="status">Chargement des cartes…</p>}
    {content.isError && <div className="collection-page-error">
      <p role="alert">Impossible de charger les cartes. Veuillez réessayer.</p>
      <button className="button" disabled={content.isFetching} onClick={() => void content.refetch()}>Réessayer</button>
    </div>}
    {content.isSuccess && (items.length === 0 ? <p>Cette collection ne contient encore aucune carte.</p>
      : <>
        {binder ? binderPreferences.ready
          ? <CollectionContentBinder navigation={binderNavigation} format={binderPreferences.format}
            onDetail={(item, opener) => setDetail({ variantId: item.variantId, opener })} />
          : !binderPreferences.error && <p role="status">Chargement du format…</p>
          : <>
            {visibleItems.length === 0 && <p role="status">Aucune carte ne correspond à cette recherche.</p>}
            <CollectionContentRenderer collectionId={collection.collectionId} items={visibleItems} view={view}
              readOnly={readOnly} partialView={partialView} fetching={content.isFetching} renderRow={row} />
          </>}
      </>)}
    {detail && <VariantDetailPanel variantId={detail.variantId} ownerId={collection.ownerId} readOnly={readOnly}
      opener={detail.opener} onClose={() => setDetail(null)} />}
    {selected && <PhysicalCopiesDialog ownerId={collection.ownerId} variantId={selected.variantId}
      readOnly={readOnly} variantName={[selected.cardNameFr || 'Nom indisponible', selected.variantLabel].filter(Boolean).join(' · ')}
      onClose={() => setSelectedId(null)} />}
    {!readOnly && action?.type === 'add' && <AddCollectionItemDialog viewerId={viewerId} opener={action.opener}
      busy={manual.pending} error={manualItemErrorMessage(manual.error)} onReset={manual.reset} onClose={() => setAction(null)}
      onAdd={(variantId, placement) => manual.submit({ type: 'add', variantId, placement })} />}
    {!readOnly && action?.type === 'remove' && <CollectionItemDialog title="Retirer cette carte de la collection ?"
      description="Cette carte sera retirée de la collection. Vos exemplaires seront conservés."
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
