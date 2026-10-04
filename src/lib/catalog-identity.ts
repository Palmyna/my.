import type { PokemonType } from '../types/pokemon'

export interface CatalogTone { light: string; dark: string }
/** MY. graphite companions; descriptive tokens only, never persisted in PostgreSQL. */
export const POKEMON_TYPE_PALETTE: Record<PokemonType, CatalogTone> = {
  normal: { light: '#B8ACA0', dark: '#514840' },
  fire: { light: '#DB9974', dark: '#783E32' },
  water: { light: '#7AAED2', dark: '#2B5077' },
  electric: { light: '#D8BF69', dark: '#756026' },
  grass: { light: '#91B584', dark: '#385B41' },
  ice: { light: '#9ACCD1', dark: '#3D727C' },
  fighting: { light: '#C48179', dark: '#713D42' },
  poison: { light: '#B391C8', dark: '#653D78' },
  ground: { light: '#C6AA7B', dark: '#71543A' },
  flying: { light: '#A4B8DE', dark: '#566C99' },
  psychic: { light: '#D291AF', dark: '#7B3F64' },
  bug: { light: '#B0BC74', dark: '#586536' },
  rock: { light: '#B6A885', dark: '#625C45' },
  ghost: { light: '#9B94C4', dark: '#49416C' },
  dragon: { light: '#8C9DD8', dark: '#3E457E' },
  dark: { light: '#998C9D', dark: '#3E334B' },
  steel: { light: '#A1B8BB', dark: '#4A6269' },
  fairy: { light: '#D4A9CB', dark: '#805876' },
}
export const NEUTRAL_CATALOG_TONE: CatalogTone = { light: '#8FA8BD', dark: '#344E66' }
export interface CatalogIdentity {
  primaryAccent: string
  secondaryAccent: string | null
  gradientFrom: string
  gradientTo: string
  gradient: string
}
/** Missing metadata uses the slate Catalogue identity for Pokémon, Extension or Carte. */
export function resolveCatalogIdentity(primaryType: PokemonType | null = null, secondaryType: PokemonType | null = null): CatalogIdentity {
  const primary = primaryType === null ? NEUTRAL_CATALOG_TONE : POKEMON_TYPE_PALETTE[primaryType]
  const secondary = primaryType !== null && secondaryType !== null ? POKEMON_TYPE_PALETTE[secondaryType] : null
  const to = secondary?.dark ?? primary.dark
  return { primaryAccent: primary.light, secondaryAccent: secondary?.light ?? null,
    gradientFrom: primary.light, gradientTo: to, gradient: `linear-gradient(135deg, ${primary.light}, ${to})` }
}
