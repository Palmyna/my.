import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { CollectionContent, CollectionContentItem } from '../types/collection-content'
import { collectionBigint, collectionUuid, personalRevision } from '../lib/collection-contract'
import { getSupabaseClient } from './supabase'
import { variantIdString } from '../lib/variant-id'

export type CollectionContentErrorCode = 'not_authorized' | 'collection_unavailable' | 'unexpected'
export class CollectionContentError extends Error {
  constructor(readonly code: CollectionContentErrorCode) { super(code); this.name = 'CollectionContentError' }
}

// Same UUID format accepted by the collection overview, without a version restriction.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function decimalId(value: unknown): value is string {
  // Reject even safe numbers; reuse the lossless canonical BIGINT boundary.
  if (typeof value !== 'string') return false
  try { return variantIdString(value) === value } catch { return false }
}
function nullableString(value: unknown): value is string | null { return value === null || typeof value === 'string' }

function contentItem(value: unknown): CollectionContentItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CollectionContentError('unexpected')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 15
    || typeof row.collection_item_id !== 'string' || row.collection_item_id.length !== 36 || !uuid.test(row.collection_item_id)
    || !decimalId(row.variant_id) || (row.origin !== 'manual' && row.origin !== 'automatic')
    || !decimalId(row.source_card_id) || !decimalId(row.set_id)
    || !nullableString(row.card_name_fr) || !nullableString(row.local_id) || !nullableString(row.set_name_fr)
    || !nullableString(row.set_abbreviation) || !nullableString(row.set_abbreviation_fr)
    || !nullableString(row.series_name_fr) || !nullableString(row.series_name_source)
    || !nullableString(row.image_url) || !nullableString(row.variant_label) || typeof row.owned !== 'boolean') {
    throw new CollectionContentError('unexpected')
  }
  return {
    collectionItemId: row.collection_item_id, variantId: row.variant_id, origin: row.origin,
    sourceCardId: row.source_card_id, setId: row.set_id,
    cardNameFr: row.card_name_fr, localId: row.local_id, setNameFr: row.set_name_fr, setAbbreviationFr: row.set_abbreviation_fr, setAbbreviation: row.set_abbreviation,
    seriesNameFr: row.series_name_fr, seriesNameSource: row.series_name_source,
    imageUrl: row.image_url, variantLabel: row.variant_label, owned: row.owned,
  }
}

const text = z.string().nullable()
const v2Item = z.strictObject({
  collection_item_id: collectionUuid, variant_id: collectionBigint, source_card_id: collectionBigint, set_id: collectionBigint,
  origin: z.enum(['manual', 'automatic']), card_name_fr: text, local_id: text, set_name_fr: text,
  set_abbreviation_fr: text, set_abbreviation: text, series_name_fr: text, series_name_source: text,
  image_url: text, variant_label: text, owned: z.boolean(), is_hidden: z.boolean(),
}).refine(item => !item.is_hidden || item.origin === 'automatic')
const v2Content = z.strictObject({
  order_contract_version: z.union([z.literal(1), z.literal(2)]), personal_revision: personalRevision,
  items: z.array(v2Item).refine(items =>
    new Set(items.map(item => item.collection_item_id.toLowerCase())).size === items.length
    && new Set(items.map(item => item.variant_id)).size === items.length),
})

export function decodeCollectionContentV2(value: unknown): CollectionContent {
  const parsed = v2Content.safeParse(value)
  if (!parsed.success) throw new CollectionContentError('unexpected')
  return {
    orderContractVersion: parsed.data.order_contract_version, personalRevision: parsed.data.personal_revision,
    items: parsed.data.items.map(({ is_hidden, ...legacy }) => ({ ...contentItem(legacy), isHidden: is_hidden })),
  }
}

function readError(error: unknown): CollectionContentError {
  if (error instanceof CollectionContentError) return error
  if (error && typeof error === 'object' && 'code' in error
    && ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) return new CollectionContentError('not_authorized')
  return new CollectionContentError('unexpected')
}

export function createCollectionContentService(client: SupabaseClient<Database>) {
  return {
    async getCollectionContentV2(collectionId: string): Promise<CollectionContent> {
      try {
        if (!collectionUuid.safeParse(collectionId).success) throw new CollectionContentError('unexpected')
        const { data, error } = await client.rpc('get_collection_content_v2', { p_collection_id: collectionId })
        if (error) throw error
        if (data === null) throw new CollectionContentError('collection_unavailable')
        return decodeCollectionContentV2(data)
      } catch (error) { throw readError(error) }
    },
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

export async function getCollectionContentV2(collectionId: string): Promise<CollectionContent> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionContentError('not_authorized')
  return createCollectionContentService(client).getCollectionContentV2(collectionId)
}

export async function getCollectionContent(collectionId: string): Promise<CollectionContentItem[]> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionContentError('not_authorized')
  return createCollectionContentService(client).getCollectionContent(collectionId)
}
