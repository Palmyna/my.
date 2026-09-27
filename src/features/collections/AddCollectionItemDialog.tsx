import { useEffect, useId, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { CatalogSearchError, searchCatalogVariantsForAdd } from '../../services/catalog-search'
import type { CatalogVariantForAdd } from '../../types/catalog-search'
import type { ManualItemPlacement } from '../../types/collection-items'
import { CardImage } from './CardImage'
import { CollectionItemDialog } from './CollectionItemDialog'

export function VariantSummary({ variant }: { variant: CatalogVariantForAdd }) {
  const name = variant.cardNameFr || 'Nom indisponible'
  return <>
    <CardImage key={variant.imageUrl} url={variant.imageUrl} name={name} />
    <span className="collection-content-info">
      <span className="collection-content-name">{name}</span>
      <span className="collection-content-meta">{[variant.setNameFr, variant.localId].filter(Boolean).join(' · ')}</span>
      {variant.variantLabel && <span className="collection-content-variant">{variant.variantLabel}</span>}
    </span>
  </>
}

export function AddCollectionItemDialog({ viewerId, opener, busy, error, onClose, onReset, onAdd }: {
  viewerId: string; opener: HTMLElement | null; busy: boolean; error: string | null; onClose: () => void
  onReset: () => void; onAdd: (variantId: string, placement: ManualItemPlacement) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const confirmation = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogVariantForAdd | null>(null)
  const [placement, setPlacement] = useState<ManualItemPlacement>('end')
  useEffect(() => {
    if (selected) confirmation.current?.focus()
    else input.current?.focus()
  }, [selected])
  return <CollectionItemDialog title="Ajouter une carte" description={selected
    ? 'Confirmez la variante et sa position dans la collection.' : 'Recherchez une variante dans le catalogue.'}
    busy={busy} error={error} opener={opener} onClose={onClose}>
    <div hidden={!!selected}>
      <label className="field" htmlFor={`${id}-query`}>Rechercher une carte</label>
      <input ref={input} data-initial-focus id={`${id}-query`} type="search" autoComplete="off" value={query}
        onChange={event => { setQuery(event.target.value); onReset() }} />
      <SearchResults key={query} viewerId={viewerId} query={query} onSelect={variant => {
        setSelected(variant); setPlacement('end'); onReset()
      }} />
    </div>
    {selected && <>
      <div ref={confirmation} tabIndex={-1} className="collection-variant-summary"><VariantSummary variant={selected} /></div>
      <fieldset className="collection-item-placement" disabled={busy}>
        <legend>Position dans la collection</legend>
        {(['end', 'start'] as const).map(value => <label key={value}>
          <input type="radio" name={`${id}-placement`} value={value} checked={placement === value}
            onChange={() => { setPlacement(value); onReset() }} />{value === 'end' ? 'Fin' : 'Début'}
        </label>)}
      </fieldset>
      <button type="button" className="button collection-cancel" disabled={busy}
        onClick={() => { setSelected(null); onReset() }}>Retour aux résultats</button>
    </>}
    <div className="collection-dialog-actions">
      <button className="button collection-cancel" type="button" disabled={busy} onClick={onClose}>Annuler</button>
      {selected && <button className="button" type="button" disabled={busy}
        onClick={() => onAdd(selected.variantId, placement)}>Ajouter à la collection</button>}
    </div>
  </CollectionItemDialog>
}

function SearchResults({ query, viewerId, onSelect }: {
  query: string; viewerId: string; onSelect: (variant: CatalogVariantForAdd) => void
}) {
  // A new keyed search gets a fresh cache identity and offset, including A -> B -> A.
  // Late responses remain attached to their old query, never to the new results.
  const searchId = useId()
  const [ready, setReady] = useState(false)
  const useful = /[\p{L}\p{N}]/u.test(query)
  useEffect(() => {
    if (!useful) return
    const timer = window.setTimeout(() => setReady(true), 300)
    return () => window.clearTimeout(timer)
  }, [useful])
  const search = useInfiniteQuery({
    queryKey: ['catalog-add', viewerId, searchId, query],
    queryFn: ({ pageParam }) => searchCatalogVariantsForAdd(query, { limit: 20, offset: pageParam }),
    initialPageParam: 0, getNextPageParam: (last, _pages, offset) => last.length === 20 ? offset + 20 : undefined,
    enabled: useful && ready, retry: false, gcTime: 0, staleTime: Infinity,
  })
  const results = [...new Map((search.data?.pages.flat() ?? []).map(variant => [variant.variantId, variant])).values()]
  if (!useful) return null
  return <>
    {(!ready || search.isFetching) && <p role="status">Recherche en cours…</p>}
    {search.isError && <div>
      <p role="alert">{search.error instanceof CatalogSearchError && search.error.code === 'not_authorized'
        ? 'Votre session ne permet pas cette recherche. Reconnectez-vous pour réessayer.'
        : search.error instanceof CatalogSearchError && search.error.code === 'invalid_query'
          ? 'Cette recherche n’est pas valide. Modifiez votre saisie.' : 'Impossible de rechercher les cartes. Veuillez réessayer.'}</p>
      <button type="button" className="button" disabled={search.isFetching} onClick={() => {
        if (search.isFetchNextPageError) void search.fetchNextPage()
        else void search.refetch()
      }}>Réessayer la recherche</button>
    </div>}
    {search.isSuccess && results.length === 0 && <p>Aucune variante trouvée.</p>}
    {results.length > 0 && <ul className="collection-search-results">
      {results.map(variant => <li key={variant.variantId}>
        <button type="button" className="collection-search-result" onClick={() => onSelect(variant)}><VariantSummary variant={variant} /></button>
      </li>)}
    </ul>}
    {search.hasNextPage && <button type="button" className="button" disabled={search.isFetching}
      onClick={() => void search.fetchNextPage()}>Afficher plus</button>}
  </>
}
