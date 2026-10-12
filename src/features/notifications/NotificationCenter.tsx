import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { NotificationPanel } from './NotificationPanel'
import { NotificationContentDialog } from './NotificationContentDialog'
import type { AnnouncementNotification, ChangelogNotification } from '../../types/notifications'
import { useNotificationUnreadCount } from './useNotificationCenter'
import './notifications.css'

type OpenCollection = (collectionId: string, opener: HTMLElement | null) => void
export function NotificationCenter({ onCollectionUpdate }: { onCollectionUpdate?: OpenCollection | undefined }) {
  const { user, isAuthorized } = useAuth()
  const viewerId = isAuthorized ? user?.id : undefined
  const client = useQueryClient()
  const previousViewer = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (previousViewer.current && previousViewer.current !== viewerId) {
      const oldViewer = previousViewer.current
      const filter = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'notifications' && query.queryKey[2] === oldViewer }
      // cancelQueries synchronously cancels the retryers before removal. Do not
      // defer removal across a rapid A -> B -> A authorization transition.
      void client.cancelQueries(filter)
      client.removeQueries(filter)
    }
    previousViewer.current = viewerId
  }, [client, viewerId])
  // AuthProvider also cancels/purges the whole cache when the shell unmounts
  // on logout. Gate rendering before effects; never show previous-viewer data.
  return viewerId ? <ViewerNotifications key={viewerId} viewerId={viewerId} onCollectionUpdate={onCollectionUpdate} /> : null
}

function ViewerNotifications({ viewerId, onCollectionUpdate }: { viewerId: string; onCollectionUpdate?: OpenCollection | undefined }) {
  const { count, refresh } = useNotificationUnreadCount(viewerId)
  const location = useLocation()
  return <NotificationSurface key={location.key} viewerId={viewerId}
    unreadCount={count.data?.unreadCount} unavailable={count.isError} loading={count.isFetching || count.isPending}
    refreshCount={() => { void refresh(true) }} onCollectionUpdate={onCollectionUpdate} />
}

function NotificationSurface({ viewerId, unreadCount, unavailable, loading, refreshCount, onCollectionUpdate }: {
  viewerId: string; unreadCount: string | undefined; unavailable: boolean; loading: boolean; refreshCount: () => void
  onCollectionUpdate?: OpenCollection | undefined
}) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<{ item: AnnouncementNotification | ChangelogNotification; opener: HTMLElement } | null>(null)
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!open || detail) return
    function closeOutside(event: Event) {
      if (!(event.target instanceof Node) || container.current?.contains(event.target)) return
      setOpen(false)
      // Preserve the destination of outside keyboard/pointer navigation.
      if (event.type === 'pointerdown' && container.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true })
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [open, detail])
  const label = unavailable ? 'Notifications — compteur indisponible'
    : unreadCount === undefined ? 'Notifications — chargement du compteur'
      : `Notifications — ${unreadCount} non ${unreadCount === '1' ? 'lue' : 'lues'}`
  // Contract returns canonical decimal strings. Length comparison stays exact
  // even for BIGINT values beyond Number.MAX_SAFE_INTEGER.
  const badge = unreadCount && unreadCount !== '0' ? unreadCount.length > 2 ? '99+' : unreadCount : null
  return <div className="notification-center" ref={container}>
    <button className="button secondary notification-trigger" ref={trigger} type="button" aria-label={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        trigger.current?.focus({ preventScroll: true })
        setOpen(!open)
        if (!open) refreshCount()
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {unavailable ? <span className="notification-availability" aria-hidden="true">!</span>
        : badge && <span className="notification-badge" aria-hidden="true">{badge}</span>}
    </button>
    {open && <NotificationPanel viewerId={viewerId} id={id} onClose={close} refreshCount={refreshCount}
      countUnavailable={unavailable} countLoading={loading && !unavailable}
      onReadContent={(item, opener) => setDetail({ item, opener })}
      onCollectionUpdate={collectionId => { close(); onCollectionUpdate?.(collectionId, trigger.current) }} />}
    {detail && <NotificationContentDialog viewerId={viewerId} item={detail.item} opener={detail.opener} onClose={() => {
      const opener = detail.opener
      setDetail(null)
      queueMicrotask(() => {
        if (opener.isConnected) opener.focus({ preventScroll: true })
        else if (container.current?.isConnected) (container.current.querySelector<HTMLElement>('.notification-panel h2') ?? trigger.current)?.focus({ preventScroll: true })
      })
    }} />}
  </div>
}
