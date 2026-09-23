import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type { ItemMove, PendingCollectionReorderDatabase } from '../types/collection-items'
import { getSupabaseClient } from './supabase'

export type CollectionItemsErrorCode = 'not_authorized' | 'item_unavailable' | 'order_conflict' | 'unexpected'
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

export function createCollectionItemsService(client: SupabaseClient<Database>) {
  // Generated types deliberately remain unchanged until manual migration.
  const pendingClient = client as unknown as SupabaseClient<PendingCollectionReorderDatabase>
  return {
    // Minimal authoritative order, independent of future variant/row content.
    // Never transport NUMERIC positions through JavaScript numbers.
    listOrder(collectionId: string): Promise<string[]> {
      return request(async () => {
        const { data, error } = await pendingClient.rpc('get_collection_item_order', { p_collection_id: collectionId })
        if (error) throw error
        if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !id)
          || new Set(data).size !== data.length) throw new CollectionItemsError('unexpected')
        return data
      })
    },
    move(collectionId: string, { itemId, destination }: ItemMove): Promise<void> {
      return request(async () => {
        const { error } = await pendingClient.rpc('reorder_collection_item', {
          p_collection_id: collectionId, p_item_id: itemId, p_placement: destination.placement,
          p_anchor_id: 'anchorId' in destination ? destination.anchorId : null,
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
