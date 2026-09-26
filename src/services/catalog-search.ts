import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type { CatalogVariantForAdd, CatalogVariantSearchOptions } from '../types/catalog-search'
import { getSupabaseClient } from './supabase'

export type CatalogSearchErrorCode = 'not_authorized' | 'invalid_query' | 'unexpected'
export class CatalogSearchError extends Error {
  constructor(readonly code: CatalogSearchErrorCode) { super(code); this.name = 'CatalogSearchError' }
}

function decimalId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 20 && value.trim() === value && /^(?:0|-?[1-9]\d*)$/.test(value)
    && BigInt(value) >= -9223372036854775808n && BigInt(value) <= 9223372036854775807n
}
function nullableText(value: unknown): value is string | null { return value === null || typeof value === 'string' }

function decodeVariant(value: unknown): CatalogVariantForAdd {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CatalogSearchError('unexpected')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 6 || !decimalId(row.variant_id)
    || !nullableText(row.image_url) || !nullableText(row.card_name_fr) || !nullableText(row.set_name_fr)
    || !nullableText(row.local_id) || !nullableText(row.variant_label)) throw new CatalogSearchError('unexpected')
  return { variantId: row.variant_id, imageUrl: row.image_url, cardNameFr: row.card_name_fr,
    setNameFr: row.set_name_fr, localId: row.local_id, variantLabel: row.variant_label }
}

export function createCatalogSearchService(client: SupabaseClient<Database>) {
  return {
    async searchCatalogVariantsForAdd(this: void, query: string, options: CatalogVariantSearchOptions = {}): Promise<CatalogVariantForAdd[]> {
      try {
        const { limit = 20, offset = 0 } = options
        if (typeof query !== 'string' || [...query].length > 200 || !/[\p{L}\p{N}]/u.test(query)
          || !Number.isInteger(limit) || limit < 1 || limit > 100
          || !Number.isInteger(offset) || offset < 0 || offset > 2147483647) throw new CatalogSearchError('invalid_query')
        // All normalization, matching, eligibility, ranking and paging belong to PostgreSQL.
        const { data, error } = await client.rpc('search_catalog_variants_for_add', {
          p_query: query, p_limit: limit, p_offset: offset,
        })
        if (error) throw error
        if (!Array.isArray(data) || data.length > limit) throw new CatalogSearchError('unexpected')
        const variants = data.map(decodeVariant)
        if (new Set(variants.map(item => item.variantId)).size !== variants.length) throw new CatalogSearchError('unexpected')
        return variants
      } catch (error) {
        if (error instanceof CatalogSearchError) throw error
        if (error && typeof error === 'object' && 'code' in error) {
          if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) throw new CatalogSearchError('not_authorized')
          if (['22023', '22P02', '22003'].includes(String(error.code))) throw new CatalogSearchError('invalid_query')
        }
        throw new CatalogSearchError('unexpected')
      }
    },
  }
}

export async function searchCatalogVariantsForAdd(query: string, options?: CatalogVariantSearchOptions): Promise<CatalogVariantForAdd[]> {
  const client = getSupabaseClient()
  if (!client) throw new CatalogSearchError('not_authorized')
  return createCatalogSearchService(client).searchCatalogVariantsForAdd(query, options)
}
