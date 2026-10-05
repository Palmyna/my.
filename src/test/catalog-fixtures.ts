import type { CatalogPokemon, CatalogPokemonVariant, CatalogSet, CatalogSetVariant } from '../types/catalog'

export const catalogVariant: CatalogPokemonVariant = {
  variantId: '9007199254740995', sourceCardId: '300', setId: '50', cardNameFr: 'Pikachu',
  setNameFr: 'Écarlate et Violet', setNameSource: 'Scarlet & Violet', setAbbreviationFr: 'EV', setAbbreviation: 'SV',
  localId: '025', variantLabel: 'Holo', imageUrl: null, effectiveReleaseDate: '2024-01-01',
}
export const catalogPokemon: CatalogPokemon = {
  pokemonId: '800', dexNumber: 25, nameFr: 'Pikachu', primaryType: 'electric', secondaryType: null,
  variantCount: 3, variants: [catalogVariant,
    { ...catalogVariant, variantId: '2', cardNameFr: 'Pikachu ex', localId: '26', variantLabel: 'Reverse' },
    { ...catalogVariant, variantId: '1', cardNameFr: 'Pikachu spécial', localId: '025', variantLabel: 'Holo spéciale' }],
}

export const catalogSetVariant: CatalogSetVariant = {
  variantId: '9007199254740995', sourceCardId: '300', cardNameFr: 'Duo électrique', localId: '025',
  variantLabel: 'Reverse', imageUrl: null, effectiveReleaseDate: '2024-03-22', rarity: 'Rare', category: 'Pokemon',
  pokemon: [{ pokemonId: '800', dexNumber: 25, nameFr: 'Pikachu' }, { pokemonId: '801', dexNumber: 26, nameFr: 'Raichu' }],
}
export const catalogSet: CatalogSet = {
  setId: '50', nameFr: 'Forces Temporelles', nameSource: 'Temporal Forces', abbreviationFr: 'EV05', abbreviation: 'TEF',
  releaseDate: '2024-03-22', series: { seriesId: '5', nameFr: 'Écarlate et Violet', nameSource: 'Scarlet & Violet' },
  logoUrl: 'https://assets.example/logo.png', symbolUrl: 'https://assets.example/symbol.png', variantCount: 4,
  variants: [catalogSetVariant,
    { ...catalogSetVariant, variantId: '2', cardNameFr: 'Évoli', localId: '026', variantLabel: 'Holo',
      pokemon: [{ pokemonId: '802', dexNumber: 133, nameFr: 'Évoli' }] },
    { ...catalogSetVariant, variantId: '1', cardNameFr: 'Recherche Professorale', localId: '100', variantLabel: 'Normale', category: 'Trainer', pokemon: [] },
    { ...catalogSetVariant, variantId: '3', cardNameFr: 'Énergie', localId: '101', variantLabel: 'Normale', category: 'Energy', pokemon: [] }],
}
