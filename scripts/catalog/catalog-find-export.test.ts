import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogExportPath, catalogExportRows, encodeCatalogCsv, exportColumns, findAllCatalogMatches, writeCatalogExport } from './catalog-find-export.ts'
import { searchCatalog } from './search-catalog.ts'
import type { CatalogSearchEntry } from './search-catalog.ts'
import { connect } from './database.ts'
import { loadCatalogSearchExport } from './search-catalog-db.ts'
import { parseFindArgs, runCatalogFind } from './catalog-find.ts'
import { emptyState, fixture, fixturePokemonReference } from './fixtures.ts'
import { applyOverrides, parseOverrides } from './overrides.ts'
import { includeOverrideHistory, makePlan } from './plan.ts'
import { variantKey } from './variants.ts'

vi.mock('./database.ts', async (original) => ({ ...await original<typeof import('./database.ts')>(), connect: vi.fn() }))

const entry = (id = '1'): CatalogSearchEntry => ({
  id, card: `tcgdex:fixture-${id}`, tcgdexId: `fixture-${id}`, name: 'Pikachu', localId: id, isActive: true,
  pokemon: [{ dexNumber: 25, name: 'Pikachu' }], variantCount: 2,
  set: { tcgdexId: 'sm3.5', name: 'Légendes Brillantes', abbreviation: 'SLG', abbreviationFr: null, officialCardCount: 73 },
})
const normal = variantKey({ type: 'normal' })
const details = [
  { cardId: '1', label: 'Normal', date: '2017-10-06', dateOrigin: 'set', key: normal },
  { cardId: '1', label: 'Holo Cosmos', date: null, dateOrigin: 'unknown', key: 'my:cosmos' },
]
const directories: string[] = []
function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'my-find-export-'))
  directories.push(directory)
  vi.spyOn(process, 'cwd').mockReturnValue(directory)
  return directory
}
function database(entries = [entry()], variants: unknown[] = details) {
  const client = { query: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>((sql) => Promise.resolve({
    rows: sql.startsWith('select c.id') ? entries : sql.startsWith('select v.source_card_id') ? variants : [],
  })), end: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
  vi.mocked(connect).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof connect>>)
  return client
}
afterEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks()
  for (const directory of directories.splice(0)) {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('my-find-export-')) throw new Error('Unexpected test cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('CSV maintenance output', () => {
  it('exports every match beyond both 20 and the engine page of 100, retaining scores and stable order', () => {
    const entries = Array.from({ length: 235 }, (_, i) => entry(String(i + 1)))
    entries.push({ ...entry('999'), name: 'Raichu', pokemon: [] })
    const before = structuredClone(entries), response = findAllCatalogMatches(entries, 'Pikachu')
    expect(response.total).toBe(235)
    expect(response.results).toHaveLength(235)
    expect(response.results.slice(0, 20)).toEqual(searchCatalog(entries, 'Pikachu').results)
    expect(response.results.slice(0, 100)).toEqual(searchCatalog(entries, 'Pikachu', { limit: 100 }).results)
    expect(new Set(response.results.map(({ entry }) => entry.id)).size).toBe(235)
    expect(findAllCatalogMatches([...entries].reverse(), 'Pikachu')).toEqual(response)
    expect(entries).toEqual(before)
  })
  it('does not broaden multi-term matching and handles a complete page exactly', () => {
    const entries = Array.from({ length: 100 }, (_, i) => entry(String(i + 1)))
    expect(findAllCatalogMatches(entries, 'Pikachu legendes brillantes').results).toHaveLength(100)
    expect(findAllCatalogMatches(entries, 'Pikachu Inexistant').results).toEqual([])
  })
  it('uses exactly eight columns, one persisted variant per row and empty cells for NULL dates', () => {
    const rows = catalogExportRows(searchCatalog([entry()], 'Pikachu'), details)
    expect(rows).toHaveLength(2)
    expect(Object.keys(rows[0]!)).toEqual([...exportColumns])
    expect(rows[0]).toEqual({ Card: 'tcgdex:fixture-1', Nom: 'Pikachu', Set: 'Légendes Brillantes', 'N°': '1/73',
      Variante: 'Normal', Date: '2017-10-06', 'Origine date': 'set', 'Variant Key': normal })
    expect(rows[1]).toMatchObject({ Variante: 'Holo Cosmos', Date: '', 'Origine date': 'unknown', 'Variant Key': 'my:cosmos' })
  })
  it('retains card search order and variant DB order, with sensible missing-name/count fallbacks', () => {
    const card = entry()
    card.name = null; card.set.name = null; card.set.officialCardCount = null
    const response = searchCatalog([entry('2'), card], 'Pikachu')
    const rows = catalogExportRows(response, [...details, { ...details[0]!, cardId: '2' }])
    expect(rows.map(r => r.Card)).toEqual(['tcgdex:fixture-2', 'tcgdex:fixture-1', 'tcgdex:fixture-1'])
    expect(rows[1]).toMatchObject({ Nom: '', Set: 'sm3.5', 'N°': '1' })
  })
  it('quotes separators, commas, quotes and embedded newlines without losing French or Pokemon characters', () => {
    const rows = catalogExportRows(searchCatalog([entry()], 'Pikachu'), [{ ...details[0]!, label: 'Évoli ♀, Holo; "Étoile"\r\nCœur' }])
    const csv = encodeCatalogCsv(rows)
    expect(csv).toBe('\uFEFF"Card";"Nom";"Set";"N°";"Variante";"Date";"Origine date";"Variant Key"\r\n'
      + '"tcgdex:fixture-1";"Pikachu";"Légendes Brillantes";"1/73";"Évoli ♀, Holo; ""Étoile""\r\nCœur";"2017-10-06";"set";"v1:[""normal"",null,""standard"",[],null]"\r\n')
  })
  it('uses a bounded deterministic Windows-safe name and distinguishes punctuation that changes a query', () => {
    temporaryDirectory()
    expect(catalogExportPath('PIKACHU Légendes')).toBe(catalogExportPath('pikachu legendes'))
    expect(catalogExportPath('Pikachu 28/73')).not.toBe(catalogExportPath('Pikachu 28:73'))
    const filename = path.basename(catalogExportPath('CON:<>"/\\|?* ' + 'a'.repeat(300)))
    expect(filename).toMatch(/^catalog-find-[a-z0-9-]+-[a-f0-9]{10}\.csv$/)
    expect(filename.length).toBeLessThan(110)
  })
  it('replaces a previous export atomically and leaves no temporary file', () => {
    temporaryDirectory()
    const rows = catalogExportRows(searchCatalog([entry()], 'Pikachu'), details)
    const file = writeCatalogExport('Pikachu', rows)!
    expect(readFileSync(file, 'utf8')).toBe(encodeCatalogCsv(rows))
    expect(writeCatalogExport('Pikachu', rows.slice(0, 1))).toBe(file)
    expect(readFileSync(file, 'utf8')).toBe(encodeCatalogCsv(rows.slice(0, 1)))
    expect(readdirSync(path.dirname(file))).toEqual([path.basename(file)])
    expect(writeCatalogExport('Pikachu', [])).toBeNull()
    expect(readFileSync(file, 'utf8')).toBe(encodeCatalogCsv(rows.slice(0, 1)))
  })
})

