/** Portable search rules: no Node, SQL, network or terminal dependencies. */
export interface CatalogSearchEntry {
  id: string
  card: string
  tcgdexId: string | null
  name: string | null
  localId: string
  isActive: boolean
  pokemon: readonly { dexNumber: number; name: string | null }[]
  set: { tcgdexId: string; name: string | null; abbreviation: string | null; abbreviationFr: string | null; officialCardCount: number | null }
  variantCount: number
}
export type SearchField = 'cardName' | 'pokemonName' | 'number' | 'setName' | 'abbreviation' | 'identifier'
export interface CatalogSearchMatch { term: string; field: SearchField; kind: 'exact' | 'word' | 'prefix' | 'partial'; score: number }
export interface CatalogSearchResult { entry: CatalogSearchEntry; score: number; matches: CatalogSearchMatch[] }
export interface CatalogSearchResponse { query: string; terms: string[]; total: number; results: CatalogSearchResult[] }
export class CatalogSearchQueryError extends Error {}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[’‘]/g, "'").replace(/[‐‑‒–—−]/g, '-').replace(/\s+/gu, ' ').trim()
}
export function tokenizeSearchQuery(query: string): string[] {
  // Keep technical IDs and fractions intact; punctuation between ordinary words is a separator.
  const terms = [...new Set(normalizeSearchText(query).split(/[^\p{L}\p{N}.:/\-♀♂]+/u).filter((term) => /[\p{L}\p{N}]/u.test(term)))]
  if (!terms.length) throw new CatalogSearchQueryError('La recherche doit contenir au moins un nom, numéro ou identifiant.')
  return terms
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const integerText = (value: string): string => value.replace(/^0+(?=\d)/, '')

function numericMatch(localId: string, officialCount: number | null, term: string): CatalogSearchMatch | null {
  const [numerator = '', denominator] = term.split('/')
  if (denominator !== undefined && (officialCount === null || integerText(denominator) !== String(officialCount))) return null
  const wanted = integerText(numerator), parts = /^([a-z]*)(\d+)([a-z]*)$/.exec(localId)
  if (!parts) return null
  const number = integerText(parts[2]!), plain = parts[1] === '' && parts[3] === ''
  if (number === wanted) return { term, field: 'number', kind: 'exact', score: plain ? 200 : 160 }
  if (denominator === undefined && number.startsWith(wanted)) return { term, field: 'number', kind: 'prefix', score: 80 }
  return null
}

const exactWeights: Record<SearchField, number> = { cardName: 120, pokemonName: 110, number: 100, setName: 90, abbreviation: 85, identifier: 80 }
function textMatch(value: string, term: string, field: SearchField): CatalogSearchMatch | null {
  if (!value) return null
  if (value === term) return { term, field, kind: 'exact', score: exactWeights[field] }
  const words: string[] = value.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.includes(term)) return { term, field, kind: 'word', score: 60 }
  if (value.startsWith(term) || words.some((word) => word.startsWith(term))) return { term, field, kind: 'prefix', score: 40 }
  if (value.includes(term)) return { term, field, kind: 'partial', score: 15 }
  return null
}

function scoreEntry(entry: CatalogSearchEntry, terms: readonly string[]): CatalogSearchResult | null {
  const fields: { field: SearchField; value: string }[] = [
    { field: 'cardName', value: entry.name ?? '' },
    ...entry.pokemon.map((pokemon) => ({ field: 'pokemonName' as const, value: pokemon.name ?? '' })),
    { field: 'number', value: entry.localId }, { field: 'setName', value: entry.set.name ?? '' },
    { field: 'abbreviation', value: entry.set.abbreviationFr ?? '' }, { field: 'abbreviation', value: entry.set.abbreviation ?? '' },
    { field: 'identifier', value: entry.card }, { field: 'identifier', value: entry.tcgdexId ?? '' },
    { field: 'identifier', value: entry.set.tcgdexId },
  ]
  for (const item of fields) item.value = normalizeSearchText(item.value)
  const localId = normalizeSearchText(entry.localId), matches: CatalogSearchMatch[] = []
  for (const term of terms) {
    let best: CatalogSearchMatch | null = null
    if (/^\d+(?:\/\d+)?$/.test(term)) best = numericMatch(localId, entry.set.officialCardCount, term)
    else for (const { field, value } of fields) {
      const match = textMatch(value, term, field)
      if (match && (!best || match.score > best.score)) best = match
    }
    // AND across terms, allowing different fields and different real Pokemon relations.
    if (!best) return null
    matches.push(best)
  }
  const phrase = terms.join(' ')
  const exactBonus = Math.max(0, ...fields.filter(({ value }) => value === phrase).map(({ field }) => exactWeights[field]))
  return { entry, matches, score: matches.reduce((sum, match) => sum + match.score, 0) + exactBonus }
}

export function searchCatalog(entries: readonly CatalogSearchEntry[], query: string, options: { limit?: number } = {}): CatalogSearchResponse {
  const terms = tokenizeSearchQuery(query), limit = options.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new CatalogSearchQueryError('La limite doit être un entier entre 1 et 100.')
  const results: CatalogSearchResult[] = []
  for (const entry of entries) {
    const result = scoreEntry(entry, terms)
    if (result) results.push(result)
  }
  // A complete deterministic ordering, independent of SQL order and the system locale.
  results.sort((a, b) => b.score - a.score
    || compare(normalizeSearchText(a.entry.name ?? ''), normalizeSearchText(b.entry.name ?? ''))
    || compare(normalizeSearchText(a.entry.set.name ?? ''), normalizeSearchText(b.entry.set.name ?? ''))
    || compare(normalizeSearchText(a.entry.localId), normalizeSearchText(b.entry.localId))
    || compare(a.entry.tcgdexId ?? a.entry.card, b.entry.tcgdexId ?? b.entry.card)
    || compare(a.entry.id, b.entry.id))
  return { query, terms, total: results.length, results: results.slice(0, limit) }
}
