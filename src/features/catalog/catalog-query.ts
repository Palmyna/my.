export const catalogPokemonKey = (viewerId: string, pokemonId: string) => ['catalog', 'pokemon', viewerId, pokemonId] as const
export const ownedAutomaticCollectionKey = (viewerId: string, targetType: 'pokemon' | 'set', targetId: string) =>
  ['collections', 'owned-automatic', viewerId, targetType, targetId] as const
