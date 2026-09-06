import { compare } from './model.ts'
import type { Card, Properties } from './model.ts'

export function numberParts(value: string): { group: number; prefix: string; number: bigint; suffix: string; original: string } {
  const normalized = value.trim().normalize('NFC').toUpperCase()
  const match = /^([A-Z]*)(\d+)([A-Z]*)$/.exec(normalized)
  if (!match) return { group: 2, prefix: normalized, number: 0n, suffix: '', original: value }
  return { group: match[1] ? 1 : 0, prefix: match[1] ?? '', number: BigInt(match[2] ?? '0'), suffix: match[3] ?? '', original: value }
}
export function compareNumbers(a: string, b: string): number {
  const x = numberParts(a), y = numberParts(b)
  return x.group - y.group || compare(x.prefix, y.prefix) || (x.number < y.number ? -1 : x.number > y.number ? 1 : 0)
    || compare(x.suffix, y.suffix) || compare(x.original, y.original)
}
function macro(v: Properties): number {
  const stamped = Number(v.stamp.length > 0), foil = Number(v.foil !== null)
  if (v.type === 'normal') return stamped
  if (v.type === 'holo') return 2 + foil * 2 + stamped
  if (v.type === 'reverse') return 6 + foil * 2 + stamped
  return 10
}
// The two ball foils have an explicitly validated order; future values use canonical text.
const foilKey = (foil: string | null): string => foil === 'pokeball' ? '0' : foil === 'masterball' ? '1' : `2:${foil ?? ''}`
export function compareVariants(a: Properties, b: Properties): number {
  return macro(a) - macro(b) || compare(a.type, b.type) || compare(foilKey(a.foil), foilKey(b.foil))
    || compare(a.stamp.join('\0'), b.stamp.join('\0')) || compare(a.subtype ?? '', b.subtype ?? '') || compare(a.size, b.size)
}
export function rankCards(cards: Card[]): void {
  const sets = new Map<string, Card[]>()
  for (const card of cards) {
    const group = sets.get(card.set) ?? []; group.push(card); sets.set(card.set, group)
    card.variants.sort((a, b) => compareVariants(a, b) || compare(a.identity, b.identity))
    card.variants.forEach((variant, index) => { variant.rank = index + 1 })
  }
  for (const group of sets.values()) group.sort((a, b) => compareNumbers(a.localId, b.localId) || compare(a.key, b.key))
    .forEach((card, index) => { card.rank = index + 1 })
}
