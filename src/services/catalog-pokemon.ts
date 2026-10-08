import { z } from 'zod'
import { variantIdString } from '../lib/variant-id'
import { POKEMON_TYPES } from '../types/pokemon'

// One strict Catalogue Pokemon contract for Card, navigation and Variant Detail.
const id = z.string().refine(value => { try { return variantIdString(value) === value } catch { return false } })
const type = z.enum(POKEMON_TYPES).nullable()
export const catalogPokemonSummaryFields = {
  pokemon_id: id, dex_number: z.number().int().positive().max(2147483647), name_fr: z.string().nullable(),
}
export const catalogPokemonTypeFields = { primary_type: type, secondary_type: type }
export const consistentPokemonTypes = (row: { primary_type: string | null; secondary_type: string | null }) =>
  row.secondary_type === null || (row.primary_type !== null && row.primary_type !== row.secondary_type)
const metadata = z.strictObject({ ...catalogPokemonSummaryFields, ...catalogPokemonTypeFields })
  .refine(consistentPokemonTypes).transform(row => ({
    pokemonId: row.pokemon_id, dexNumber: row.dex_number, nameFr: row.name_fr,
    primaryType: row.primary_type, secondaryType: row.secondary_type,
  }))
export const catalogPokemonMetadataList = z.array(metadata)
  .refine(rows => new Set(rows.map(row => row.pokemonId)).size === rows.length)
