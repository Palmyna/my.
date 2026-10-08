import { expect, it } from 'vitest'
import { isPokemonType, POKEMON_TYPES, POKEMON_TYPE_LABELS } from '../types/pokemon'
import { CARD_FALLBACK_ACCENT, FUNCTIONAL_IDENTITY_PALETTE, NEUTRAL_CATALOG_TONE, POKEMON_TYPE_PALETTE, resolveCardIdentity, resolveFunctionalIdentity, resolvePokemonIdentity } from './catalog-identity'

it('covers exactly 18 types with distinct deep/light tones and French labels', () => {
  expect(Object.keys(POKEMON_TYPE_PALETTE)).toEqual([...POKEMON_TYPES])
  expect(new Set(Object.values(POKEMON_TYPE_PALETTE).flatMap(tone => [tone.light, tone.dark])).size).toBe(36)
  for (const type of POKEMON_TYPES) {
    expect(POKEMON_TYPE_LABELS[type]).toBeTruthy()
    for (const value of Object.values(POKEMON_TYPE_PALETTE[type])) expect(value).toMatch(/^#[0-9A-F]{6}$/)
  }
})
it.each(POKEMON_TYPES)('resolves %s from the only Pokemon palette with a graphite surface', type => {
  const resolved = resolvePokemonIdentity(type)
  expect(isPokemonType(type)).toBe(true)
  expect(resolved.primaryAccent).toBe(POKEMON_TYPE_PALETTE[type].light)
  expect(resolved.secondaryAccent).toBe(resolved.primaryAccent)
  expect(resolved.surface).toContain('var(--surface)')
  expect(resolved.gradient).toContain(resolved.surface)
})
it.each([['fire','flying'],['water','flying'],['grass','poison'],['ghost','poison'],['dragon','flying'],['ice','water'],['rock','ground']] as const)(
  'preserves primary %s and secondary %s in a subtle gradient', (primary, secondary) => {
    const resolved = resolvePokemonIdentity(primary, secondary)
    expect(resolved.primaryAccent).toBe(POKEMON_TYPE_PALETTE[primary].light)
    expect(resolved.secondaryAccent).toBe(POKEMON_TYPE_PALETTE[secondary].light)
    expect(resolved.gradient).toContain(resolved.primaryAccent)
    expect(resolved.gradient).toContain(resolved.secondaryAccent)
  })
it('has an explicit neutral fallback, separate from functional identities', () => {
  expect(resolvePokemonIdentity(null).primaryAccent).toBe(NEUTRAL_CATALOG_TONE.light)
  expect(resolvePokemonIdentity(null, 'fire')).toEqual(resolvePokemonIdentity(null))
  for (const kind of ['set','free','shared'] as const) {
    expect(resolveFunctionalIdentity(kind).primaryAccent).toBe(FUNCTIONAL_IDENTITY_PALETTE[kind])
    expect(resolveFunctionalIdentity(kind)).not.toEqual(resolvePokemonIdentity(null))
  }
})
it.each(['unknown','Electric','',42,undefined,null])('type guard rejects unknown runtime type %j', value => {
  expect(isPokemonType(value)).toBe(false)
})

it.each([
  { types: [], accents: [CARD_FALLBACK_ACCENT, CARD_FALLBACK_ACCENT] },
  { types: [['electric', null]], accents: [POKEMON_TYPE_PALETTE.electric.light, POKEMON_TYPE_PALETTE.electric.light] },
  { types: [['electric', 'flying']], accents: [POKEMON_TYPE_PALETTE.electric.light, POKEMON_TYPE_PALETTE.flying.light] },
  { types: [['electric', 'flying'], ['electric', 'flying']], accents: [POKEMON_TYPE_PALETTE.electric.light, POKEMON_TYPE_PALETTE.flying.light] },
  { types: [['electric', null], ['electric', 'flying']], accents: [POKEMON_TYPE_PALETTE.electric.light, POKEMON_TYPE_PALETTE.electric.light] },
  { types: [['electric', 'flying'], ['water', 'flying']], accents: [POKEMON_TYPE_PALETTE.flying.light, POKEMON_TYPE_PALETTE.flying.light] },
  { types: [['electric', 'electric'], ['electric', null]], accents: [POKEMON_TYPE_PALETTE.electric.light, POKEMON_TYPE_PALETTE.electric.light] },
  { types: [['electric', null], ['fire', null]], accents: [CARD_FALLBACK_ACCENT, CARD_FALLBACK_ACCENT] },
  { types: [['electric', null], [null, null]], accents: [CARD_FALLBACK_ACCENT, CARD_FALLBACK_ACCENT] },
  { types: [[null, 'electric']], accents: [CARD_FALLBACK_ACCENT, CARD_FALLBACK_ACCENT] },
  { types: [['electric', 'flying'], ['flying', 'electric']], accents: [CARD_FALLBACK_ACCENT, CARD_FALLBACK_ACCENT] },
] as const)('Card identity agrees across all Pokemon: $types', ({ types, accents }) => {
  const pokemon = Object.freeze(types.map(([primaryType, secondaryType]) => Object.freeze({ primaryType, secondaryType })))
  const before = structuredClone(pokemon)
  const result = resolveCardIdentity(pokemon)
  expect([result.primaryAccent, result.secondaryAccent]).toEqual(accents)
  expect(resolveCardIdentity([...pokemon].reverse())).toEqual(result)
  expect(pokemon).toEqual(before)
})
it('Card fallback is soft gold, distinct from every functional context', () => {
  expect(CARD_FALLBACK_ACCENT).toBe('#C9A34A')
  for (const kind of ['set', 'free', 'shared'] as const) expect(resolveCardIdentity([])).not.toEqual(resolveFunctionalIdentity(kind))
})

function rgb(hex: string) { return [1,3,5].map(start => Number.parseInt(hex.slice(start,start+2),16)) }
function mix(a: number[], b: number[], ratio: number) { return a.map((v,i) => v*ratio+b[i]!*(1-ratio)) }
function luminance(color: number[]) {
  const linear = color.map(v => { const c=v/255; return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4 })
  return linear[0]!*.2126+linear[1]!*.7152+linear[2]!*.0722
}
function contrast(a: number[], b: number[]) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05) }
it('palette roles meet contrast on graphite: text 4.5, focus/progress 3, owner FAB label 4.5', () => {
  const graphite=rgb('#15181D'), text=rgb('#F5F7FA'), app=rgb('#0E1014')
  for (const accent of [...Object.values(POKEMON_TYPE_PALETTE).map(t=>t.light),...Object.values(FUNCTIONAL_IDENTITY_PALETTE),NEUTRAL_CATALOG_TONE.light,CARD_FALLBACK_ACCENT]) {
    const color=rgb(accent), surface=mix(color,graphite,.12)
    expect(contrast(mix(color,text,.75),surface), `${accent} text`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(mix(color,text,.75),rgb('#1C2027')), `${accent} panel links`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color,surface), `${accent} focus`).toBeGreaterThanOrEqual(3)
    // Shared has no owner FAB. Brand red retains white label, other FABs graphite.
    if (accent !== FUNCTIONAL_IDENTITY_PALETTE.shared)
      expect(contrast(accent===FUNCTIONAL_IDENTITY_PALETTE.free ? rgb('#FFFFFF') : app,color), `${accent} FAB`).toBeGreaterThanOrEqual(4.5)
  }
})
