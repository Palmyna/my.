import type { PokemonType } from '../types/pokemon'

export interface CatalogTone { light: string; dark: string }
/** MY. type families adapted to graphite; presentation only, never persisted. */
export const POKEMON_TYPE_PALETTE: Record<PokemonType, CatalogTone> = {
  normal: { light: '#AEB5B8', dark: '#555B5E' },
  fire: { light: '#E58A4A', dark: '#7E3E21' },
  water: { light: '#6DA7CF', dark: '#285B80' },
  electric: { light: '#E2C84A', dark: '#7C6920' },
  grass: { light: '#93BD63', dark: '#46672D' },
  ice: { light: '#78C8DE', dark: '#326A7A' },
  fighting: { light: '#C97842', dark: '#6F3B25' },
  poison: { light: '#B185C1', dark: '#654572' },
  ground: { light: '#D2B85A', dark: '#715F29' },
  flying: { light: '#77BDD7', dark: '#4E6873' },
  psychic: { light: '#D97AB2', dark: '#7E3F65' },
  bug: { light: '#88A95C', dark: '#465D2A' },
  rock: { light: '#A9974C', dark: '#5C5024' },
  ghost: { light: '#917BB2', dark: '#4D3F66' },
  dragon: { light: '#719FC9', dark: '#744B5E' },
  dark: { light: '#9B979E', dark: '#48464B' },
  steel: { light: '#A8BEC0', dark: '#536B6D' },
  fairy: { light: '#E6A7D3', dark: '#81506E' },
}
export const NEUTRAL_CATALOG_TONE: CatalogTone = { light: '#8FA8BD', dark: '#344E66' }
export const FUNCTIONAL_IDENTITY_PALETTE = {
  set: '#44C7B7', free: '#E22B35', shared: '#6366F1',
} as const
export interface CatalogIdentity {
  primaryAccent: string
  secondaryAccent: string
  textAccent: string
  onAccent: string
  surface: string
  border: string
  gradient: string
}
function identity(primary: string, secondary = primary, onAccent = 'var(--app-bg)'): CatalogIdentity {
  const surface = `color-mix(in srgb, ${primary} 12%, var(--surface))`
  return {
    primaryAccent: primary, secondaryAccent: secondary,
    textAccent: `color-mix(in srgb, ${primary} 75%, var(--text))`, onAccent,
    surface, border: `color-mix(in srgb, ${primary} 35%, var(--border))`,
    gradient: `linear-gradient(115deg, ${surface} 0%, ${surface} 35%, color-mix(in srgb, ${secondary} 10%, var(--surface)) 100%)`,
  }
}

/** Explicit Pokemon fallback; an orphan secondary cannot invent an identity. */
export function resolvePokemonIdentity(primaryType: PokemonType | null, secondaryType: PokemonType | null = null): CatalogIdentity {
  if (primaryType === null) return identity(NEUTRAL_CATALOG_TONE.light)
  return identity(POKEMON_TYPE_PALETTE[primaryType].light,
    secondaryType === null ? POKEMON_TYPE_PALETTE[primaryType].light : POKEMON_TYPE_PALETTE[secondaryType].light)
}

/** Extension also owns Catalogue Card; free/shared are Collection contexts. */
export function resolveFunctionalIdentity(kind: keyof typeof FUNCTIONAL_IDENTITY_PALETTE): CatalogIdentity {
  return identity(FUNCTIONAL_IDENTITY_PALETTE[kind], undefined, kind === 'free' ? 'var(--on-brand)' : 'var(--app-bg)')
}
