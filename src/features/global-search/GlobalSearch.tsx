import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GlobalSearchError, searchGlobalNavigation } from '../../services/global-search'
import { GlobalSearchSuggestion } from './GlobalSearchSuggestion'
import './global-search.css'

export function GlobalSearch({ viewerId }: { viewerId: string }) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const valid = [...query].length >= 3
  const expanded = open && valid

  useEffect(() => {
    if (!expanded) return
    function closeOutside(event: Event) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      input.current?.focus()
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [expanded])

  return <div ref={container} className="header-search" role="search" aria-label="Recherche MY.">
    <label className="visually-hidden" htmlFor={id}>Rechercher sur MY.</label>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    <input ref={input} id={id} type="search" placeholder="Rechercher une carte, une extension…"
      autoComplete="off" spellCheck={false} enterKeyHint="done" value={query}
      aria-controls={expanded ? `${id}-results` : undefined}
      onFocus={() => setOpen(true)}
      onChange={event => { setQuery([...event.target.value].slice(0, 200).join('')); setOpen(true) }}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
        event.preventDefault()
        // Native blur dismisses virtual keyboards, without a device-specific
        // branch or a focus move outside the search. Suggestions remain available.
        event.currentTarget.blur()
      }} />
    {valid && <SearchResults key={query} id={`${id}-results`} query={query} viewerId={viewerId} open={expanded}
      onNavigate={() => { setOpen(false); setQuery('') }} />}
  </div>
}

function SearchResults({ id, query, viewerId, open, onNavigate }: {
  id: string; query: string; viewerId: string; open: boolean; onNavigate: () => void
}) {
  // Each input lifetime has its own identity, also for A -> B -> A. Late
  // responses stay in their original query; no previous-data placeholder.
  const searchId = useId()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 300)
    return () => window.clearTimeout(timer)
  }, [])
  const search = useQuery({ queryKey: ['global-search', viewerId, searchId, query],
    queryFn: () => searchGlobalNavigation(query), enabled: ready && open && !!viewerId,
    retry: false, gcTime: 0, staleTime: 30_000, refetchOnWindowFocus: false,
  })
  if (!open) return null
  const loading = !ready || search.isPending || search.isFetching
  return <div className="global-search-popup" id={id}>
    {loading ? <p className="global-search-state" role="status">Recherche en cours…</p>
      : search.isError ? <p className="global-search-state" role="alert">
        {search.error instanceof GlobalSearchError && search.error.code === 'not_authorized'
          ? 'Impossible d’effectuer cette recherche. Reconnectez-vous puis réessayez.'
          : search.error instanceof GlobalSearchError && search.error.code === 'invalid_query'
            ? 'Cette recherche n’est pas valide. Modifiez votre saisie.'
            : 'Impossible d’effectuer cette recherche. Veuillez réessayer.'}
      </p>
        : search.data?.length === 0 ? <p className="global-search-state" role="status">Aucun résultat pour « {query} »</p>
          : <ul aria-label="Suggestions de recherche">
            {search.data?.map((suggestion, index) => <li key={index}>
              <GlobalSearchSuggestion suggestion={suggestion} onNavigate={onNavigate} />
            </li>)}
          </ul>}
  </div>
}
