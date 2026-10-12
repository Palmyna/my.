import { useEffect, useRef } from 'react'
import type { NotificationItem } from '../../types/notifications'
import { useNotificationPages } from './useNotificationCenter'

const kinds: Record<NotificationItem['kind'], string> = {
  collection_update: 'Actualisation de collection', changelog: 'Changelog', announcement: 'Annonce',
}
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function NotificationPanel({ viewerId, id, onClose, refreshCount, countUnavailable, countLoading }: {
  viewerId: string; id: string; onClose: () => void; refreshCount: () => void; countUnavailable: boolean; countLoading: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const center = useNotificationPages(viewerId)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
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
          : center.items.length > 0 && <ul className="notification-list" aria-label="Notifications actives">
            {center.items.map(item => <li key={item.notificationKey} className="notification-item" data-state={item.state}>
              <div className="notification-item-meta"><span>{kinds[item.kind]}</span><span>{item.state === 'unread' ? 'Non lue' : 'Lue'}</span></div>
              <h3>{item.title}</h3>
              <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>
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
