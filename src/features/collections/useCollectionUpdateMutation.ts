import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CollectionUpdatePreview } from '../../types/collection-update'
import { CollectionUpdateError } from '../../services/collection-update'
import { useAuth } from '../auth/auth-context'
import { collectionUpdatePreviewKey } from './collection-query'
import { useCollectionStructureMutation, type CollectionStructureAction } from './useCollectionStructureMutation'

// 8F.3 calls presentPreview only after actually presenting this successful query
// result. Capture its context; a later query result needs a new presentation.
export function useCollectionUpdateMutation(viewerId: string, collectionId: string) {
  const client = useQueryClient()
  const { isAuthorized, user } = useAuth()
  const mutation = useCollectionStructureMutation(viewerId, collectionId)
  const presented = useRef<Extract<CollectionStructureAction, { type: 'apply' }> | null>(null)
  useEffect(() => { presented.current = null }, [viewerId, collectionId, isAuthorized, user?.id])
  const presentPreview = useCallback((preview: CollectionUpdatePreview): boolean => {
    const state = client.getQueryState<CollectionUpdatePreview>(collectionUpdatePreviewKey(viewerId, collectionId))
    presented.current = null
    if (!isAuthorized || user?.id !== viewerId || state?.status !== 'success' || state.fetchStatus !== 'idle'
      || state.isInvalidated || state.data !== preview || preview.collectionId !== collectionId) return false
    presented.current = { type: 'apply', request: { token: structuredClone(preview.token), addedVariantIds: preview.added.map(item => item.variantId) },
      presented: { viewerId, collectionId, previewUpdatedAt: state.dataUpdatedAt } }
    return true
  }, [client, viewerId, collectionId, isAuthorized, user?.id])
  return { presentPreview, apply: () => presented.current ? mutation.submit(presented.current) : Promise.resolve(false),
    retry: mutation.retry, refresh: mutation.refresh, busy: mutation.busy, pending: mutation.pending,
    recovery: mutation.recovery, error: mutation.error,
    previewStale: mutation.error instanceof CollectionUpdateError && ['preview_stale', 'preview_not_presented'].includes(mutation.error.code), reset: mutation.reset }
}
