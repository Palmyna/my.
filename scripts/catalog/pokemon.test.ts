import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPokemonReference, parsePokemonReference, pokemonNameFor, serializePokemonReference } from './pokemon-reference.ts'
import { updatePokemonReference } from './pokemon-update.ts'
import { emptyState, fixture, fixturePokemonReference } from './fixtures.ts'
import { makePlan } from './plan.ts'
import { report } from './report.ts'

const endpoint = 'https://pokeapi.co/api/v2/pokemon-species/'
const names: Record<number, string> = { 1: 'Bulbizarre', 25: 'Pikachu', 150: 'Mewtwo', 1025: 'Pêchaminus' }
const list = (ids: number[], next: string | null = null, count = ids.length) => ({ count, next, results: ids.map((id) => ({ url: `${endpoint}${id}/` })) })
const species = (id: number, name = names[id] ?? `Espèce ${id}`) => ({ id,
  names: [{ name: 'English must be ignored', language: { name: 'en' } }, { name, language: { name: 'fr' } }] })
const requestUrl = (input: Parameters<typeof fetch>[0]): string => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
const response = (value: unknown): Promise<Response> => Promise.resolve(Response.json(value))
const api = (ids = [1, 25, 150, 1025]) => vi.fn<typeof fetch>((input) => {
  const url = requestUrl(input)
  return response(url.includes('?') ? list(ids) : species(Number(url.slice(endpoint.length, -1))))
})
const directories: string[] = []
async function outputFile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'my-pokemon-test-'))
  directories.push(directory)
  const file = path.join(directory, 'pokemon-fr.json')
  await writeFile(file, 'previous file must survive')
  return file
}
afterEach(async () => {
  vi.unstubAllGlobals()
  // Only exact directories created by mkdtemp for this suite are removed.
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('versioned species reference', () => {
  it.each(['{}', '[]', 'null', '{"0":"x"}', '{"-1":"x"}', '{"1.5":"x"}', '{"01":"x"}',
    '{"2147483648":"x"}', '{"dex_number":"x"}', '{"1":null}', '{"1":42}', '{"1":{}}', '{"1":"  "}',
    '{"1":"a","1":"b"}', '{"1":"a","\\u0031":"b"}', '{"1":"a",}'])('rejects invalid reference %s', (contents) => {
    expect(() => parsePokemonReference(contents)).toThrow()
  })
  it('preserves Unicode exactly and hashes semantic contents regardless of layout', () => {
    const values = { '1025': 'Pêchaminus', '29': 'Nidoran♀', '83': 'Canarticho', '122': 'M. Mime', '772': 'Type:0', '1': 'Épreuve d’Unicode' }
    const text = serializePokemonReference(values), parsed = parsePokemonReference(text)
    expect(parsed.names).toEqual(values)
    expect(Object.keys(parsed.names)).toEqual(['1', '29', '83', '122', '772', '1025'])
    expect(serializePokemonReference({ ...Object.fromEntries(Object.entries(values).reverse()) })).toBe(text)
    expect(parsePokemonReference(JSON.stringify(values)).hash).toBe(parsed.hash)
    expect(parsePokemonReference('{"1":"é"}').hash).not.toBe(parsePokemonReference('{"1":"é"}').hash)
    expect(pokemonNameFor(parsed, 999999)).toBeNull()
  })
  it('loads the complete committed reference offline and checks known and recent species', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
    const reference = loadPokemonReference()
    expect(reference.count).toBeGreaterThanOrEqual(1025)
    for (const [id, name] of Object.entries(names)) expect(reference.names[id]).toBe(name)
  })
  it('updates only descriptive names, preserves IDs/structures, and becomes a noop', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
    const catalogue = fixture(), oldReference = parsePokemonReference('{"25":"Old name"}')
    const before = makePlan(catalogue, emptyState(), oldReference)
    const state = { ...emptyState(), rows: before.rows, mappings: before.mappings, aliases: before.aliases }
    const plan = makePlan(catalogue, state, fixturePokemonReference)
    expect(plan.diffs.pokemon.modified).toBe(2)
    expect(Object.entries(plan.writes).filter(([table]) => table !== 'pokemon').flatMap(([, rows]) => rows)).toEqual([])
    expect(plan.rows.pokemon.map((row) => row.id)).toEqual(before.rows.pokemon.map((row) => row.id))
    expect(plan.structures).toEqual(before.structures)
    expect(plan.mappingAdds).toEqual([]); expect(plan.mappingRemoves).toEqual([])
    expect(makePlan(catalogue, { ...state, rows: plan.rows }, fixturePokemonReference).writes.pokemon).toEqual([])
    const changed = makePlan(catalogue, state, parsePokemonReference('{"25":"Pikachu"}'))
    expect(changed.rows.pokemon.find((row) => row.dex_number === 644)?.name_fr).toBeNull()
    expect(changed.diagnostics).toMatchObject([{ code: 'pokemon-name-missing', target: '644' }])
    const result = report(catalogue, changed, { repository: 'fixture', sha: 'a'.repeat(40), committedAt: '2020-01-01', directory: '.' }, '', 'test', new Date().toISOString())
    expect(result.catalogue.pokemon_without_name).toBe(1)
    expect(result.diagnostic_counts['pokemon-name-missing']).toBe(1)
    expect(result.pokemon_reference.hash).toBe(changed.pokemonReference.hash)
  })
  it('keeps an absent dex as NULL even with an old DB name or suggestive card name', () => {
    const catalogue = fixture(), first = makePlan(catalogue, emptyState(), fixturePokemonReference)
    catalogue.cards[0]!.name = 'Pikachu ex et Zekrom'
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings }
    const plan = makePlan(catalogue, state, parsePokemonReference('{"1":"Bulbizarre"}'))
    expect(plan.rows.pokemon.every((row) => row.name_fr === null)).toBe(true)
    expect(plan.diagnostics).toHaveLength(2)
    catalogue.cards = catalogue.cards.slice(1)
    const retained = makePlan(catalogue, state, parsePokemonReference('{"25":"Nom corrigé"}'))
    expect(retained.rows.pokemon).toMatchObject([{ dex_number: 25, name_fr: 'Nom corrigé', is_active: false }, { dex_number: 644, name_fr: null, is_active: false }])
  })
})

