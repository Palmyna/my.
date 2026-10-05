import { localSearchTerms, normalizeLocalSearchText } from '../../lib/local-search'
import type { CatalogPokemonVariant } from '../../types/catalog'

export function filterCatalogVariants(variants: CatalogPokemonVariant[], query: string): CatalogPokemonVariant[] {
  const terms = localSearchTerms(query)
  if (!terms.length) return variants
  return variants.filter(variant => {
    const fields = [variant.cardNameFr, variant.setNameFr, variant.setNameSource, variant.setAbbreviationFr,
      variant.setAbbreviation, variant.localId, variant.variantLabel]
      .filter((field): field is string => field !== null).map(normalizeLocalSearchText)
    return terms.every(term => fields.some(field => field.includes(term)))
  })
}
