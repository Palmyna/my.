import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { availability, canonical, compare, date, dex, hash, properties, text, unique } from './model.ts'
import type { Card, Catalogue, Variant } from './model.ts'
import { label, normalizeProperties, variantKey } from './variants.ts'
import { rankCards } from './order.ts'

const base = { id: text.regex(/^[a-z0-9][a-z0-9._-]*$/), reason: text }
const cardPatch = z.strictObject({ name: text.nullable().optional(), category: text.nullable().optional(), rarity: text.nullable().optional(),
  image: z.url().nullable().optional(), date: date.nullable().optional(), active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0)
// Patch fields deliberately have no defaults: omitted properties must remain unchanged.
const variantPatch = z.strictObject({ type: text.optional(), subtype: text.nullable().optional(),
  size: z.enum(['standard', 'jumbo']).optional(), stamp: z.array(text).optional(), foil: text.nullable().optional(),
  label: text.optional(), image: z.url().nullable().optional(),
  availability: availability.optional(), active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0)
const newVariant = properties.extend({ label: text.optional(), image: z.url().nullable().default(null), availability,
  active: z.boolean().default(true) }).refine((v) => v.size === 'standard', 'Jumbo is outside MY.')
export const overrideSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...base, action: z.literal('card.patch'), card: text, patch: cardPatch }),
  z.strictObject({ ...base, action: z.literal('card.add'), card: z.strictObject({ set: text, localId: text, name: text,
    category: text.nullable().default(null), rarity: text.nullable().default(null), image: z.url().nullable().default(null),
    date: date.nullable(), dex: z.array(dex).default([]), active: z.boolean().default(true), variants: z.array(newVariant).min(1) }) }),
  z.strictObject({ ...base, action: z.literal('variant.patch'), card: text, key: text, patch: variantPatch }),
  z.strictObject({ ...base, action: z.literal('variant.add'), card: text, variant: newVariant }),
  z.strictObject({ ...base, action: z.literal('mapping.include'), card: text, dex }),
  z.strictObject({ ...base, action: z.literal('mapping.exclude'), card: text, dex }),
])
export type Override = z.infer<typeof overrideSchema>
export function parseOverrides(value: unknown): Override[] {
  const overrides = z.array(overrideSchema).parse(value)
  unique(overrides, (item) => item.id, 'override ID')
  return overrides.sort((a, b) => compare(a.id, b.id))
}
export function loadOverrides(directory: string): { values: Override[]; hash: string } {
  const entries: unknown[] = []
  for (const file of readdirSync(directory).filter((file) => file.endsWith('.json')).sort(compare)) {
    const parsed: unknown = JSON.parse(readFileSync(path.join(directory, file), 'utf8'))
    entries.push(...z.array(z.unknown()).parse(parsed))
  }
  const values = parseOverrides(entries)
  return { values, hash: hash(values) }
}
function localVariant(input: z.infer<typeof newVariant>, key: string): Variant {
  const props = normalizeProperties(input)
  return { ...props, identity: variantKey(props), key, sourceId: null, label: input.label ?? label(props), image: input.image,
    availability: input.availability, origin: 'my', present: false, active: input.active, rank: 0, alias: true }
}
export function applyOverrides(input: Catalogue, overrides: Override[]): Catalogue {
  const result = structuredClone(input)
  const cards = new Map(result.cards.map((card) => [card.key, card]))
  const touched = new Set<string>()
  const claim = (key: string): void => {
    if (touched.has(key)) throw new Error(`Conflicting overrides: ${key}`)
    touched.add(key)
  }
  // Explicit dependency order permits patches/mappings on a locally added card.
  const ordered = [...overrides].sort((a, b) => Number(b.action === 'card.add') - Number(a.action === 'card.add')
    || Number(b.action === 'variant.add') - Number(a.action === 'variant.add') || compare(a.id, b.id))
  for (const override of ordered) {
    let before: unknown = null, after: unknown, target: unknown
    if (override.action === 'card.add') {
      const key = `my:${override.id}`
      if (cards.has(key)) throw new Error(`Existing local card: ${key}`)
      if (!result.sets.some((set) => set.key === override.card.set)) throw new Error(`Unknown set: ${override.card.set}`)
      const card: Card = { ...override.card, key, sourceId: null, sourceUpdated: null,
        dateOrigin: override.card.date ? 'override' : 'unknown', origin: 'my', present: false, rank: 0,
        variants: override.card.variants.map((v) => localVariant(v, `${key}#${variantKey(v)}`)) }
      cards.set(key, card); result.cards.push(card); target = key; after = card
    } else {
      const card = cards.get(override.card)
      if (!card) throw new Error(`Unknown override card: ${override.card}`)
      target = override.card
      if (override.action === 'card.patch') {
        before = Object.fromEntries(Object.keys(override.patch).map((field) => [field, card[field as keyof Card]]))
        for (const field of Object.keys(override.patch)) claim(`${card.key}:${field}`)
        Object.assign(card, override.patch)
        if ('date' in override.patch) card.dateOrigin = 'override'
        after = override.patch
      } else if (override.action === 'variant.add') {
        const variant = localVariant(override.variant, `my:${override.id}`)
        if (card.variants.some((v) => v.identity === variant.identity)) throw new Error(`Duplicate added variant: ${card.key} ${variant.identity}`)
        card.variants.push(variant); after = variant
      } else if (override.action === 'variant.patch') {
        // The selector always names the source identity (or my:<add-override-id>), not a translated label.
        const variant = card.variants.find((v) => v.key === `${card.key}#${override.key}` || v.key === override.key)
        if (!variant) throw new Error(`Unknown override variant: ${card.key} ${override.key}`)
        target = { card: card.key, key: override.key }
        before = Object.fromEntries(Object.keys(override.patch).map((field) => [field, variant[field as keyof Variant]]))
        for (const field of Object.keys(override.patch)) claim(`${variant.key}:${field}`)
        Object.assign(variant, override.patch)
        Object.assign(variant, normalizeProperties(variant))
        variant.identity = variantKey(variant)
        variant.alias = true
        if (!('label' in override.patch) && ['type', 'subtype', 'foil', 'stamp'].some((key) => key in override.patch)) variant.label = label(variant)
        after = Object.fromEntries(Object.keys(override.patch).map((field) => [field, variant[field as keyof Variant]]))
      } else {
        claim(`${card.key}:dex:${override.dex}`)
        before = card.dex.includes(override.dex)
        if (override.action === 'mapping.include') card.dex = [...new Set([...card.dex, override.dex])]
        else card.dex = card.dex.filter((number) => number !== override.dex)
        after = card.dex.includes(override.dex); target = { card: card.key, dex: override.dex }
      }
    }
    result.overrides.push({ id: override.id, reason: override.reason, action: override.action, target,
      before: structuredClone(before), after: structuredClone(after), redundant: canonical(before) === canonical(after) })
  }
  for (const card of result.cards) card.dex.sort((a, b) => a - b)
  rankCards(result.cards)
  return result
}
