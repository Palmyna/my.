/** Species types: PokéAPI identifiers only; no TCG energy types or alternate forms. */
export const POKEMON_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const
export type PokemonType = typeof POKEMON_TYPES[number]
export const POKEMON_TYPE_LABELS: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante', ice: 'Glace',
  fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
  rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
}
