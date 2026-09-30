import { useEffect, useRef } from 'react'
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { addManualCollectionItem, removeManualCollectionItem, CollectionItemsError } from '../../services/collection-items'
import type { ManualItemPlacement } from '../../types/collection-items'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey, collectionStructureMutationKey } from './collection-query'

type Action = { type: 'add'; variantId: string; placement: ManualItemPlacement }
  | { type: 'remove'; collectionItemId: string }

export function useManualCollectionItems(viewerId: string, collectionId: string, onSuccess: (action: Action) => void) {
  const client = useQueryClient()
  const active = useRef(true)
  const running = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const mutationKey = collectionStructureMutationKey(viewerId, collectionId)
  const busy = useIsMutating({ mutationKey, exact: true }) > 0
  const mutation = useMutation({
    mutationKey, retry: false,
    mutationFn: (action: Action) => action.type === 'add'
      ? addManualCollectionItem(collectionId, action.variantId, action.placement).then(() => undefined)
      : removeManualCollectionItem(collectionId, action.collectionItemId),
    onSuccess: (_data, action) => { if (active.current) onSuccess(action) },
    onSettled: async () => {
      // Also refresh uncertain writes. Never infer order, counts or possession.
      const filters = [collectionContentKey(viewerId, collectionId), collectionItemOrderKey(viewerId, collectionId),
        collectionOverviewKey(viewerId, collectionId), dashboardCollectionsKey(viewerId)]
        .map(queryKey => ({ queryKey, exact: true }))
      await Promise.all(filters.map(filter => client.cancelQueries(filter)))
      await Promise.all(filters.map(filter => client.invalidateQueries(filter)))
    },
  })
  function submit(action: Action) {
    if (running.current || client.isMutating({ mutationKey, exact: true })) return
    running.current = true
    void mutation.mutateAsync(action).catch(() => {}).finally(() => { running.current = false })
  }
  return { submit, busy, pending: mutation.isPending, error: mutation.error, reset: mutation.reset }
}

export function manualItemErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof CollectionItemsError) {
    switch (error.code) {
      case 'already_present': return 'Cette version est déjà dans votre collection.'
      case 'manual_variant_unavailable': return 'Cette version n’est plus disponible.'
      case 'manual_item_invalid_placement': return 'Cette position n’est pas disponible. Choisissez Début ou Fin.'
      case 'manual_item_unavailable': return 'Cette carte n’est plus disponible dans cette collection.'
      case 'automatic_item_removal_forbidden': return 'Seules les cartes Perso peuvent être retirées.'
      case 'collection_action_unavailable': return 'Cette collection n’est plus disponible pour cette action.'
      case 'not_authorized': return 'Impossible d’effectuer cette action. Reconnectez-vous puis réessayez.'
      case 'collection_structure_conflict': return 'La collection a changé. Vérifiez son contenu puis réessayez.'
    }
  }
  return 'La modification n’a pas pu être confirmée. Vérifiez la collection puis réessayez.'
}
