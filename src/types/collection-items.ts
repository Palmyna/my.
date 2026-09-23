import type { Database } from './database.generated'

export type ItemDestination = { placement: 'start' | 'end' }
  | { placement: 'before' | 'after'; anchorId: string }
export type ItemMove = { itemId: string; destination: ItemDestination }
export type ReorderAvailability = { enabled: true } | { enabled: false; reason: string }

// Explicit pending contract, NOT generated schema evidence. Remove this overlay
// after manually applying Phase 6A.3 and running the repository type generator.
export type PendingCollectionReorderDatabase = Database & {
  public: { Functions: { get_collection_item_order: {
    Args: { p_collection_id: string }
    Returns: string[]
  }; reorder_collection_item: {
    Args: { p_collection_id: string; p_item_id: string; p_placement: string; p_anchor_id: string | null }
    Returns: undefined
  } } }
}
