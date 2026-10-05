import type { CatalogPokemon, CatalogPokemonVariant } from '../types/catalog'

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
