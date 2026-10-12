import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateNotificationQueries, notificationReadMutationOptions } from './notification-query'
import { useNotificationMutationScope } from './useNotificationMutationScope'

// Tracking never participates in 8F consent, token validity or mutual exclusion.
export function usePresentedCollectionNotification(viewerId: string, collectionId: string, revision: string | null) {
  const client = useQueryClient()
  const requireViewer = useNotificationMutationScope(viewerId)
  const options = notificationReadMutationOptions(client, viewerId)
  const mutation = useMutation({ ...options, mutationFn: (request, context) => { requireViewer(); return options.mutationFn!(request, context) },
    onError: () => invalidateNotificationQueries(client, viewerId) })
  const { mutateAsync } = mutation
  const attempted = useRef(new Set<string>()), observed = useRef<string | null>(null), running = useRef(false)
  const read = useCallback(async (version: string) => {
    if (running.current) return
    running.current = true; observed.current = version
    try { await mutateAsync({ notificationKey: `collection:${collectionId}`, observedRevision: version }) }
    catch { /* Retry retains the version of the presented plan. */ }
    finally { running.current = false }
  }, [collectionId, mutateAsync])
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || !revision || attempted.current.has(revision) || running.current) return
      attempted.current.add(revision); void read(revision)
    })
    return () => { cancelled = true }
  }, [revision, read, mutation.isPending])
  return { pending: mutation.isPending, error: mutation.isError,
    retry: () => observed.current ? read(observed.current) : Promise.resolve() }
}
