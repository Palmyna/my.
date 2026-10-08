import { localSearchTerms, normalizeLocalSearchText } from '../../lib/local-search'
import type { CatalogPokemonVariant, CatalogSetVariant } from '../../types/catalog'

export function filterCatalogVariants<T extends CatalogPokemonVariant | CatalogSetVariant>(variants: T[], query: string): T[] {
  const terms = localSearchTerms(query)
  if (!terms.length) return variants
  return variants.filter(variant => {
    const fields = [variant.cardNameFr, variant.localId, variant.variantLabel,
      ...('pokemon' in variant ? variant.pokemon.map(pokemon => pokemon.nameFr)
        : [variant.setNameFr, variant.setNameSource, variant.setAbbreviationFr, variant.setAbbreviation])]
      .filter((field): field is string => field !== null).map(normalizeLocalSearchText)
    return terms.every(term => fields.some(field => field.includes(term)))
  })
}
