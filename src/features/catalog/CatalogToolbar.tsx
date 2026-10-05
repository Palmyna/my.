import { useRef } from 'react'
import { CATALOG_VIEWS, type CatalogView } from '../../types/view-preferences'

export function CatalogToolbar({ search, heading, view, onView }: {
  search?: { name: string; query: string; onSearch: (query: string) => void }; heading?: string
  view: CatalogView; onView: (view: CatalogView) => Promise<boolean>
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="catalog-toolbar">
    {heading && <h2>{heading}</h2>}
    {search && <div className="catalog-search">
      <input ref={input} type="search" aria-label={`Rechercher dans ${search.name}…`}
        placeholder={`Rechercher dans ${search.name}…`} autoComplete="off" value={search.query}
        onChange={event => search.onSearch(event.target.value)} />
      {search.query !== '' && <button type="button" aria-label="Effacer la recherche" onClick={() => {
        search.onSearch(''); input.current?.focus()
      }}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m5 5 10 10M15 5 5 15" /></svg></button>}
    </div>}
    <div className="catalog-view-selector" role="group" aria-label="Vue du catalogue">
      {CATALOG_VIEWS.map(value => <button key={value} type="button" aria-pressed={view === value}
        onClick={() => { if (view !== value) void onView(value) }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          {value === 'list' ? <path d="M3 5h2m3 0h9M3 10h2m3 0h9M3 15h2m3 0h9" />
            : <><rect x="3" y="3" width="5" height="6" rx="1" /><rect x="12" y="3" width="5" height="6" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></>}
        </svg>{value === 'list' ? 'Liste' : 'Cartes'}
      </button>)}
    </div>
  </div>
}