describe('export CLI and database boundary', () => {
  it('keeps the normal argument contract and rejects export plus limit explicitly before connecting', async () => {
    expect(parseFindArgs(['Pikachu'])).toEqual({ query: 'Pikachu', limit: 20 })
    expect(parseFindArgs(['Pikachu', '--export'])).toEqual({ query: 'Pikachu', limit: 20, export: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu', '--export', '--limit', '1'])).toBe(1)
    expect(connect).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ne peut pas être combiné avec --limit'))
  })
  it('enriches only found IDs in the same read-only transaction and closes it', async () => {
    const client = database([entry(), { ...entry('2'), name: 'Raichu', pokemon: [] }])
    const result = await loadCatalogSearchExport(e => findAllCatalogMatches(e, 'Pikachu'))
    expect(result.variants).toEqual(details)
    expect(client.query.mock.calls[0]).toEqual(['begin isolation level repeatable read read only'])
    expect(client.query.mock.calls[3]![1]).toEqual([['1']])
    expect(client.query.mock.calls[3]![0]).toContain('where v.source_card_id=any($1::bigint[])')
    expect(client.query.mock.calls.at(-1)).toEqual(['rollback'])
    expect(client.end).toHaveBeenCalledOnce()
  })
  it('exports all matching cards in CLI mode, without the compact terminal table', async () => {
    temporaryDirectory()
    const entries = Array.from({ length: 25 }, (_, i) => entry(String(i + 1)))
    database(entries, entries.flatMap(e => details.map(v => ({ ...v, cardId: e.id }))))
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined), table = vi.spyOn(console, 'table').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu', '--export'])).toBe(0)
    expect(output).toHaveBeenCalledWith('25 cartes trouvées ; 50 variantes exportées — catalogue LOCAL.')
    expect(table).not.toHaveBeenCalled()
    expect(readFileSync(catalogExportPath('Pikachu'), 'utf8').split('\r\n')).toHaveLength(52)
  })
  it('creates no file and performs no detail query on no results', async () => {
    const root = temporaryDirectory(), client = database()
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Inexistant', '--export'])).toBe(0)
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Aucun résultat'))
    expect(readdirSync(root)).toEqual([])
    expect(client.query.mock.calls).toHaveLength(4)
  })
  it('refuses invalid date data and suppresses database secrets', async () => {
    temporaryDirectory()
    const client = database([entry()], [{ ...details[0]!, date: '2021-02-29' }])
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await runCatalogFind(['Pikachu', '--export'])).toBe(1)
    expect(error).toHaveBeenCalledWith('Lecture du catalogue local impossible. Vérifie les migrations Phase 2 et les données du catalogue local.')
    expect(client.end).toHaveBeenCalledOnce()
  })
})

