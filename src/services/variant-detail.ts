import type { SupabaseClient } from '@supabase/supabase-js'
import { variantIdString, type VariantIdInput } from '../lib/variant-id'
import type { Database } from '../types/database.generated'
import type { VariantDetail, VariantDetailDatabase } from '../types/variant-detail'
import { getSupabaseClient } from './supabase'
import { catalogPokemonMetadataList } from './catalog-pokemon'

export type VariantDetailErrorCode = 'not_authorized' | 'variant_unavailable' | 'unexpected'
export class VariantDetailError extends Error {
  constructor(readonly code: VariantDetailErrorCode) { super(code); this.name = 'VariantDetailError' }
}

function inputId(value: VariantIdInput): string {
  try { return variantIdString(value) } catch { throw new VariantDetailError('variant_unavailable') }
}
function nullableText(value: unknown): value is string | null { return value === null || typeof value === 'string' }
function dateOrigin(value: unknown): value is VariantDetail['dateOrigin'] {
  return value === 'variant' || value === 'card' || value === 'product'
    || value === 'set' || value === 'override' || value === 'unknown'
}

function decodeVariantDetail(value: unknown): VariantDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VariantDetailError('unexpected')
  const row = value as Record<string, unknown>
  const pokemon = catalogPokemonMetadataList.safeParse(row.pokemon)
  if (Object.keys(row).length !== 23 || typeof row.variant_id !== 'string'
    || typeof row.source_card_id !== 'string' || typeof row.set_id !== 'string' || !pokemon.success
    || !nullableText(row.image_url) || !nullableText(row.card_name_fr) || !nullableText(row.local_id)
    || !nullableText(row.rarity) || !nullableText(row.category)
    || !nullableText(row.set_name_fr) || !nullableText(row.set_name_source)
    || !nullableText(row.set_abbreviation_fr) || !nullableText(row.set_abbreviation)
    || !nullableText(row.series_name_fr) || !nullableText(row.series_name_source)
    || !nullableText(row.variant_label) || !nullableText(row.variant_type) || !nullableText(row.variant_subtype)
    || !nullableText(row.variant_size) || !nullableText(row.variant_foil)
    || !Array.isArray(row.variant_stamps) || !row.variant_stamps.every((stamp: unknown) => typeof stamp === 'string')
    || !nullableText(row.effective_release_date) || !dateOrigin(row.date_origin)) {
    throw new VariantDetailError('unexpected')
  }
  // Runtime payload IDs must already be decimal strings, even for small values.
  try {
    for (const id of [row.variant_id, row.source_card_id, row.set_id]) {
      if (variantIdString(id) !== id) throw new VariantDetailError('unexpected')
    }
  } catch { throw new VariantDetailError('unexpected') }
  return {
    variantId: row.variant_id, sourceCardId: row.source_card_id, setId: row.set_id, pokemon: pokemon.data,
    imageUrl: row.image_url, cardNameFr: row.card_name_fr, localId: row.local_id,
    rarity: row.rarity, category: row.category, setNameFr: row.set_name_fr, setNameSource: row.set_name_source,
    setAbbreviationFr: row.set_abbreviation_fr, setAbbreviation: row.set_abbreviation,
    seriesNameFr: row.series_name_fr, seriesNameSource: row.series_name_source,
    variantLabel: row.variant_label, variantType: row.variant_type, variantSubtype: row.variant_subtype,
    variantSize: row.variant_size, variantFoil: row.variant_foil, variantStamps: row.variant_stamps,
    effectiveReleaseDate: row.effective_release_date, dateOrigin: row.date_origin,
  }
}

export function createVariantDetailService(client: SupabaseClient<Database>) {
  const detailClient = client as unknown as SupabaseClient<VariantDetailDatabase>
  return {
    async getVariantDetail(this: void, variantId: VariantIdInput): Promise<VariantDetail> {
      const id = inputId(variantId)
      try {
        const { data, error } = await detailClient.rpc('get_variant_detail', { p_variant_id: id })
        if (error) throw error
        if (data === null) throw new VariantDetailError('variant_unavailable')
        const detail = decodeVariantDetail(data)
        if (detail.variantId !== id) throw new VariantDetailError('unexpected')
        return detail
      } catch (error) {
        if (error instanceof VariantDetailError) throw error
        if (error && typeof error === 'object' && 'code' in error
          && ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) {
          throw new VariantDetailError('not_authorized')
        }
        throw new VariantDetailError('unexpected')
      }
    },
  }
}

export async function getVariantDetail(variantId: VariantIdInput): Promise<VariantDetail> {
  const id = inputId(variantId)
  const client = getSupabaseClient()
  if (!client) throw new VariantDetailError('not_authorized')
  return createVariantDetailService(client).getVariantDetail(id)
}
