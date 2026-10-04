import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { variantIdString } from '../lib/variant-id'
import { POKEMON_TYPES } from '../types/pokemon'
import type { CatalogCard, CatalogDatabase, CatalogPokemon, CatalogSet } from '../types/catalog'
import type { Database } from '../types/database.generated'
import { getSupabaseClient } from './supabase'

export type CatalogErrorCode = 'catalog_unavailable' | 'not_authorized' | 'unexpected'
export class CatalogError extends Error {
  constructor(readonly code: CatalogErrorCode) { super(code); this.name = 'CatalogError' }
}
const id = z.string().refine(value => { try { return variantIdString(value) === value } catch { return false } })
const text = z.string().nullable(), date = z.iso.date().nullable(), type = z.enum(POKEMON_TYPES).nullable()
const pokemonFields = { pokemon_id: id, dex_number: z.number().int().positive().max(2147483647), name_fr: text }
const typeFields = { primary_type: type, secondary_type: type }
const validTypes = (row: { primary_type: string | null; secondary_type: string | null }) =>
  row.secondary_type === null || (row.primary_type !== null && row.primary_type !== row.secondary_type)
const pokemonSummary = z.strictObject(pokemonFields).transform(row => ({ pokemonId: row.pokemon_id, dexNumber: row.dex_number, nameFr: row.name_fr }))
const pokemonMetadata = z.strictObject({ ...pokemonFields, ...typeFields }).refine(validTypes).transform(row => ({
  pokemonId: row.pokemon_id, dexNumber: row.dex_number, nameFr: row.name_fr, primaryType: row.primary_type, secondaryType: row.secondary_type,
}))
const series = z.strictObject({ series_id: id, name_fr: text, name_source: text }).transform(row => ({ seriesId: row.series_id, nameFr: row.name_fr, nameSource: row.name_source }))
const setFields = { set_id: id, name_fr: text, name_source: text, abbreviation_fr: text, abbreviation: text }
const setSummary = z.strictObject(setFields).transform(row => ({ setId: row.set_id, nameFr: row.name_fr,
  nameSource: row.name_source, abbreviationFr: row.abbreviation_fr, abbreviation: row.abbreviation }))
const variantFields = { variant_id: id, image_url: text, variant_label: text, effective_release_date: date }
const variantPayload = z.strictObject(variantFields)
const mapVariant = (row: z.infer<typeof variantPayload>) => ({
  variantId: row.variant_id, imageUrl: row.image_url, variantLabel: row.variant_label, effectiveReleaseDate: row.effective_release_date,
})
const uniqueIds = <T>(rows: T[], key: (row: T) => string) => new Set(rows.map(key)).size === rows.length
const variant = variantPayload.transform(mapVariant)
const pokemonVariant = z.strictObject({ ...variantFields, source_card_id: id, card_name_fr: text, local_id: text,
  set_id: id, set_name_fr: text, set_name_source: text, set_abbreviation_fr: text, set_abbreviation: text,
}).transform(row => ({ ...mapVariant(row), sourceCardId: row.source_card_id, cardNameFr: row.card_name_fr, localId: row.local_id,
  setId: row.set_id, setNameFr: row.set_name_fr, setNameSource: row.set_name_source,
  setAbbreviationFr: row.set_abbreviation_fr, setAbbreviation: row.set_abbreviation }))
