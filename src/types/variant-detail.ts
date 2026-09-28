import type { Database } from './database.generated'

/** Catalogue data only, including historical variants. No collection or ownership context. */
export interface VariantDetail {
  variantId: string
  imageUrl: string | null
  cardNameFr: string | null
  localId: string | null
  rarity: string | null
  category: string | null
  setNameFr: string | null
  setNameSource: string | null
  setAbbreviationFr: string | null
  setAbbreviation: string | null
  seriesNameFr: string | null
  seriesNameSource: string | null
  variantLabel: string | null
  variantType: string | null
  variantSubtype: string | null
  variantSize: string | null
  variantFoil: string | null
  variantStamps: string[]
  effectiveReleaseDate: string | null
  dateOrigin: 'variant' | 'card' | 'product' | 'set' | 'override' | 'unknown'
}

// PostgREST accepts decimal text for BIGINT. Adapt only the generated input type,
// as in ManualCollectionItemsDatabase; no runtime numeric conversion.
type DetailFunction = Database['public']['Functions']['get_variant_detail']
export type VariantDetailDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], 'get_variant_detail'> & {
      get_variant_detail: Omit<DetailFunction, 'Args'> & {
        Args: Omit<DetailFunction['Args'], 'p_variant_id'> & { p_variant_id: string }
      }
    }
  }
}
