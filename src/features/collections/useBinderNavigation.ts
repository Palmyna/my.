import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'
import type { BinderFormat } from '../../types/view-preferences'
import { adjacentBinderPage, adjacentOccurrence, binderOccurrencePage, binderOpening, binderPages } from './binder-pagination'
import { collectionSearchKey } from './filter-collection-content'

const wideQuery = '(min-width: 960px)'
function subscribeWide(listener: () => void) {
  if (!window.matchMedia) return () => {}
  const media = window.matchMedia(wideQuery)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
function isWide() { return window.matchMedia?.(wideQuery).matches ?? false }

type State = { format: BinderFormat; consultationKey: string; searchKey: string; page: number; occurrenceId: string | null;
  halo: { id: string; serial: number } | null; serial: number; direction: -1 | 1 }

export function useBinderNavigation(items: CollectionContentItem[], matches: CollectionContentItem[], format: BinderFormat, query: string, active: boolean, consultationKey = '') {
  const spread = useSyncExternalStore(subscribeWide, isWide, () => false)
  const pages = useMemo(() => binderPages(items, format), [items, format])
  const searchKey = collectionSearchKey(query)
  const matchingIds = new Set(matches.map(item => item.collectionItemId))
  const [state, setState] = useState<State>({ format, consultationKey, searchKey: '', page: 1, occurrenceId: null,
    halo: null, serial: 0, direction: 1 })
  // Guarded render adjustment: no effect recentering after free navigation.
  // Keep the exact requested page internally so a resize to mobile keeps it.
  if (state.format !== format) {
    setState({ ...state, format, page: 1, occurrenceId: null, halo: null })
  } else if (state.consultationKey !== consultationKey) {
    const match = searchKey ? matches.find(item => item.collectionItemId === state.occurrenceId) ?? matches[0] : undefined
    const serial = state.serial + 1
    setState({ ...state, consultationKey, searchKey, serial, occurrenceId: match?.collectionItemId ?? null,
      halo: match ? { id: match.collectionItemId, serial } : null,
      page: match ? binderOccurrencePage(items.indexOf(match), format) : Math.max(1, Math.min(state.page, pages.length || 1)) })
  } else if (state.page > (pages.length || 1)) {
    setState({ ...state, page: pages.length || 1 })
  } else if (active && state.searchKey !== searchKey) {
    const first = searchKey ? matches[0] : undefined
    const serial = state.serial + 1
    setState({ ...state, searchKey, serial, occurrenceId: first?.collectionItemId ?? null,
      halo: first ? { id: first.collectionItemId, serial } : null,
      page: first ? binderOccurrencePage(items.indexOf(first), format) : state.page })
  } else if (active && searchKey && (state.occurrenceId ? !matchingIds.has(state.occurrenceId) : matches.length > 0)) {
    // An authoritative refresh can remove the current occurrence. Keep free
    // navigation intact while making the occurrence controls usable again.
    setState({ ...state, occurrenceId: matches[0]?.collectionItemId ?? null, halo: null })
  }
  const page = Math.max(1, Math.min(state.page, pages.length || 1))
  const opening = binderOpening(page, pages.length, spread)
  const currentPage = opening[0] ?? 0
  const occurrence = searchKey && state.occurrenceId ? matches.findIndex(item => item.collectionItemId === state.occurrenceId) : -1
  useEffect(() => {
    if (!state.halo) return
    const timer = window.setTimeout(() => setState(previous => previous.halo?.serial === state.halo?.serial
      ? { ...previous, halo: null } : previous), 1400)
    return () => window.clearTimeout(timer)
  }, [state.halo])
  function goTo(target: number) {
    setState(previous => ({ ...previous, page: target, direction: target < page ? -1 : 1 }))
  }
  function move(direction: -1 | 1) {
    const target = adjacentBinderPage(page, pages.length, spread, direction)
    if (target !== null) goTo(target)
  }
  function moveOccurrence(direction: -1 | 1) {
    const next = adjacentOccurrence(occurrence, matches.length, direction)
    if (next === null) return
    const item = matches[next]!
    const target = binderOccurrencePage(items.indexOf(item), format)
    setState(previous => ({ ...previous, page: target, occurrenceId: item.collectionItemId, serial: previous.serial + 1,
      halo: { id: item.collectionItemId, serial: previous.serial + 1 }, direction: target < page ? -1 : 1 }))
  }
  return { pages, spread, opening, currentPage, goTo, move, direction: state.direction,
    canPrevious: adjacentBinderPage(page, pages.length, spread, -1) !== null,
    canNext: adjacentBinderPage(page, pages.length, spread, 1) !== null,
    searching: !!searchKey, matchingIds, occurrence, occurrenceCount: searchKey ? matches.length : 0,
    moveOccurrence, haloId: active && searchKey ? state.halo?.id ?? null : null }
}

export type BinderNavigation = ReturnType<typeof useBinderNavigation>
