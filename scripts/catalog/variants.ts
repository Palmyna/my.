import { z } from 'zod'
import { canonical, compare, properties } from './model.ts'
import type { Diagnostic, Properties, Variant } from './model.ts'

export function normalizeProperties(input: z.input<typeof properties>): Properties {
  const value = properties.parse({ type: input.type, subtype: input.subtype, size: input.size, stamp: input.stamp, foil: input.foil })
  return { ...value, stamp: [...new Set(value.stamp)].sort(compare) }
}
export function variantKey(input: z.input<typeof properties>): string {
  const v = normalizeProperties(input)
  return `v1:${JSON.stringify([v.type, v.subtype, v.size, v.stamp, v.foil])}`
}
/** Upstream variantUtil.ts at the audited snapshot: English values, sorted keys, base-31 bigint. */
export function sourceVariantId(input: Properties, hasStamp: boolean): string {
  const values = { type: input.type, subtype: input.subtype, size: input.size, stamp: hasStamp ? input.stamp : null, foil: input.foil }
  const string = Object.entries(values).filter(([, value]) => value !== null).sort(([a], [b]) => compare(a, b))
    .map(([, value]) => Array.isArray(value) ? value.join('') : value).join('|')
  let id = 0n
  for (let i = 0; i < string.length; i++) id = id * 31n + BigInt(string.charCodeAt(i))
  return id.toString(36)
}
const detailed = properties.extend({ languages: z.array(z.string()).optional(), thirdParty: z.unknown().optional() })
const legacy = z.strictObject({ normal: z.boolean().optional(), holo: z.boolean().optional(), reverse: z.boolean().optional(),
  firstEdition: z.boolean().optional(), preRelease: z.boolean().optional(), wPromo: z.boolean().optional(), jumbo: z.boolean().optional() })

export function label(v: Properties, translations: Record<string, Record<string, string>> = {}): string {
  const translate = (group: string, value: string): string => translations[group]?.[value] ?? value.charAt(0).toUpperCase() + value.slice(1)
  return [translate('variantType', v.type), v.foil && translate('variantFoil', v.foil),
    ...v.stamp.map((stamp) => translate('variantStamp', stamp)), v.subtype && translate('variantSubtype', v.subtype)].filter(Boolean).join(' ')
}
export function variants(input: unknown, card: string, diagnostics: Diagnostic[], translations: Record<string, Record<string, string>> = {}): { values: Variant[]; jumbo: number; count: number } {
  let raw: { value: Properties; languages?: string[]; sourceId: string | null; ambiguous: boolean }[]
  let jumbo = 0
  if (Array.isArray(input)) {
    raw = input.map((item: unknown) => {
      const parsed = detailed.parse(item)
      const value = normalizeProperties(parsed)
      return { value, ...(parsed.languages === undefined ? {} : { languages: parsed.languages }),
        sourceId: sourceVariantId(value, typeof item === 'object' && item !== null && 'stamp' in item), ambiguous: false }
    })
  } else {
    const old = legacy.parse(input ?? {})
    raw = []
    const add = (type: string, stamp: string[] = [], ambiguous = false): void => {
      raw.push({ value: normalizeProperties({ type, stamp }), sourceId: null, ambiguous })
    }
    for (const type of ['normal', 'holo', 'reverse'] as const) {
      if (old[type] ?? type === 'normal') {
        add(type)
        if (old.firstEdition) add(type, ['1st-edition'])
        if (type === 'normal' && old.wPromo) add(type, ['w-promo'])
      }
    }
    if (old.preRelease) {
      diagnostics.push({ code: 'legacy-pre-release', target: card, detail: 'Legacy stamp does not identify the underlying finish; explicit override required.' })
      // No unproven type/stamp combination is manufactured.
    }
    if (old.jumbo) jumbo++
  }
  if (raw.length === 0) diagnostics.push({ code: 'no-variants', target: card, detail: 'Explicit definition has no collectible variants.' })
  const values: Variant[] = []
  for (const entry of raw) {
    if (entry.value.size === 'jumbo') { jumbo++; continue }
    const identity = variantKey(entry.value)
    const variant: Variant = { ...entry.value, identity, key: `${card}#${identity}`, sourceId: entry.sourceId,
      label: label(entry.value, translations), image: null, availability: entry.ambiguous ? 'unknown'
        : entry.languages === undefined || entry.languages.includes('fr') ? 'confirmed' : 'unavailable',
      origin: 'tcgdex', present: true, active: true, rank: 0, alias: false }
    const repeated = values.find((item) => item.identity === identity)
    if (repeated) {
      if (canonical(repeated) !== canonical(variant)) throw new Error(`Conflicting source variant definitions: ${card} ${identity}`)
      diagnostics.push({ code: 'repeated-source-variant', target: card, detail: identity })
    } else values.push(variant)
  }
  return { values, jumbo, count: raw.length + (Array.isArray(input) ? 0 : jumbo) }
}