describe('export selectors accepted by the override pipeline', () => {
  const card = 'tcgdex:fixture-set-10'
  const localAdd = { id: 'cosmos', reason: 'Synthetic MY variant', action: 'variant.add', card,
    variant: { type: 'holo', foil: 'cosmos', availability: 'confirmed' } }
  const correction = (key: string, target = card) => ({ id: 'csv-date', reason: 'Synthetic CSV audit', action: 'variant.patch',
    card: target, key, patch: { date: '2024-03-15' } })
  it.each([normal, 'my:cosmos'])('accepts exported source/MY key %s alongside existing additions and preserves the ID', (key) => {
    const base = applyOverrides(fixture(), parseOverrides([localAdd]))
    const first = makePlan(base, emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const rules = parseOverrides([localAdd, correction(key)])
    const patched = applyOverrides(includeOverrideHistory(fixture(), state, rules), rules)
    const v = patched.cards[0]!.variants.find(v => v.key === key || v.key === card + '#' + key)!
    expect(v.date).toBe('2024-03-15')
    const next = makePlan(patched, state, fixturePokemonReference)
    expect(next.rows.catalog_variants.map(v => [v.id, v.variant_key])).toEqual(first.rows.catalog_variants.map(v => [v.id, v.variant_key]))
  })
  it('accepts a source key after an identity patch instead of the effective variant_key', () => {
    const identityPatch = { id: 'aaa-foil', reason: 'Synthetic identity correction', action: 'variant.patch', card, key: normal, patch: { foil: 'cosmos' } }
    const base = applyOverrides(fixture(), parseOverrides([identityPatch]))
    expect(base.cards[0]!.variants.find(v => v.key === card + '#' + normal)!.identity).not.toBe(normal)
    const patched = applyOverrides(fixture(), parseOverrides([identityPatch, correction(normal)]))
    expect(patched.cards[0]!.variants.find(v => v.key === card + '#' + normal)!.date).toBe('2024-03-15')
  })
  it('accepts a key on an existing local card without reconstructing card.add twice', () => {
    const rule = { id: 'local-card', reason: 'Synthetic local card', action: 'card.add',
      card: { set: 'fixture-set', localId: 'TG01', name: 'Locale', date: null, variants: [{ type: 'normal', availability: 'confirmed' }] } }
    const first = makePlan(applyOverrides(fixture(), parseOverrides([rule])), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const rules = parseOverrides([rule, correction(normal, 'my:local-card')])
    expect(applyOverrides(includeOverrideHistory(fixture(), state, rules), rules).cards.find(c => c.key === 'my:local-card')!.variants[0]!.date).toBe('2024-03-15')
  })
  it('accepts a retained variant missing from a current card and leaves it inactive', () => {
    const first = makePlan(fixture(), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const missing = fixture()
    missing.cards[0]!.variants = missing.cards[0]!.variants.filter(v => v.identity !== normal)
    const rules = parseOverrides([correction(normal)])
    const result = applyOverrides(includeOverrideHistory(missing, state, rules), rules)
    expect(result.cards[0]!.variants.find(v => v.identity === normal)).toMatchObject({ date: '2024-03-15', active: false })
  })
  it('accepts the persisted canonical selector of a historical card', () => {
    const first = makePlan(fixture(), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const missing = fixture()
    missing.cards = missing.cards.filter(c => c.key !== card)
    const rules = parseOverrides([correction(normal)])
    expect(applyOverrides(includeOverrideHistory(missing, state, rules), rules).cards.find(c => c.key === card)!.variants.find(v => v.identity === normal))
      .toMatchObject({ date: '2024-03-15', active: false })
  })
  it('restores a removed MY addition by its alias on a current or historical card', () => {
    const first = makePlan(applyOverrides(fixture(), parseOverrides([localAdd])), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    for (const historicalCard of [false, true]) {
      const raw = fixture()
      if (historicalCard) raw.cards = raw.cards.filter(c => c.key !== card)
      const rules = parseOverrides([correction('my:cosmos')])
      const patched = applyOverrides(includeOverrideHistory(raw, state, rules), rules)
      const variant = patched.cards.find(c => c.key === card)!.variants.find(v => v.key === 'my:cosmos')!
      expect(variant).toMatchObject({ date: '2024-03-15', active: false })
      const next = makePlan(patched, state, fixturePokemonReference)
      expect(next.rows.catalog_variants.find(v => v.variant_key === variant.identity)?.id)
        .toBe(first.rows.catalog_variants.find(v => v.variant_key === variant.identity)?.id)
    }
  })
  it('replays an existing MY addition only once on a historical card', () => {
    const first = makePlan(applyOverrides(fixture(), parseOverrides([localAdd])), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const raw = fixture()
    raw.cards = raw.cards.filter(c => c.key !== card)
    const rules = parseOverrides([localAdd, correction('my:cosmos')])
    const patched = applyOverrides(includeOverrideHistory(raw, state, rules), rules)
    expect(patched.cards.find(c => c.key === card)!.variants.filter(v => v.key === 'my:cosmos'))
      .toEqual([expect.objectContaining({ date: '2024-03-15' })])
  })
  it('uses an applied original alias when a historical source identity was corrected', () => {
    const identityPatch = { id: 'aaa-foil', reason: 'Synthetic identity correction', action: 'variant.patch', card, key: normal, patch: { foil: 'cosmos' } }
    const first = makePlan(applyOverrides(fixture(), parseOverrides([identityPatch])), emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings, aliases: first.aliases }
    const raw = fixture()
    raw.cards = raw.cards.filter(c => c.key !== card)
    const rules = parseOverrides([identityPatch, correction(normal)])
    const patched = applyOverrides(includeOverrideHistory(raw, state, rules), rules)
    expect(patched.cards.find(c => c.key === card)!.variants.find(v => v.key === card + '#' + normal))
      .toMatchObject({ date: '2024-03-15', active: false })
  })
})
