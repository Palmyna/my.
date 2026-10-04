import { expect, it } from 'vitest'
import { POKEMON_TYPES, POKEMON_TYPE_LABELS } from '../types/pokemon'
import { NEUTRAL_CATALOG_TONE, POKEMON_TYPE_PALETTE, resolveCatalogIdentity } from './catalog-identity'

it('covers exactly 18 types with distinct deep/light tones and French labels', () => {
  expect(Object.keys(POKEMON_TYPE_PALETTE)).toEqual([...POKEMON_TYPES])
  expect(new Set(Object.values(POKEMON_TYPE_PALETTE).flatMap(tone => [tone.light, tone.dark])).size).toBe(36)
  for (const type of POKEMON_TYPES) {
    expect(POKEMON_TYPE_LABELS[type]).toBeTruthy()
    for (const value of Object.values(POKEMON_TYPE_PALETTE[type])) expect(value).toMatch(/^#[0-9A-F]{6}$/)
  }
})
it('resolves mono-type light to dark', () => {
  expect(resolveCatalogIdentity('fire')).toMatchObject({ primaryAccent: '#DB9974', secondaryAccent: null,
    gradientFrom: '#DB9974', gradientTo: '#783E32' })
})
it('uses primary light and secondary dark, preserving primary accent', () => {
  expect(resolveCatalogIdentity('fire', 'flying')).toEqual({ primaryAccent: '#DB9974', secondaryAccent: '#A4B8DE',
    gradientFrom: '#DB9974', gradientTo: '#566C99', gradient: 'linear-gradient(135deg, #DB9974, #566C99)' })
})
it('resolves missing Pokémon metadata, Extension and Carte to neutral slate', () => {
  expect(resolveCatalogIdentity()).toMatchObject({ primaryAccent: NEUTRAL_CATALOG_TONE.light, secondaryAccent: null,
    gradientFrom: NEUTRAL_CATALOG_TONE.light, gradientTo: NEUTRAL_CATALOG_TONE.dark })
  expect(resolveCatalogIdentity(null, 'fire')).toEqual(resolveCatalogIdentity())
})
