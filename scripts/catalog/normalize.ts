import { z } from 'zod'
import { compare, date, dex, unique } from './model.ts'
import type { Catalogue, Card, Diagnostic } from './model.ts'
import type { Source } from './reader.ts'
import { numberParts, rankCards } from './order.ts'
import { variantKey, variants } from './variants.ts'

export function reliableDate(value: unknown): string | null {
  const candidate = typeof value === 'object' && value !== null && 'fr' in value ? value.fr : value
  const parsed = date.safeParse(candidate)
  return parsed.success ? parsed.data : null
}
export function effectiveDate(card: unknown, product: unknown, set: unknown): Pick<Card, 'date' | 'dateOrigin'> {
  for (const [value, origin] of [[card, 'card'], [product, 'product'], [set, 'set']] as const) {
    const parsed = reliableDate(value)
    if (parsed) return { date: parsed, dateOrigin: origin }
  }
  return { date: null, dateOrigin: 'unknown' }
}
export function assetSegment(value: string): string {
  // Some upstream filenames already encode characters, notably Unown %3F.ts.
  try { return encodeURIComponent(decodeURIComponent(value)) } catch { return encodeURIComponent(value) }
}
export function normalize(source: Source): Catalogue {
  const diagnostics: Diagnostic[] = [...(source.diagnostics ?? [])]
  const catalogue: Catalogue = { series: [], sets: [], cards: [], diagnostics, overrides: [],
    counters: { source_series: source.series.length, source_sets: source.sets.length, source_cards_fr: source.cards.length,
      source_variants: 0, jumbo_ignored: 0, jumbo_sets_ignored: source.sets.filter((set) => set.id === 'jumbo').length,
      pocket_cards_ignored: source.pocket, cameo_cards_ignored: 0 } }
  catalogue.series = source.series.map((serie) => ({ key: serie.id, name: serie.name.fr ?? null,
    sourceName: serie.name.en ?? null, rank: 0, active: true }))
  catalogue.sets = source.sets.filter((set) => set.id !== 'jumbo').map((set) => ({ key: set.id, series: set.serie.id, name: set.name.fr ?? null,
    sourceName: set.name.en ?? null, abbreviation: set.abbreviations?.official ?? null, abbreviationFr: set.abbreviations?.fr ?? null,
    date: reliableDate(set.releaseDate), count: set.cardCount.official, rank: 0, active: true,
    logo: `https://assets.tcgdex.net/fr/${encodeURIComponent(set.serie.id)}/${encodeURIComponent(set.id)}/logo.webp`,
    symbol: `https://assets.tcgdex.net/univ/${encodeURIComponent(set.serie.id)}/${encodeURIComponent(set.id)}/symbol.webp` }))
  const sets = new Map(catalogue.sets.map((set) => [set.key, set]))
  catalogue.cards = source.cards.filter((card) => card.set.id !== 'jumbo').map((raw) => {
    const id = `${raw.set.id}-${raw.localId}`, key = `tcgdex:${id}`
    const result = variants(raw.variants, key, diagnostics, source.translations)
    catalogue.counters.source_variants = (catalogue.counters.source_variants ?? 0) + result.count
    catalogue.counters.jumbo_ignored = (catalogue.counters.jumbo_ignored ?? 0) + result.jumbo
    if (raw.cameoDexIds?.length) catalogue.counters.cameo_cards_ignored = (catalogue.counters.cameo_cards_ignored ?? 0) + 1
    if (numberParts(raw.localId).group === 2) diagnostics.push({ code: 'atypical-number', target: id, detail: raw.localId })
    const dates = effectiveDate(raw.releaseDate, null, sets.get(raw.set.id)?.date)
    if (!dates.date) diagnostics.push({ code: 'unknown-date', target: id, detail: 'No reliable card/product/set French or global date.' })
    return { key, sourceId: id, localId: raw.localId, set: raw.set.id, name: raw.name.fr ?? null,
      category: raw.category ? source.translations.category?.[raw.category] ?? raw.category : null,
      rarity: raw.rarity ? source.translations.rarity?.[raw.rarity] ?? raw.rarity : null,
      image: `https://assets.tcgdex.net/fr/${assetSegment(raw.set.serie.id)}/${assetSegment(raw.set.id)}/${assetSegment(raw.localId)}/high.webp`,
      ...dates, sourceUpdated: null, dex: [...new Set(z.array(dex).parse(raw.dexId ?? []))].sort((a, b) => a - b),
      rank: 0, origin: 'tcgdex', present: true, active: true, variants: result.values } satisfies Card
  })
  for (const set of catalogue.sets) {
    if (!catalogue.cards.some((card) => card.set === set.key)) diagnostics.push({ code: 'empty-french-set', target: set.key, detail: 'French set metadata exists; no French card references it in this snapshot.' })
    if (!set.name) diagnostics.push({ code: 'missing-set-name-fr', target: set.key, detail: 'French cards reference a set with no French name.' })
  }
  catalogue.sets.sort((a, b) => compare(a.date ?? '9999-12-31', b.date ?? '9999-12-31') || compare(a.key, b.key))
    .forEach((set, index) => { set.rank = index + 1 })
  const firstSet = (key: string): number => catalogue.sets.find((set) => set.series === key)?.rank ?? Number.MAX_SAFE_INTEGER
  catalogue.series.sort((a, b) => firstSet(a.key) - firstSet(b.key) || compare(a.key, b.key))
    .forEach((serie, index) => { serie.rank = index + 1 })
  rankCards(catalogue.cards)
  return catalogue
}
export function validateCatalogue(catalogue: Catalogue): void {
  if (!catalogue.sets.length || !catalogue.cards.length) throw new Error('Empty French catalogue refused')
  unique(catalogue.series, (item) => item.key, 'series')
  unique(catalogue.sets, (item) => item.key, 'set')
  unique(catalogue.cards, (item) => item.key, 'card')
  const series = new Set(catalogue.series.map((item) => item.key)), sets = new Set(catalogue.sets.map((item) => item.key))
  for (const set of catalogue.sets) {
    if (!series.has(set.series)) throw new Error(`Missing series: ${set.key}`)
    if (set.date) date.parse(set.date)
  }
  for (const card of catalogue.cards) {
    if (!sets.has(card.set)) throw new Error(`Missing set: ${card.key}`)
    if (card.date) date.parse(card.date)
    z.array(dex).parse(card.dex)
    unique(card.variants, (item) => item.identity, `variant of ${card.key}`)
    unique(card.variants.filter((item) => item.sourceId), (item) => item.sourceId ?? '', `source variant of ${card.key}`)
    for (const variant of card.variants) {
      if (variant.size !== 'standard' || variant.identity !== variantKey(variant)) throw new Error(`Invalid variant identity: ${variant.key}`)
      if (variant.sourceId === 'generated') throw new Error('Generic source ID refused')
    }
  }
}
