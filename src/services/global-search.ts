import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { variantIdString } from '../lib/variant-id'
import type { Database } from '../types/database.generated'
import type { GlobalNavigationSuggestion } from '../types/global-search'
import { POKEMON_TYPES } from '../types/pokemon'
import { getSupabaseClient } from './supabase'

export type GlobalSearchErrorCode = 'invalid_query' | 'not_authorized' | 'unexpected'
export class GlobalSearchError extends Error {
  constructor(readonly code: GlobalSearchErrorCode) { super(code); this.name = 'GlobalSearchError' }
}

const id = z.string().refine(value => { try { return variantIdString(value) === value } catch { return false } })
const text = z.string().nullable(), type = z.enum(POKEMON_TYPES).nullable()
const consistentTypes = (primary: string | null, secondary: string | null) =>
  secondary === null || (primary !== null && primary !== secondary)
const suggestion = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pokemon'), pokemon_id: id, name_fr: text,
    dex_number: z.number().int().positive().max(2147483647), primary_type: type, secondary_type: type }),
  z.strictObject({ kind: z.literal('set'), set_id: id, name_fr: text, name_source: text,
    abbreviation_fr: text, abbreviation: text }),
  z.strictObject({ kind: z.literal('collection'),
    collection_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    name: z.string(), access: z.enum(['owned', 'shared']), collection_type: z.enum(['free', 'automatic']),
    target_type: z.enum(['pokemon', 'set']).nullable(), target_name: text,
    target_primary_type: type, target_secondary_type: type }),
  z.strictObject({ kind: z.literal('card'), source_card_id: id, name_fr: text, local_id: text,
    set_name_fr: text, set_abbreviation_fr: text, set_abbreviation: text }),
]).refine(row => {
  if (row.kind === 'pokemon') return consistentTypes(row.primary_type, row.secondary_type)
  if (row.kind !== 'collection') return true
  return consistentTypes(row.target_primary_type, row.target_secondary_type)
    && (row.target_type === 'pokemon' || (row.target_primary_type === null && row.target_secondary_type === null))
    && (row.collection_type === 'free'
      ? row.target_type === null && row.target_name === null : row.target_type !== null)
}).transform((row): GlobalNavigationSuggestion => {
  switch (row.kind) {
    case 'pokemon': return { kind: row.kind, pokemonId: row.pokemon_id, nameFr: row.name_fr,
      dexNumber: row.dex_number, primaryType: row.primary_type, secondaryType: row.secondary_type }
    case 'set': return { kind: row.kind, setId: row.set_id, nameFr: row.name_fr, nameSource: row.name_source,
      abbreviationFr: row.abbreviation_fr, abbreviation: row.abbreviation }
    case 'collection': return { kind: row.kind, collectionId: row.collection_id, name: row.name, access: row.access,
      collectionType: row.collection_type, targetType: row.target_type, targetName: row.target_name,
      targetPrimaryType: row.target_primary_type, targetSecondaryType: row.target_secondary_type }
    case 'card': return { kind: row.kind, sourceCardId: row.source_card_id, nameFr: row.name_fr,
      localId: row.local_id, setNameFr: row.set_name_fr,
      setAbbreviationFr: row.set_abbreviation_fr, setAbbreviation: row.set_abbreviation }
  }
})
const categoryOrder = { pokemon: 0, set: 1, collection: 2, card: 3 } as const
const results = z.array(suggestion).max(10).refine(rows => {
  let previous = 0
  const counts = [0, 0, 0, 0], identities = new Set<string>()
  for (const row of rows) {
    const category = categoryOrder[row.kind]
    const key = `${row.kind}:${row.kind === 'pokemon' ? row.pokemonId : row.kind === 'set'
      ? row.setId : row.kind === 'collection' ? row.collectionId : row.sourceCardId}`
    if (category < previous || (category < 3 && ++counts[category]! > 2) || identities.has(key)) return false
    previous = category
    identities.add(key)
  }
  return true
})

function validateQuery(query: string) {
  // PostgreSQL owns normalization/tokenization and rejects queries without useful terms.
  if (typeof query !== 'string' || [...query].length < 3 || [...query].length > 200) throw new GlobalSearchError('invalid_query')
}
function readError(error: unknown): GlobalSearchError {
  if (error instanceof GlobalSearchError) return error
  if (error && typeof error === 'object' && 'code' in error) {
    if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) return new GlobalSearchError('not_authorized')
    if (error.code === '22023' && 'message' in error && error.message === 'global_search_invalid_query') return new GlobalSearchError('invalid_query')
  }
  return new GlobalSearchError('unexpected')
}
export function createGlobalSearchService(client: SupabaseClient<Database>) {
  return {
    async searchGlobalNavigation(this: void, query: string): Promise<GlobalNavigationSuggestion[]> {
      try {
        validateQuery(query)
        const { data, error } = await client.rpc('search_global_navigation', { p_query: query })
        if (error) throw readError(error)
        const parsed = results.safeParse(data)
        if (!parsed.success) throw new GlobalSearchError('unexpected')
        return parsed.data
      } catch (error) { throw readError(error) }
    },
  }
}
export async function searchGlobalNavigation(query: string): Promise<GlobalNavigationSuggestion[]> {
  validateQuery(query)
  const client = getSupabaseClient()
  if (!client) throw new GlobalSearchError('not_authorized')
  return createGlobalSearchService(client).searchGlobalNavigation(query)
}
