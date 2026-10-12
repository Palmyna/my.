import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationCenter, NotificationCursor, NotificationItem } from '../../types/notifications'
import { notificationCenterKey, notificationCenterOptions, notificationUnreadCountOptions } from './notification-query'

// Repeated mounts and focus/visibility bursts share the same recent read.
// Opening or explicitly refreshing the panel always requests a fresh snapshot.
const freshness = 30_000
export function useNotificationUnreadCount(viewerId: string) {
  const client = useQueryClient()
  const count = useQuery({ ...notificationUnreadCountOptions(viewerId), notifyOnChangeProps: 'all' })
  const refresh = useCallback((fresh = false) => client.fetchQuery({
    ...notificationUnreadCountOptions(viewerId), staleTime: fresh ? 0 : freshness,
  }).catch(() => undefined), [client, viewerId])
  useEffect(() => {
    void refresh()
    function onFocus() { if (document.visibilityState !== 'hidden') void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])
  return { count, refresh }
}

type Read = 'first' | 'more'
type Pages = { pages: NotificationCenter[]; loading: Read | null; error: Read | null }
export function useNotificationPages(viewerId: string) {
  const client = useQueryClient()
  const [state, setState] = useState<Pages>({ pages: [], loading: 'first', error: null })
  const active = useRef(false)
  const running = useRef(false)
  const read = useCallback(async (cursor: NotificationCursor | null = null) => {
    if (!active.current || running.current) return
    running.current = true
    const kind: Read = cursor ? 'more' : 'first'
    setState(previous => ({ ...previous, loading: kind, error: null }))
    try {
      const page = await client.fetchQuery({ ...notificationCenterOptions(viewerId, { limit: 20, cursor }), staleTime: 0 })
      if (active.current) setState(previous => ({ pages: cursor ? [...previous.pages, page] : [page], loading: null, error: null }))
    } catch {
      if (active.current) setState(previous => ({ ...previous, loading: null, error: kind }))
    } finally { running.current = false }
  }, [client, viewerId])
  useEffect(() => {
    active.current = true
    // Initial loading is already rendered. Start after effect setup, so the
    // StrictMode setup/cleanup/setup cycle also shares one first-page read.
    queueMicrotask(() => { void read() })
    function onFocus() {
      const head = client.getQueryState(notificationCenterKey(viewerId))
      if (document.visibilityState !== 'hidden' && (!head || head.isInvalidated || Date.now() - head.dataUpdatedAt >= freshness)) void read()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active.current = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [client, viewerId, read])
  // First occurrence wins: a later page cannot replace a newer head item.
  // No client sort; retain backend order, including across page boundaries.
  const unique = new Map<string, NotificationItem>()
  for (const page of state.pages) for (const item of page.items) {
    if (!unique.has(item.notificationKey)) unique.set(item.notificationKey, item)
  }
  const items = [...unique.values()]
  // A failed head refresh leaves the old list visible with an error, but its
  // continuation is no longer valid. Only a successful head can paginate.
  const nextCursor = state.loading === 'first' || state.error === 'first' ? null : state.pages.at(-1)?.nextCursor ?? null
  return { ...state, items, nextCursor, refresh: () => read(), loadMore: () => nextCursor ? read(nextCursor) : Promise.resolve() }
}
