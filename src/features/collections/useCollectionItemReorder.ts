import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CollectionItemsError, listCollectionItemOrder, moveCollectionItem } from '../../services/collection-items'
import type { ItemMove, ReorderAvailability } from '../../types/collection-items'
import { useAuth } from '../auth/auth-context'
import { collectionContentKey, collectionItemOrderKey } from './collection-query'

type Options = { collectionId: string; access: 'owned' | 'shared'; availability: ReorderAvailability }

export function useCollectionItemReorder({ collectionId, access, availability }: Options) {
  const { user, isAuthorized } = useAuth()
  const client = useQueryClient()
  const running = useRef(false)
  const queryKey = collectionItemOrderKey(user?.id, collectionId)
  const order = useQuery({ queryKey, queryFn: () => listCollectionItemOrder(collectionId),
    enabled: isAuthorized && !!user, retry: false })
  const mutation = useMutation({
    mutationFn: (request: { collectionId: string; userId: string; move: ItemMove }) => moveCollectionItem(request.collectionId, request.move),
    retry: false,
    onSettled: async (_data, _error, request) => {
      // Even a failed/uncertain write can have committed. Keep the technical order
      // read and refresh the visible authoritative content, scoped to this request.
      await Promise.all([
        client.invalidateQueries({ queryKey: collectionItemOrderKey(request.userId, request.collectionId), exact: true }),
        client.invalidateQueries({ queryKey: collectionContentKey(request.userId, request.collectionId), exact: true }),
      ])
    },
  })
  const disabledReason = !isAuthorized || !user ? 'Reconnectez-vous pour réorganiser la collection.'
    : access !== 'owned' ? 'Cette collection est en lecture seule.'
      : !availability.enabled ? availability.reason
        : mutation.isPending ? 'Déplacement en cours…'
          : !order.isSuccess || order.isFetching ? 'Attendez le chargement de l’ordre de la collection.' : null
  const error = order.isError ? 'Impossible d’actualiser l’ordre. Réessayez avant de déplacer un élément.'
    : mutation.isError && mutation.variables?.collectionId === collectionId && mutation.variables.userId === user?.id
      ? mutation.error instanceof CollectionItemsError && mutation.error.code === 'not_authorized'
        ? 'Vos droits ne permettent pas ce déplacement.'
        : mutation.error instanceof CollectionItemsError && mutation.error.code === 'item_unavailable'
          ? 'Cet élément n’est plus disponible. L’ordre a été actualisé.'
          : 'Le déplacement n’a pas pu être confirmé. Vérifiez l’ordre avant de réessayer.' : null

  async function move(next: ItemMove): Promise<boolean> {
    if (disabledReason || running.current || !user) return false
    running.current = true
    try { await mutation.mutateAsync({ collectionId, userId: user.id, move: next }); return true }
    catch { return false } // Only the safe message above reaches presentation.
    finally { running.current = false }
  }
  return {
    // Do not retain private cached content on a failed read or logout.
    itemIds: isAuthorized && user && order.isSuccess ? order.data : [],
    isPending: order.isPending, isSaving: mutation.isPending, error,
    availability: disabledReason ? { enabled: false, reason: disabledReason } as const : { enabled: true } as const,
    move, refresh: () => order.refetch(),
  }
}
