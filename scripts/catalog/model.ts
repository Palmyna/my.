import { createHash } from 'node:crypto'
import { z } from 'zod'

export const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
export const hash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex')
export const text = z.string().trim().min(1)
export const date = z.iso.date()
export const availability = z.enum(['confirmed', 'unknown', 'unavailable'])
export const dex = z.number().int().positive().max(2_147_483_647)
export const properties = z.strictObject({
  type: text, subtype: text.nullable().default(null), size: z.enum(['standard', 'jumbo']).default('standard'),
  stamp: z.array(text).default([]), foil: text.nullable().default(null),
})
export type Properties = z.infer<typeof properties>
export interface Variant extends Properties {
  key: string
  identity: string
  sourceId: string | null
  label: string
  image: string | null
  availability: z.infer<typeof availability>
  origin: 'tcgdex' | 'my'
  present: boolean
  active: boolean
  rank: number
  alias: boolean
}
export interface Series {
  key: string; name: string | null; sourceName: string | null; rank: number; active: boolean
}
export interface SetRecord {
  key: string; series: string; name: string | null; sourceName: string | null
  abbreviation: string | null; abbreviationFr: string | null; date: string | null
  count: number | null; rank: number; logo: string | null; symbol: string | null; active: boolean
}
export interface Card {
  key: string; sourceId: string | null; localId: string; set: string; name: string | null
  category: string | null; rarity: string | null; image: string | null; date: string | null
  dateOrigin: 'card' | 'product' | 'set' | 'override' | 'unknown'
  sourceUpdated: string | null; dex: number[]; rank: number; origin: 'tcgdex' | 'my'
  present: boolean; active: boolean; variants: Variant[]
}
export interface Diagnostic { code: string; target: string; detail: string }
export interface OverrideTrace {
  id: string; reason: string; action: string; target: unknown; before: unknown; after: unknown; redundant: boolean
}
export interface Catalogue {
  series: Series[]; sets: SetRecord[]; cards: Card[]
  diagnostics: Diagnostic[]; counters: Record<string, number>; overrides: OverrideTrace[]
}
export interface Snapshot { repository: string; sha: string; committedAt: string; directory: string }

export function unique<T>(items: T[], key: (item: T) => string, label: string): void {
  const keys = new Set<string>()
  for (const item of items) {
    const value = key(item)
    if (keys.has(value)) throw new Error(`Duplicate ${label}: ${value}`)
    keys.add(value)
  }
}
