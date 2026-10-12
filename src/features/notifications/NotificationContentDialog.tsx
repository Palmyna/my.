import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AnnouncementNotification, ChangelogNotification, NotificationContent } from '../../types/notifications'
import { CollectionItemDialog } from '../collections/CollectionItemDialog'
import { announcementProcessMutationOptions, invalidateNotificationQueries, notificationContentKey, notificationContentOptions } from './notification-query'
import { useNotificationMutationScope } from './useNotificationMutationScope'

type ContentState = { status: 'loading' | 'error' | 'unavailable' } | { status: 'ready'; content: NotificationContent }
export function NotificationContentDialog({ viewerId, item, opener, onClose }: {
  viewerId: string; item: AnnouncementNotification | ChangelogNotification; opener: HTMLElement; onClose: () => void
}) {
  const client = useQueryClient()
  const [state, setState] = useState<ContentState>({ status: 'loading' })
  const active = useRef(false), sequence = useRef(0)
  const read = useCallback(async () => {
    const ticket = ++sequence.current
    setState({ status: 'loading' })
    try {
      const content = await client.fetchQuery({ ...notificationContentOptions(viewerId, item.action.announcementId), staleTime: 0 })
      if (active.current && sequence.current === ticket) setState(content ? { status: 'ready', content } : { status: 'unavailable' })
      if (active.current && sequence.current === ticket && !content) await invalidateNotificationQueries(client, viewerId)
    } catch { if (active.current && sequence.current === ticket) setState({ status: 'error' }) }
  }, [client, viewerId, item.action.announcementId])
  useEffect(() => {
    active.current = true
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void read() })
    return () => {
      cancelled = true; active.current = false
      void client.cancelQueries({ queryKey: notificationContentKey(viewerId, item.action.announcementId), exact: true })
    }
  }, [client, viewerId, item.action.announcementId, read])
  return <CollectionItemDialog title={state.status === 'ready' ? state.content.title : item.title}
    description={item.kind === 'changelog' ? `Changelog · Version ${item.appVersion}` : 'Annonce MY.'}
    busy={false} error={state.status === 'error' ? 'Impossible de charger ce contenu. Réessayez la consultation.' : null}
    opener={opener} onClose={onClose}>
    {state.status === 'loading' && <p role="status">Chargement du contenu…</p>}
    {state.status === 'unavailable' && <p role="status">Ce contenu a été retiré, a expiré ou n’est plus accessible.</p>}
    {state.status === 'ready' && <PresentedContent viewerId={viewerId} content={state.content} />}
    <div className="collection-dialog-actions">
      <button className="button collection-cancel" type="button" onClick={onClose}>Fermer</button>
      {state.status === 'error' && <button className="button button-secondary" type="button" onClick={() => void read()}>Réessayer la consultation</button>}
    </div>
  </CollectionItemDialog>
}

// This component mounts only when the successful body is committed to the DOM.
// A cancelled setup never dispatches; StrictMode's surviving setup sends once.
function PresentedContent({ viewerId, content }: { viewerId: string; content: NotificationContent }) {
  const client = useQueryClient()
  const requireViewer = useNotificationMutationScope(viewerId)
  const options = announcementProcessMutationOptions(client, viewerId)
  const mutation = useMutation({ ...options, mutationFn: (request, context) => { requireViewer(); return options.mutationFn!(request, context) } })
  const { mutateAsync } = mutation
  const attempted = useRef(false), running = useRef(false)
  const process = useCallback(async () => {
    if (running.current) return
    running.current = true
    try { await mutateAsync({ announcementId: content.announcementId, observedHash: content.revision }) }
    catch { /* Retain this exact consulted content for an explicit retry. */ }
    finally { running.current = false }
  }, [mutateAsync, content.announcementId, content.revision])
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || attempted.current || content.requiresAction) return
      attempted.current = true; void process()
    })
    return () => { cancelled = true }
  }, [content.requiresAction, process])
  return <>
    <div className="notification-body">{content.body}</div>
    {content.requiresAction ? <p role="status">Cette annonce nécessite une action dont la validation n’est pas disponible.</p>
      : mutation.isPending ? <p role="status">Enregistrement de la consultation…</p>
        : mutation.isError ? <div className="notification-state">
          <p role="alert">Le contenu a été affiché, mais son traitement n’a pas pu être confirmé.</p>
          <button className="button button-secondary" type="button" onClick={() => void process()}>Réessayer le suivi</button>
        </div> : mutation.data && <p role="status">{mutation.data.outcome === 'recorded' ? 'Consultation enregistrée.' : 'Cette notification n’est plus active. Le centre a été actualisé.'}</p>}
  </>
}
