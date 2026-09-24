import type { Database, Json } from './database.generated'

export interface CollectionContentItem {
  collectionItemId: string
  variantId: string
  origin: 'manual' | 'automatic'
  cardNameFr: string | null
  localId: string | null
  setNameFr: string | null
  imageUrl: string | null
  variantLabel: string | null
  owned: boolean
}

// Temporary, explicit Phase 6B.1 contract; NOT generated schema evidence.
// Remove after Phase 6 migrations are applied and Supabase types truly regenerated.
// JSONB remains untrusted until validated by the content service.
export type PendingCollectionContentDatabase = Database & {
  public: { Functions: { get_collection_content: {
    Args: { p_collection_id: string }
    Returns: Json
  } } }
}
