import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSearchText, searchCatalog, tokenizeSearchQuery } from './search-catalog.ts'
import type { CatalogSearchEntry } from './search-catalog.ts'
import { connect } from './database.ts'
import { loadCatalogSearchEntries } from './search-catalog-db.ts'
import { findDisplayRows, parseFindArgs, runCatalogFind } from './catalog-find.ts'

vi.mock('./database.ts', () => ({ connect: vi.fn() }))

const entry = (patch: Partial<CatalogSearchEntry> = {}): CatalogSearchEntry => ({
  id: '1', card: 'tcgdex:sm3.5-28', tcgdexId: 'sm3.5-28', name: 'Pikachu', localId: '28', isActive: true,
  pokemon: [{ dexNumber: 25, name: 'Pikachu' }], variantCount: 5,
  set: { tcgdexId: 'sm3.5', name: 'Légendes Brillantes', abbreviation: 'SLG', abbreviationFr: 'SL3.5', officialCardCount: 73 }, ...patch,
})
const cards = (values: CatalogSearchEntry[], query: string) => searchCatalog(values, query).results.map(({ entry }) => entry.card)
function database(rows: unknown[] = [entry()]) {
  const client = {
    query: vi.fn<(sql: string) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows }),
    end: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
  vi.mocked(connect).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof connect>>)
  return client
}
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('portable catalogue search', () => {
  it.each(['Légendes', 'legendes', 'LÉGENDES', 'Légendes', 'ＬＥＧＥＮＤＥＳ'])('matches case, accents and Unicode: %s', (term) => {
    expect(cards([entry()], `${term} brillantes`)).toEqual(['tcgdex:sm3.5-28'])
  })
  it('normalizes spaces, ligatures and punctuation without changing the displayed source', () => {
    expect(normalizeSearchText('  ŒUF\tÉvoli\nCœur  ')).toBe('oeuf evoli coeur')
    expect(tokenizeSearchQuery('  PIKACHU, Pikachu   Légendes  ')).toEqual(['pikachu', 'legendes'])
    const source = entry({ name: 'Évoli — Cœur d’Or' }), before = structuredClone(source)
    const result = searchCatalog([source], "evoli coeur d'or")
    expect(result.total).toBe(1)
    expect(source).toEqual(before)
    expect(result.results[0]?.entry.name).toBe('Évoli — Cœur d’Or')
  })
  it('requires every term across the same card instead of OR across unrelated cards', () => {
    const wrongSet = entry({ card: 'tcgdex:other-28', set: { ...entry().set, name: 'Autre set' } })
    const wrongPokemon = entry({ card: 'tcgdex:sm3.5-29', name: 'Raichu', pokemon: [{ dexNumber: 26, name: 'Raichu' }] })
    expect(cards([wrongSet, wrongPokemon, entry()], 'Pikachu Légendes Brillantes')).toEqual(['tcgdex:sm3.5-28'])
  })
  it('prefers the actual card number, then prefixed/suffixed numbers, then a numeric prefix', () => {
    const numbered = (number: string) => entry({ localId: number, card: `tcgdex:fixture-${number}`, tcgdexId: `fixture-${number}` })
    const values = ['128', '280', 'TG28', '28A', '28'].map(numbered)
    values.push(entry({ localId: '99', name: 'Pikachu 28', card: 'tcgdex:set28-99', tcgdexId: 'set28-99' }))
    values.push(entry({ localId: '28', card: 'tcgdex:unrelated-28', name: 'Raichu', pokemon: [{ dexNumber: 26, name: 'Raichu' }] }))
    const result = searchCatalog(values, 'Pikachu 28')
    expect(result.results.map(({ entry }) => entry.localId)).toEqual(['28', '28A', 'TG28', '280'])
    expect(result.results[0]?.matches).toContainEqual({ term: '28', field: 'number', kind: 'exact', score: 200 })
  })
  it('accepts leading zeroes and a real denominator without matching the denominator alone', () => {
    expect(cards([entry()], 'Pikachu 028')).toEqual(['tcgdex:sm3.5-28'])
    expect(cards([entry()], 'Pikachu 28/73')).toEqual(['tcgdex:sm3.5-28'])
    expect(cards([entry()], 'Pikachu 28/74')).toEqual([])
    expect(cards([entry()], 'Pikachu 73')).toEqual([])
    expect(cards([entry({ localId: 'TG028' })], 'Pikachu 28')).toEqual(['tcgdex:sm3.5-28'])
  })
  it.each(['SLG Pikachu', 'SL3.5 28', 'sm3.5-28', 'tcgdex:sm3.5-28', 'sm3.5 Pikachu'])('searches abbreviations and technical identifiers: %s', (query) => {
    expect(cards([entry()], query)).toEqual(['tcgdex:sm3.5-28'])
  })
  it('uses every actual Pokemon relationship, without inferring or adding one from the card name', () => {
    const multi = entry({ name: 'Alliance GX', pokemon: [{ dexNumber: 25, name: 'Pikachu' }, { dexNumber: 644, name: 'Zekrom' }] })
    expect(cards([multi], 'Pikachu Zekrom')).toEqual(['tcgdex:sm3.5-28'])
    expect(findDisplayRows(searchCatalog([multi], 'Pikachu Zekrom'))[0]?.Pokémon).toBe('Pikachu, Zekrom')
    expect(cards([entry({ name: 'Alliance GX' })], 'Pikachu Zekrom')).toEqual([])
    const namedOnly = entry({ name: 'Zekrom GX', pokemon: [] })
    expect(searchCatalog([namedOnly], 'Zekrom').results[0]?.matches[0]?.field).toBe('cardName')
    expect(findDisplayRows(searchCatalog([namedOnly], 'Zekrom'))[0]?.Pokémon).toBe('—')
  })
  it('ranks exact names ahead of exact set names, prefixes and partial matches', () => {
    const variant = (id: string, name: string, pokemon: CatalogSearchEntry['pokemon'], setName = 'Autre') => entry({
      id, card: `tcgdex:test-${id}`, tcgdexId: `test-${id}`, name, pokemon, set: { ...entry().set, name: setName },
    })
    const values = [variant('5', 'xxPikachuyy', []), variant('4', 'Pikachux', []), variant('3', 'Autre', [], 'Pikachu'),
      variant('2', 'Alliance GX', [{ dexNumber: 25, name: 'Pikachu' }]), variant('1', 'Pikachu', [])]
    expect(searchCatalog(values, 'Pikachu').results.map(({ entry }) => entry.id)).toEqual(['1', '2', '3', '4', '5'])
  })
  it('finds card suffixes and useful combinations such as Raichu GX and Évoli Promo', () => {
    expect(cards([entry({ name: 'Raichu-GX', pokemon: [{ dexNumber: 26, name: 'Raichu' }] })], 'Raichu GX')).toHaveLength(1)
    expect(cards([entry({ name: 'Évoli', set: { ...entry().set, name: 'Promos Soleil et Lune' } })], 'evoli promo')).toHaveLength(1)
  })
  it('uses a deterministic complete tie-break and does not mutate entries or their order', () => {
    const values = ['b', 'a', 'c'].map((key, i) => entry({ id: String(i + 1), card: `tcgdex:${key}`, tcgdexId: key }))
    const before = structuredClone(values), forward = searchCatalog(values, 'Pikachu')
    expect(searchCatalog([...values].reverse(), 'Pikachu')).toEqual(forward)
    expect(values).toEqual(before)
  })
  it('counts all matches before applying the default or explicit limit', () => {
    const values = Array.from({ length: 25 }, (_, index) => entry({ id: String(index + 1), card: `tcgdex:fixture-${index}`, tcgdexId: `fixture-${index}` }))
    expect(searchCatalog(values, 'Pikachu')).toMatchObject({ total: 25, results: Array(20).fill(expect.anything()) })
    expect(searchCatalog(values, 'Pikachu', { limit: 2 }).results).toHaveLength(2)
  })
  it('returns an empty success response for an absent term and handles nullable data', () => {
    expect(searchCatalog([entry()], 'Pikachu SérieQuiNExistePas').total).toBe(0)
    expect(searchCatalog([], 'Pikachu').results).toEqual([])
    const missing = entry({ name: null, pokemon: [{ dexNumber: 25, name: null }], set: { ...entry().set, name: null, officialCardCount: null } })
    expect(findDisplayRows(searchCatalog([missing], '28'))[0]).toMatchObject({ Nom: '—', Pokémon: '#25', Set: 'sm3.5', 'N°': '28' })
  })
  it('keeps a real local selector and inactive state visible for maintenance', () => {
    const local = entry({ card: 'my:local-variant-owner', tcgdexId: null, isActive: false })
    expect(findDisplayRows(searchCatalog([local], 'my:local-variant-owner'))[0]).toMatchObject({ Card: 'my:local-variant-owner', État: 'inactive' })
  })
  it.each(['', '   ', ' , & !! '])('rejects empty or meaningless queries: %s', (query) => {
    expect(() => searchCatalog([entry()], query)).toThrow()
  })
  it.each([0, -1, 1.5, 101, NaN])('rejects invalid limit %s', (limit) => {
    expect(() => searchCatalog([entry()], 'Pikachu', { limit })).toThrow()
  })
})

