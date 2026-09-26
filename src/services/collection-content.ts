import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type { CollectionContentItem } from '../types/collection-content'
import { getSupabaseClient } from './supabase'

export type CollectionContentErrorCode = 'not_authorized' | 'unexpected'
export class CollectionContentError extends Error {
  constructor(readonly code: CollectionContentErrorCode) { super(code); this.name = 'CollectionContentError' }
}

// Same UUID format accepted by the collection overview, without a version restriction.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function decimalId(value: unknown): value is string {
  // PostgreSQL BIGINT::text is canonical signed decimal, including local fixture IDs.
  // Never pass an identifier through a JavaScript number, even during validation.
  return typeof value === 'string' && value.length <= 20 && value.trim() === value && /^(?:0|-?[1-9]\d*)$/.test(value)
    && BigInt(value) >= -9223372036854775808n && BigInt(value) <= 9223372036854775807n
}
function nullableString(value: unknown): value is string | null { return value === null || typeof value === 'string' }

function contentItem(value: unknown): CollectionContentItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CollectionContentError('unexpected')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 9
    || typeof row.collection_item_id !== 'string' || row.collection_item_id.length !== 36 || !uuid.test(row.collection_item_id)
    || !decimalId(row.variant_id) || (row.origin !== 'manual' && row.origin !== 'automatic')
    || !nullableString(row.card_name_fr) || !nullableString(row.local_id) || !nullableString(row.set_name_fr)
    || !nullableString(row.image_url) || !nullableString(row.variant_label) || typeof row.owned !== 'boolean') {
    throw new CollectionContentError('unexpected')
  }
  return {
    collectionItemId: row.collection_item_id, variantId: row.variant_id, origin: row.origin,
    cardNameFr: row.card_name_fr, localId: row.local_id, setNameFr: row.set_name_fr,
    imageUrl: row.image_url, variantLabel: row.variant_label, owned: row.owned,
  }
}

export function createCollectionContentService(client: SupabaseClient<Database>) {
  return {
    async getCollectionContent(collectionId: string): Promise<CollectionContentItem[]> {
      try {
        if (collectionId.length !== 36 || !uuid.test(collectionId)) throw new CollectionContentError('unexpected')
        const { data, error } = await client.rpc('get_collection_content', { p_collection_id: collectionId })
        if (error) throw error
        if (!Array.isArray(data)) throw new CollectionContentError('unexpected')
        const content = data.map(contentItem)
        if (new Set(content.map(item => item.collectionItemId.toLowerCase())).size !== content.length
          || new Set(content.map(item => item.variantId)).size !== content.length) throw new CollectionContentError('unexpected')
        // Empty and invisible collections both return []. No sorting, extra reads or ownership calculation.
        return content
      } catch (error) {
        if (error instanceof CollectionContentError) throw error
        if (error && typeof error === 'object' && 'code' in error
          && ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) {
          throw new CollectionContentError('not_authorized')
        }
        throw new CollectionContentError('unexpected')
      }
    },
  }
}

export async function getCollectionContent(collectionId: string): Promise<CollectionContentItem[]> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionContentError('not_authorized')
  return createCollectionContentService(client).getCollectionContent(collectionId)
}
