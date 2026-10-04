import type { Database } from './database.generated'
import type { PokemonType } from './pokemon'

export interface CatalogPokemonSummary { pokemonId: string; dexNumber: number; nameFr: string | null }
export interface CatalogPokemonMetadata extends CatalogPokemonSummary { primaryType: PokemonType | null; secondaryType: PokemonType | null }
export interface CatalogSeries { seriesId: string; nameFr: string | null; nameSource: string | null }
export interface CatalogSetSummary {
  setId: string; nameFr: string | null; nameSource: string | null
  abbreviationFr: string | null; abbreviation: string | null
}
export interface CatalogVariant {
  variantId: string; imageUrl: string | null; variantLabel: string | null; effectiveReleaseDate: string | null
}
export interface CatalogPokemonVariant extends CatalogVariant {
  sourceCardId: string; cardNameFr: string | null; localId: string | null
  setId: string; setNameFr: string | null; setNameSource: string | null
  setAbbreviationFr: string | null; setAbbreviation: string | null
}
export interface CatalogSetVariant extends CatalogVariant {
  sourceCardId: string; cardNameFr: string | null; localId: string | null
  rarity: string | null; category: string | null; pokemon: CatalogPokemonSummary[]
}
export interface CatalogPokemon extends CatalogPokemonMetadata { variantCount: number; variants: CatalogPokemonVariant[] }
export interface CatalogSet extends CatalogSetSummary {
  releaseDate: string | null; series: CatalogSeries; logoUrl: string | null; symbolUrl: string | null
  variantCount: number; variants: CatalogSetVariant[]
}
export interface CatalogCard {
  sourceCardId: string; nameFr: string | null; localId: string | null; rarity: string | null; category: string | null
  effectiveReleaseDate: string | null; imageUrl: string | null
  set: CatalogSetSummary; series: CatalogSeries; pokemon: CatalogPokemonMetadata[]; variants: CatalogVariant[]
}

type CatalogFunctions = 'get_catalog_pokemon' | 'get_catalog_set' | 'get_catalog_card'
// Adapt only BIGINT arguments; PostgREST accepts decimal strings losslessly.
export type CatalogDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], CatalogFunctions> & {
      [K in CatalogFunctions]: Omit<Database['public']['Functions'][K], 'Args'> & {
        Args: { [A in keyof Database['public']['Functions'][K]['Args']]: string }
      }
    }
  }
}
