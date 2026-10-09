import { CollectionItemsError } from '../../services/collection-items'
import type { ManualItemPlacement } from '../../types/collection-items'
import { useCollectionStructureMutation } from './useCollectionStructureMutation'

type Action = { type: 'add'; variantId: string; placement: ManualItemPlacement }
  | { type: 'remove'; collectionItemId: string }

export function useManualCollectionItems(viewerId: string, collectionId: string, onSuccess: (action: Action) => void) {
  const mutation = useCollectionStructureMutation(viewerId, collectionId)
  function submit(action: Action) {
    void mutation.submit(action).then(confirmed => { if (confirmed) onSuccess(action) })
  }
  return { ...mutation, submit }
}

export function manualItemErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof CollectionItemsError) {
    switch (error.code) {
      case 'already_present': return 'Cette version est déjà dans votre collection.'
      case 'manual_variant_unavailable': return 'Cette version n’est plus disponible.'
      case 'manual_item_invalid_placement': return 'Cette position n’est pas disponible. Choisissez Début ou Fin.'
      case 'manual_item_unavailable': return 'Cette carte n’est plus disponible dans cette collection.'
      case 'collection_item_unavailable': return 'Cette carte n’est plus disponible dans cette collection.'
      case 'automatic_item_removal_forbidden': return 'Seules les cartes Perso peuvent être retirées.'
      case 'collection_action_unavailable': return 'Cette collection n’est plus disponible pour cette action.'
      case 'not_authorized': return 'Impossible d’effectuer cette action. Reconnectez-vous puis réessayez.'
      case 'collection_structure_conflict': return 'La collection a changé. Vérifiez son contenu puis réessayez.'
      case 'operation_uncertain': return 'Résultat incertain. Réessayez la même action pour vérifier son résultat.'
      case 'operation_storage_unavailable': return 'Impossible de conserver cette action dans le navigateur. Réessayez avant de continuer.'
      case 'content_refresh_failed': return 'Impossible d’actualiser la collection. Actualisez son contenu avant de continuer.'
      case 'operation_id_conflict': return 'Cette opération est en conflit. Actualisez la collection avant de continuer.'
      case 'order_contract_upgrade_required': return 'Cette collection nécessite une version compatible de l’application.'
      case 'collection_operation_invalid': return 'Cette action n’est pas disponible. Vérifiez la collection puis réessayez.'
    }
  }
  return 'La modification n’a pas pu être confirmée. Vérifiez la collection puis réessayez.'
}
