import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCollectionContentV2 } from '../../services/collection-content'
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
import { useCollectionStructureMutation } from './useCollectionStructureMutation'

// Mounted only after an authorized, available overview. Page keys this boundary
// by viewer + collection, so selection and dialogs cannot survive navigation.
export function CollectionContentView({ collection, viewerId, currentView, setCurrentView, query, setQuery }: {
  collection: CollectionOverview; viewerId: string; currentView: CollectionView
  query: string; setQuery: (query: string) => void
  setCurrentView: (view: CollectionView) => Promise<boolean>
}) {
  const content = useQuery({ queryKey: collectionContentKey(viewerId, collection.collectionId),
    queryFn: () => getCollectionContentV2(collection.collectionId), retry: false })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ variantId: string; opener: HTMLElement } | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const visibilityControl = useRef<HTMLSelectElement>(null)
  const [visibility, setVisibility] = useState<'visible' | 'all'>('visible')
  const hiding = useCollectionStructureMutation(viewerId, collection.collectionId)
  const [hideAction, setHideAction] = useState<{ collectionItemId: string; isHidden: boolean; name: string } | null>(null)
  const hideOpener = useRef<HTMLElement | null>(null)
  const [hideSuccess, setHideSuccess] = useState<string | null>(null)
  useEffect(() => {
    if (!hideSuccess) return
    const timer = window.setTimeout(() => setHideSuccess(null), 2000)
    return () => window.clearTimeout(timer)
  }, [hideSuccess])
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
  const items = content.isSuccess ? content.data.items : []
  const consultationItems = visibility === 'all' ? items : items.filter(item => item.origin === 'manual' || !item.isHidden)
  const visibleItems = filterCollectionContent(consultationItems, query)
  const partialView = visibleItems.length < consultationItems.length
  // A reread can remove the opener even when the writer's response was lost.
  // Restore only abandoned focus; do not steal it from another active control.
  useLayoutEffect(() => {
    if (hideOpener.current && !hideOpener.current.isConnected) {
      if (document.activeElement === document.body) visibilityControl.current?.focus({ preventScroll: true })
      hideOpener.current = null
    }
  }, [content.data, visibility, query, hideAction])
  const selected = items.find(item => item.collectionItemId === selectedId)
  const readOnly = collection.access !== 'owned'
  const view = currentView
  const binder = view === 'binder'
  const binderPreferences = useBinderFormat(viewerId, collection.collectionId, binder, () => setQuery(''))
  const binderNavigation = useBinderNavigation(consultationItems, visibleItems, binderPreferences.format, query, binder && binderPreferences.ready && content.isSuccess, visibility)
  const canHide = !readOnly && collection.collectionType === 'automatic' && content.data?.orderContractVersion === 2
  async function submitHidden(action: NonNullable<typeof hideAction>) {
    setHideSuccess(null); setNotice(''); hiding.reset(); setHideAction(action)
    if (await hiding.submit({ type: 'hide', collectionItemId: action.collectionItemId, isHidden: action.isHidden })) {
      setHideAction(null); setHideSuccess(action.collectionItemId)
      setNotice(action.isHidden ? 'Carte masquée.' : 'Carte réaffichée.')
    }
  }
  const row = (item: CollectionContentItem) => <CollectionContentRow item={item} readOnly={readOnly}
    view={view === 'cards' ? 'cards' : 'list'}
    busy={manual.busy || content.isFetching}
    hidden={'isHidden' in item && item.isHidden === true}
    hiding={hiding.pending && hideAction?.collectionItemId === item.collectionItemId}
    hideSuccess={hideSuccess === item.collectionItemId}
    onHidden={canHide && item.origin === 'automatic' ? opener => {
      if (manual.busy || content.isFetching) return
      hideOpener.current = opener
      void submitHidden({ collectionItemId: item.collectionItemId, isHidden: !('isHidden' in item && item.isHidden === true), name: item.cardNameFr || 'cette carte' })
    } : undefined}
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
        <select ref={visibilityControl} className="collection-visibility-select" aria-label="Afficher les cartes"
          value={visibility} onChange={event => setVisibility(event.target.value === 'all' ? 'all' : 'visible')}>
          <option value="visible">Non masquées</option><option value="all">Toutes</option>
        </select>
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
    {hiding.pending && <p className="visually-hidden" role="status">{hideAction?.isHidden ? 'Masquage en cours…' : 'Réaffichage en cours…'}</p>}
    {hideAction && hiding.error && <div className="collection-page-error">
      <p role="alert">{manualItemErrorMessage(hiding.error)}</p>
      <button type="button" className="button" disabled={manual.busy || content.isFetching}
        onClick={event => { hideOpener.current = event.currentTarget; void submitHidden(hideAction) }}>Vérifier / réessayer {hideAction.isHidden ? 'le masquage' : 'le réaffichage'} de {hideAction.name}</button>
    </div>}
    {content.isPending && <p role="status">Chargement des cartes…</p>}
    {content.isError && <div className="collection-page-error">
      <p role="alert">Impossible de charger les cartes. Veuillez réessayer.</p>
      <button className="button" disabled={content.isFetching} onClick={() => void content.refetch()}>Réessayer</button>
    </div>}
    {content.isSuccess && (items.length === 0 ? <p>Cette collection ne contient encore aucune carte.</p>
      : consultationItems.length === 0 ? <div className="collection-hidden-empty">
        <p role="status">Les cartes de cette collection sont masquées.</p>
        <button type="button" className="button" onClick={() => { setVisibility('all'); visibilityControl.current?.focus({ preventScroll: true }) }}>Afficher toutes les cartes</button>
      </div>
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