const setVariant = z.strictObject({ ...variantFields, source_card_id: id, card_name_fr: text, local_id: text,
  rarity: text, category: text, pokemon: z.array(pokemonSummary).refine(rows => uniqueIds(rows, row => row.pokemonId)),
}).transform(row => ({ ...mapVariant(row), sourceCardId: row.source_card_id, cardNameFr: row.card_name_fr,
  localId: row.local_id, rarity: row.rarity, category: row.category, pokemon: row.pokemon }))
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const pokemonSchema = z.strictObject({ ...pokemonFields, ...typeFields, variant_count: count,
  variants: z.array(pokemonVariant).min(1).refine(rows => uniqueIds(rows, row => row.variantId)),
}).refine(validTypes).refine(row => row.variant_count === row.variants.length).transform(row => ({
  pokemonId: row.pokemon_id, dexNumber: row.dex_number, nameFr: row.name_fr, primaryType: row.primary_type,
  secondaryType: row.secondary_type, variantCount: row.variant_count, variants: row.variants,
}))
const setSchema = z.strictObject({ ...setFields, release_date: date, series, logo_url: text, symbol_url: text, variant_count: count,
  variants: z.array(setVariant).min(1).refine(rows => uniqueIds(rows, row => row.variantId)),
}).refine(row => row.variant_count === row.variants.length).transform(row => ({
  setId: row.set_id, nameFr: row.name_fr, nameSource: row.name_source, abbreviationFr: row.abbreviation_fr,
  abbreviation: row.abbreviation, releaseDate: row.release_date, series: row.series, logoUrl: row.logo_url,
  symbolUrl: row.symbol_url, variantCount: row.variant_count, variants: row.variants,
}))
const cardSchema = z.strictObject({ source_card_id: id, name_fr: text, local_id: text, rarity: text, category: text,
  effective_release_date: date, image_url: text, set: setSummary, series,
  pokemon: z.array(pokemonMetadata).refine(rows => uniqueIds(rows, row => row.pokemonId)),
  variants: z.array(variant).min(1).refine(rows => uniqueIds(rows, row => row.variantId)),
}).transform(row => ({ sourceCardId: row.source_card_id, nameFr: row.name_fr, localId: row.local_id,
  rarity: row.rarity, category: row.category, effectiveReleaseDate: row.effective_release_date, imageUrl: row.image_url,
  set: row.set, series: row.series, pokemon: row.pokemon, variants: row.variants }))

function inputId(value: string): string {
  if (typeof value !== 'string' || !id.safeParse(value).success) throw new CatalogError('catalog_unavailable')
  return value
}
function readError(error: unknown): CatalogError {
  if (error instanceof CatalogError) return error
  if (error && typeof error === 'object' && 'code' in error
    && ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) return new CatalogError('not_authorized')
  return new CatalogError('unexpected')
}
export function createCatalogService(client: SupabaseClient<Database>) {
  const reader = client as unknown as SupabaseClient<CatalogDatabase>
  async function read<T>(request: () => PromiseLike<{ data: unknown; error: unknown }>, schema: z.ZodType<T>, matches: (data: T) => boolean): Promise<T> {
    try {
      const { data, error } = await request()
      if (error) throw readError(error)
      if (data === null) throw new CatalogError('catalog_unavailable')
      const result = schema.safeParse(data)
      if (!result.success || !matches(result.data)) throw new CatalogError('unexpected')
      return result.data
    } catch (error) {
      throw readError(error)
    }
  }
  return {
    async getCatalogPokemon(this: void, pokemonId: string): Promise<CatalogPokemon> {
      const value = inputId(pokemonId)
      return read(() => reader.rpc('get_catalog_pokemon', { p_pokemon_id: value }), pokemonSchema, row => row.pokemonId === value)
    },
    async getCatalogSet(this: void, setId: string): Promise<CatalogSet> {
      const value = inputId(setId)
      return read(() => reader.rpc('get_catalog_set', { p_set_id: value }), setSchema, row => row.setId === value)
    },
    async getCatalogCard(this: void, cardId: string): Promise<CatalogCard> {
      const value = inputId(cardId)
      return read(() => reader.rpc('get_catalog_card', { p_card_id: value }), cardSchema, row => row.sourceCardId === value)
    },
  }
}
function service(value: string) {
  inputId(value)
  const client = getSupabaseClient()
  if (!client) throw new CatalogError('not_authorized')
  return createCatalogService(client)
}
export async function getCatalogPokemon(pokemonId: string): Promise<CatalogPokemon> { return service(pokemonId).getCatalogPokemon(pokemonId) }
export async function getCatalogSet(setId: string): Promise<CatalogSet> { return service(setId).getCatalogSet(setId) }
export async function getCatalogCard(cardId: string): Promise<CatalogCard> { return service(cardId).getCatalogCard(cardId) }
