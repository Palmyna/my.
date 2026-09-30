import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type { ItemMove, ManualCollectionItemsDatabase, ManualItemPlacement } from '../types/collection-items'
import { variantIdString } from '../lib/variant-id'
import { getSupabaseClient } from './supabase'

export type CollectionItemsErrorCode = 'not_authorized' | 'item_unavailable' | 'order_conflict' | 'unexpected'
  | 'collection_action_unavailable' | 'manual_item_invalid_placement' | 'manual_variant_unavailable'
  | 'already_present' | 'collection_structure_conflict' | 'manual_item_unexpected'
  | 'manual_item_unavailable' | 'automatic_item_removal_forbidden'
export class CollectionItemsError extends Error {
  constructor(readonly code: CollectionItemsErrorCode) { super(code); this.name = 'CollectionItemsError' }
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof CollectionItemsError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) {
        throw new CollectionItemsError('not_authorized')
      }
      if (error.code === 'P0002' && 'message' in error && error.message === 'reorder_item_unavailable') {
        throw new CollectionItemsError('item_unavailable')
      }
      if (['40001', '40P01', '55P03', '57014'].includes(String(error.code))
        || (error.code === '22023' && 'message' in error && error.message === 'reorder_invalid_move')) {
        throw new CollectionItemsError('order_conflict')
      }
    }
    throw new CollectionItemsError('unexpected')
  }
}

async function manualRequest<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof CollectionItemsError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code)
      const message = 'message' in error ? error.message : undefined
      const businessErrors: Record<string, string> = {
        collection_action_unavailable: '42501', manual_item_invalid_placement: '22023',
        manual_variant_unavailable: 'P0002', already_present: '23505',
        manual_item_unavailable: 'P0002', automatic_item_removal_forbidden: '23514',
        manual_item_unexpected: 'XX000',
      }
      if (typeof message === 'string' && Object.hasOwn(businessErrors, message) && businessErrors[message] === code) {
        throw new CollectionItemsError(message as CollectionItemsErrorCode)
      }
      if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new CollectionItemsError('not_authorized')
      if (['40001', '40P01', '55P03', '57014'].includes(code)) throw new CollectionItemsError('collection_structure_conflict')
    }
    throw new CollectionItemsError('manual_item_unexpected')
  }
}

export function createCollectionItemsService(client: SupabaseClient<Database>) {
  const manualClient = client as unknown as SupabaseClient<ManualCollectionItemsDatabase>
  return {
    add(collectionId: string, variantId: string, placement: ManualItemPlacement = 'end'): Promise<string> {
      return manualRequest(async () => {
        const { data, error } = await manualClient.rpc('add_manual_collection_item', {
          p_collection_id: collectionId, p_variant_id: variantIdString(variantId), p_placement: placement,
        })
        if (error) throw error
        if (typeof data !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data)) {
          throw new CollectionItemsError('manual_item_unexpected')
        }
        return data
      })
    },
    remove(collectionId: string, collectionItemId: string): Promise<void> {
      return manualRequest(async () => {
        const { data, error } = await client.rpc('remove_manual_collection_item', {
          p_collection_id: collectionId, p_collection_item_id: collectionItemId,
        })
        if (error) throw error
        if (data !== null) throw new CollectionItemsError('manual_item_unexpected')
      })
    },
    // Minimal authoritative order, independent of future variant/row content.
    // Never transport NUMERIC positions through JavaScript numbers.
    listOrder(collectionId: string): Promise<string[]> {
      return request(async () => {
        const { data, error } = await client.rpc('get_collection_item_order', { p_collection_id: collectionId })
        if (error) throw error
        if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !id)
          || new Set(data).size !== data.length) throw new CollectionItemsError('unexpected')
        return data
      })
    },
    move(collectionId: string, { itemId, destination }: ItemMove): Promise<void> {
      return request(async () => {
        const { error } = await client.rpc('reorder_collection_item', {
          p_collection_id: collectionId, p_item_id: itemId, p_placement: destination.placement,
          ...('anchorId' in destination ? { p_anchor_id: destination.anchorId } : {}),
        })
        if (error) throw error
      })
    },
  }
}

function service() {
  const client = getSupabaseClient()
  if (!client) throw new CollectionItemsError('not_authorized')
  return createCollectionItemsService(client)
}
export async function listCollectionItemOrder(collectionId: string) { return service().listOrder(collectionId) }
export async function moveCollectionItem(collectionId: string, move: ItemMove) { return service().move(collectionId, move) }
export async function addManualCollectionItem(collectionId: string, variantId: string, placement: ManualItemPlacement) { return service().add(collectionId, variantId, placement) }
export async function removeManualCollectionItem(collectionId: string, collectionItemId: string) { return service().remove(collectionId, collectionItemId) }
