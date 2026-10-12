import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CollectionItemsError, listCollectionItemOrder } from '../../services/collection-items'
import type { ItemMove, ReorderAvailability } from '../../types/collection-items'
import { useAuth } from '../auth/auth-context'
import { collectionItemOrderKey, collectionStructureMutationKey } from './collection-query'
import { useCollectionStructureMutation } from './useCollectionStructureMutation'
import { manualItemErrorMessage } from './useManualCollectionItems'

type Options = { collectionId: string; access: 'owned' | 'shared'; availability: ReorderAvailability }

export function useCollectionItemReorder({ collectionId, access, availability }: Options) {
  const { user, isAuthorized } = useAuth()
  const client = useQueryClient()
  const structure = useCollectionStructureMutation(user?.id ?? '', collectionId)
  const order = useQuery({ queryKey: collectionItemOrderKey(user?.id, collectionId),
    queryFn: () => listCollectionItemOrder(collectionId), enabled: isAuthorized && !!user, retry: false })
  const disabledReason = !isAuthorized || !user ? 'Reconnectez-vous pour réorganiser la collection.'
    : access !== 'owned' ? 'Cette collection est en lecture seule.'
      : !availability.enabled ? availability.reason
        : structure.busy ? 'Modification de la collection en cours…'
          : !order.isSuccess || order.isFetching ? 'Chargement de l’ordre des cartes…' : null
  const error = order.isError ? 'Impossible d’actualiser l’ordre des cartes. Réessayez.'
    : structure.error instanceof CollectionItemsError && structure.error.code === 'not_authorized'
      ? 'Impossible de déplacer cette carte. Reconnectez-vous puis réessayez.'
      : structure.error instanceof CollectionItemsError && structure.error.code === 'item_unavailable'
        ? 'Cette carte n’est plus disponible. Vérifiez la collection puis réessayez.'
        : structure.error instanceof CollectionItemsError && ['collection_structure_conflict', 'operation_uncertain',
          'operation_id_conflict', 'order_contract_upgrade_required', 'content_refresh_failed', 'collection_item_unavailable', 'operation_storage_unavailable'].includes(structure.error.code)
          ? manualItemErrorMessage(structure.error)
          : structure.error ? 'Le déplacement n’a pas pu être confirmé. Vérifiez l’ordre puis réessayez.' : null
  return {
    itemIds: isAuthorized && user && order.isSuccess ? order.data : [],
    isPending: order.isPending, isSaving: structure.pending, error,
    availability: disabledReason ? { enabled: false, reason: disabledReason } as const : { enabled: true } as const,
    move: (move: ItemMove) => disabledReason
      || client.isMutating({ mutationKey: collectionStructureMutationKey(user?.id, collectionId), exact: true })
      ? Promise.resolve(false) : structure.submit({ type: 'move', move }),
    refresh: structure.refresh,
  }
}