describe('local read adapter and maintenance CLI', () => {
  it('reads through the existing connector in a read-only transaction, then closes it', async () => {
    const client = database()
    expect(await loadCatalogSearchEntries()).toEqual([entry()])
    expect(connect).toHaveBeenCalledExactlyOnceWith()
    expect(client.query.mock.calls[0]).toEqual(['begin isolation level repeatable read read only'])
    expect(client.query.mock.calls.at(-1)).toEqual(['rollback'])
    expect(client.end).toHaveBeenCalledTimes(1)
  })
  it('cleans up and returns a safe diagnostic if a SELECT or data validation fails', async () => {
    const client = database([{ ...entry(), card: null }])
    await expect(loadCatalogSearchEntries()).rejects.toThrow('Lecture du catalogue local impossible')
    expect(client.query.mock.calls.at(-1)).toEqual(['rollback'])
    expect(client.end).toHaveBeenCalledTimes(1)
    client.query.mockRejectedValueOnce(new Error('private-driver-secret'))
    await expect(loadCatalogSearchEntries()).rejects.toThrow('Lecture du catalogue local impossible')
  })
  it('shows the copyable selector, original French text, denominator and actual variant count', async () => {
    database()
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined), table = vi.spyOn(console, 'table').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu Légendes Brillantes'])).toBe(0)
    expect(table).toHaveBeenCalledExactlyOnceWith([{ Card: 'tcgdex:sm3.5-28', Nom: 'Pikachu', Pokémon: 'Pikachu', Set: 'Légendes Brillantes', 'N°': '28/73', Variantes: 5 }])
    expect(output).toHaveBeenCalledWith('1 résultat affiché sur 1.')
  })
  it('returns exit 0 with a clear message when nothing matches', async () => {
    database()
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu SérieQuiNExistePas'])).toBe(0)
    expect(output).toHaveBeenCalledExactlyOnceWith('Aucun résultat pour "Pikachu SérieQuiNExistePas".')
  })
  it.each([[], [' '], ['Pikachu', '28'], ['Pikachu', '--unknown'], ['Pikachu', '--limit', '0'], ['Pikachu', '--limit', '2x']].map((args) => ({ args })))('rejects invalid arguments before accessing DB: $args', async ({ args }) => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await runCatalogFind(args)).toBe(1)
    expect(connect).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Usage: npm run catalog:find'))
  })
  it('parses the optional limit with one quoted free-text query', () => {
    expect(parseFindArgs(['Pikachu 28', '--limit', '5'])).toEqual({ query: 'Pikachu 28', limit: 5 })
  })
  it('handles an unavailable local database without exposing connector secrets', async () => {
    vi.mocked(connect).mockRejectedValue(new Error('postgres://user:private-password@remote:5432/postgres'))
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu'])).toBe(1)
    const message = String(output.mock.calls[0]?.[0])
    expect(message).toContain('npm run supabase:start')
    expect(message).not.toContain('private-password')
    expect(message).not.toContain('postgres://')
  })
})
