import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AnnouncementNotification, ChangelogNotification, NotificationItem, NotificationReadRequest } from '../../types/notifications'
import { useNotificationPages } from './useNotificationCenter'
import { notificationReadMutationOptions } from './notification-query'
import { useNotificationMutationScope } from './useNotificationMutationScope'

const kinds: Record<NotificationItem['kind'], string> = {
  collection_update: 'Actualisation de collection', changelog: 'Changelog', announcement: 'Annonce',
}
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function NotificationPanel({ viewerId, id, onClose, refreshCount, countUnavailable, countLoading, onReadContent, onCollectionUpdate }: {
  viewerId: string; id: string; onClose: () => void; refreshCount: () => void; countUnavailable: boolean; countLoading: boolean
  onReadContent: (item: AnnouncementNotification | ChangelogNotification, opener: HTMLElement) => void
  onCollectionUpdate: (collectionId: string) => void
}) {
  const client = useQueryClient()
  const requireViewer = useNotificationMutationScope(viewerId)
  const options = notificationReadMutationOptions(client, viewerId)
  const readMutation = useMutation({ ...options, mutationFn: (request, context) => { requireViewer(); return options.mutationFn!(request, context) } })
  const running = useRef(false), active = useRef(false)
  const readFocus = useRef<{ key: string; opener: HTMLElement } | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const [failedRead, setFailedRead] = useState<NotificationReadRequest | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const center = useNotificationPages(viewerId)
  useEffect(() => { active.current = true; heading.current?.focus({ preventScroll: true }); return () => { active.current = false } }, [])
  useEffect(() => {
    const focus = readFocus.current
    if (!focus || focus.opener.isConnected) return
    readFocus.current = null
    if (document.activeElement !== document.body) return
    const row = Array.from(list.current?.children ?? []).find(node => (node as HTMLElement).dataset.notificationKey === focus.key)
    const destination = row?.querySelector<HTMLButtonElement>('button') ?? heading.current
    destination?.focus({ preventScroll: true })
  }, [center.items])
  async function markRead(request: NotificationReadRequest, opener: HTMLElement) {
    if (running.current) return
    readFocus.current = { key: request.notificationKey, opener }
    running.current = true; setFailedRead(null)
    try { await readMutation.mutateAsync(request) }
    catch { if (active.current) setFailedRead(request) }
    finally { running.current = false }
  }
  const refresh = () => { refreshCount(); void center.refresh() }
  return <section className="notification-panel" id={id} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
    <div className="notification-panel-heading">
      <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>Notifications</h2>
      <button className="button secondary notification-close" type="button" aria-label="Fermer les notifications" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <div className="notification-panel-content">
      <div className="notification-toolbar">
        <button className="button secondary" type="button" disabled={!!center.loading || countLoading} onClick={refresh}>Actualiser</button>
        {countUnavailable && <p role="status">Compteur indisponible.</p>}
      </div>
      {failedRead && <div className="notification-state">
        <p role="alert">La lecture n’a pas pu être confirmée.</p>
        <button className="button secondary" type="button" disabled={readMutation.isPending}
          onClick={event => void markRead(failedRead, event.currentTarget)}>Réessayer le marquage</button>
      </div>}
      {center.loading === 'first' && <p className="notification-state" role="status">
        {center.pages.length ? 'Actualisation des notifications…' : 'Chargement des notifications…'}
      </p>}
      {center.error && <div className="notification-state">
        <p role="alert">{center.error === 'more' ? 'Impossible de charger la suite.' : 'Impossible de charger les notifications.'}</p>
        <button className="button secondary" type="button" onClick={() => {
          refreshCount(); void (center.error === 'more' ? center.loadMore() : center.refresh())
        }}>Réessayer</button>
      </div>}
      {center.pages.length > 0 && <>
        {center.items.length === 0 && !center.error && !center.loading
          ? <p className="notification-state" role="status">Aucune notification.</p>
          : center.items.length > 0 && <ul ref={list} className="notification-list" aria-label="Notifications actives">
            {center.items.map(item => <li key={item.notificationKey} className="notification-item" data-state={item.state} data-notification-key={item.notificationKey}>
              <div className="notification-item-meta"><span>{kinds[item.kind]}</span><span>{item.state === 'unread' ? 'Non lue' : 'Lue'}</span></div>
              <h3>{item.title}</h3>
              <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>
              <div className="notification-item-actions">
                <button className="button secondary" type="button" disabled={readMutation.isPending} onClick={event => {
                  if (running.current) return
                  if (item.kind === 'collection_update') onCollectionUpdate(item.action.collectionId)
                  else onReadContent(item, event.currentTarget)
                }}>{item.kind === 'collection_update' ? 'Voir la mise à jour' : 'Lire'}</button>
                {item.state === 'unread' && <button className="button secondary" type="button" disabled={readMutation.isPending}
                  onClick={event => void markRead({ notificationKey: item.notificationKey, observedRevision: item.revision }, event.currentTarget)}>Marquer comme lue</button>}
              </div>
            </li>)}
          </ul>}
        {center.nextCursor ? <div className="notification-pagination">
          <button className="button secondary" type="button" disabled={!!center.loading} onClick={() => void center.loadMore()}>Afficher la suite</button>
          {center.loading === 'more' && <p role="status">Chargement de la suite…</p>}
        </div> : center.items.length > 0 && !center.loading && !center.error && <p className="notification-state" role="status">Toutes les notifications sont affichées.</p>}
      </>}
      {countUnavailable && <button className="button secondary notification-count-retry" type="button" disabled={countLoading} onClick={refreshCount}>Réessayer le compteur</button>}
    </div>
  </section>
}