describe('manual PokéAPI generation with mocked HTTP', () => {
  it('discovers pages and IDs, writes only French names, and repeats byte for byte', async () => {
    const file = await outputFile(), request = api(), page2 = `${endpoint}?offset=2&limit=2`
    request.mockImplementation((input) => {
      const url = requestUrl(input)
      if (url.includes('?')) return response(url === page2 ? list([150, 1025], null, 4) : list([25, 1], page2, 4))
      return response(species(Number(url.slice(endpoint.length, -1))))
    })
    const result = await updatePokemonReference(file, { fetch: request })
    expect(result).toMatchObject({ discovered: 4, with_fr: 4, without_fr: 0, min_dex: 1, max_dex: 1025 })
    const bytes = await readFile(file)
    expect(parsePokemonReference(bytes.toString()).names).toEqual(names)
    expect(await readdir(path.dirname(file))).toEqual(['pokemon-fr.json'])
    await updatePokemonReference(file, { fetch: request })
    expect(await readFile(file)).toEqual(bytes)
    expect(request.mock.calls.every(([, init]) => init?.redirect === 'error' && init.signal instanceof AbortSignal)).toBe(true)
  })
  it.each([429, 503])('retries transient HTTP %s with bounded backoff', async (status) => {
    const file = await outputFile(), request = api(), sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    request.mockResolvedValueOnce(new Response(null, { status, headers: { 'retry-after': '1' } }))
    await updatePokemonReference(file, { fetch: request, sleep })
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000)
  })
  it.each([new TypeError('fetch failed'), new DOMException('timed out', 'TimeoutError')])('limits network/timeout retries and retains the file', async (error) => {
    const file = await outputFile(), request = vi.fn<typeof fetch>().mockRejectedValue(error), sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    await expect(updatePokemonReference(file, { fetch: request, sleep })).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[500], [1000]])
    expect(await readFile(file, 'utf8')).toBe('previous file must survive')
  })
  it.each(['404', 'json', 'missing-fr', 'empty-fr', 'duplicate-fr', 'mismatched-id'])('never publishes partial data after %s', async (failure) => {
    const file = await outputFile(), request = api([1, 25]), sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    request.mockImplementation((input) => {
      const url = requestUrl(input)
      if (url.includes('?')) return response(list([1, 25]))
      if (url === `${endpoint}1/`) return response(species(1))
      if (failure === '404') return Promise.resolve(new Response(null, { status: 404 }))
      if (failure === 'json') return Promise.resolve(new Response('{invalid'))
      const value = species(25)
      if (failure === 'missing-fr') value.names = value.names.slice(0, 1)
      if (failure === 'empty-fr') value.names[1]!.name = ' '
      if (failure === 'duplicate-fr') value.names.push(value.names[1]!)
      if (failure === 'mismatched-id') value.id = 26
      return response(value)
    })
    await expect(updatePokemonReference(file, { fetch: request, sleep })).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('previous file must survive')
    expect(await readdir(path.dirname(file))).toEqual(['pokemon-fr.json'])
    expect(sleep).not.toHaveBeenCalled()
  })
  it.each([
    list([1, 1]), list([1], null, 2), list([1], 'https://example.com/'),
    { ...list([1]), results: [{ url: 'https://pokeapi.co/api/v2/pokemon/1/' }] },
  ])('rejects inconsistent or unexpected resource lists %#', async (page) => {
    const file = await outputFile(), request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page))
    await expect(updatePokemonReference(file, { fetch: request })).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('previous file must survive')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('bounds species concurrency at six', async () => {
    const file = await outputFile(), ids = Array.from({ length: 20 }, (_, index) => index + 1)
    let active = 0, maximum = 0
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input)
      if (url.includes('?')) return Response.json(list(ids))
      active++; maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return Response.json(species(Number(url.slice(endpoint.length, -1))))
    })
    await updatePokemonReference(file, { fetch: request })
    expect(maximum).toBe(6)
    expect(parsePokemonReference(await readFile(file, 'utf8')).count).toBe(20)
  })
})
