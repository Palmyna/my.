import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPokemonReference, parsePokemonReference, pokemonFor, serializePokemonReference } from './pokemon-reference.ts'
import { updatePokemonReference } from './pokemon-update.ts'
import { emptyState, fixture, fixturePokemonReference } from './fixtures.ts'
import { makePlan } from './plan.ts'
import { report } from './report.ts'

const endpoint = 'https://pokeapi.co/api/v2/pokemon-species/'
const names: Record<number, string> = { 1: 'Bulbizarre', 25: 'Pikachu', 150: 'Mewtwo', 1025: 'Pêchaminus' }
const reference = (values: Record<string, string>) => parsePokemonReference(JSON.stringify(Object.fromEntries(Object.entries(values).map(([id, name_fr]) => [id, { name_fr, types: ['electric'] }]))))
const pokemonEndpoint = 'https://pokeapi.co/api/v2/pokemon/'
const list = (ids: number[], next: string | null = null, count = ids.length) => ({ count, next, results: ids.map((id) => ({ url: `${endpoint}${id}/` })) })
const species = (id: number, name = names[id] ?? `Espèce ${id}`) => ({ id, name: `species-${id}`,
  names: [{ name: 'English must be ignored', language: { name: 'en' } }, { name, language: { name: 'fr' } }],
  varieties: [{ is_default: true, pokemon: { name: `pokemon-${id + 10000}`, url: `${pokemonEndpoint}${id + 10000}/` } }] })
const pokemon = (speciesId: number) => ({ id: speciesId + 10000, name: `pokemon-${speciesId + 10000}`, is_default: true,
  species: { name: `species-${speciesId}`, url: `${endpoint}${speciesId}/` },
  types: [{ slot: 1, type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' } }] })
const resourceResponse = (url: string) => url.startsWith(pokemonEndpoint)
  ? pokemon(Number(url.slice(pokemonEndpoint.length, -1)) - 10000) : species(Number(url.slice(endpoint.length, -1)))
const requestUrl = (input: Parameters<typeof fetch>[0]): string => typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
const response = (value: unknown): Promise<Response> => Promise.resolve(Response.json(value))
const api = (ids = [1, 25, 150, 1025]) => vi.fn<typeof fetch>((input) => {
  const url = requestUrl(input)
  return response(url.includes('?') ? list(ids) : resourceResponse(url))
})
const directories: string[] = []
async function outputFile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'my-pokemon-test-'))
  directories.push(directory)
  const file = path.join(directory, 'pokemon-reference.json')
  await writeFile(file, 'previous file must survive')
  return file
}
afterEach(async () => {
  vi.unstubAllGlobals()
  // Only exact directories created by mkdtemp for this suite are removed.
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('versioned species reference', () => {
  it.each([
    { name_fr: 'Pikachu', types: [] }, { name_fr: 'Pikachu', types: ['stellar'] },
    { name_fr: 'Pikachu', types: ['fire', 'water', 'grass'] }, { name_fr: 'Pikachu', types: ['fire', 'fire'] },
    { name_fr: null, types: ['electric'] }, { name_fr: ' ', types: ['electric'] },
    { name_fr: 'Pikachu', types: ['electric'], color: '#fff' },
  ])('rejects invalid metadata %#', entry => {
    expect(() => parsePokemonReference(JSON.stringify({ '25': entry }))).toThrow()
  })
  it('rejects duplicate escaped keys at every object level', () => {
    for (const contents of ['{"1":{"name_fr":"A","types":["fire"]},"\\u0031":{"name_fr":"A","types":["fire"]}}',
      '{"1":{"name_fr":"A","name_fr":"B","types":["fire"]}}']) expect(() => parsePokemonReference(contents)).toThrow()
  })
  it('type-only changes affect hash and Pokemon metadata only', () => {
    const catalogue = fixture(), before = makePlan(catalogue, emptyState(), fixturePokemonReference)
    const state = { ...emptyState(), rows: before.rows, mappings: before.mappings, aliases: before.aliases }
    const entries = structuredClone(fixturePokemonReference.entries)
    entries['25']!.types = ['water', 'flying']
    const changed = parsePokemonReference(serializePokemonReference(entries))
    expect(changed.hash).not.toBe(fixturePokemonReference.hash)
    const plan = makePlan(catalogue, state, changed)
    expect(plan.writes.pokemon).toMatchObject([{ dex_number: 25, name_fr: 'Pikachu', primary_type: 'water', secondary_type: 'flying' }])
    expect(Object.entries(plan.writes).filter(([table]) => table !== 'pokemon').flatMap(([, rows]) => rows)).toEqual([])
    expect(plan.structures).toEqual(before.structures)
    expect(plan.targets.changed).toBe(0)
    expect(plan.mappingAdds).toEqual([]); expect(plan.mappingRemoves).toEqual([])
    expect(makePlan(catalogue, { ...state, rows: plan.rows }, changed).writes.pokemon).toEqual([])
  })
  it.each(['{}', '[]', 'null', '{"0":"x"}', '{"-1":"x"}', '{"1.5":"x"}', '{"01":"x"}',
    '{"2147483648":"x"}', '{"dex_number":"x"}', '{"1":null}', '{"1":42}', '{"1":{}}', '{"1":"  "}',
    '{"1":"a","1":"b"}', '{"1":"a","\\u0031":"b"}', '{"1":"a",}'])('rejects invalid reference %s', (contents) => {
    expect(() => parsePokemonReference(contents)).toThrow()
  })
  it('preserves Unicode exactly and hashes semantic contents regardless of layout', () => {
    const values = reference({ '1025': 'Pêchaminus', '29': 'Nidoran♀', '83': 'Canarticho', '122': 'M. Mime', '772': 'Type:0', '1': 'Épreuve d’Unicode' }).entries
    const text = serializePokemonReference(values), parsed = parsePokemonReference(text)
    expect(parsed.entries).toEqual(values)
    expect(Object.keys(parsed.entries)).toEqual(['1', '29', '83', '122', '772', '1025'])
    expect(serializePokemonReference({ ...Object.fromEntries(Object.entries(values).reverse()) })).toBe(text)
    expect(parsePokemonReference(JSON.stringify(values)).hash).toBe(parsed.hash)
    expect(reference({ '1': 'é' }).hash).not.toBe(reference({ '1': 'é' }).hash)
    expect(pokemonFor(parsed, 999999)).toBeNull()
  })
  it('loads the complete committed reference offline and checks known and recent species', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
    const reference = loadPokemonReference()
    expect(reference.count).toBeGreaterThanOrEqual(1025)
    for (const [id, name] of Object.entries(names)) expect(reference.entries[id]?.name_fr).toBe(name)
    expect(reference.entries['6']?.types).toEqual(['fire', 'flying'])
    expect(reference.entries['25']?.types).toEqual(['electric'])
  })
  it('updates only descriptive names, preserves IDs/structures, and becomes a noop', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden') }))
    const catalogue = fixture(), oldReference = reference({ '25': 'Old name' })
    const before = makePlan(catalogue, emptyState(), oldReference)
    const state = { ...emptyState(), rows: before.rows, mappings: before.mappings, aliases: before.aliases }
    const plan = makePlan(catalogue, state, fixturePokemonReference)
    expect(plan.diffs.pokemon.modified).toBe(2)
    expect(Object.entries(plan.writes).filter(([table]) => table !== 'pokemon').flatMap(([, rows]) => rows)).toEqual([])
    expect(plan.rows.pokemon.map((row) => row.id)).toEqual(before.rows.pokemon.map((row) => row.id))
    expect(plan.structures).toEqual(before.structures)
    expect(plan.mappingAdds).toEqual([]); expect(plan.mappingRemoves).toEqual([])
    expect(makePlan(catalogue, { ...state, rows: plan.rows }, fixturePokemonReference).writes.pokemon).toEqual([])
    const changed = makePlan(catalogue, state, reference({ '25': 'Pikachu' }))
    expect(changed.rows.pokemon.find((row) => row.dex_number === 644)?.name_fr).toBeNull()
    expect(changed.diagnostics).toMatchObject([{ code: 'pokemon-reference-missing', target: '644' }])
    const result = report(catalogue, changed, { repository: 'fixture', sha: 'a'.repeat(40), committedAt: '2020-01-01', directory: '.' }, '', 'test', new Date().toISOString())
    expect(result.catalogue.pokemon_without_name).toBe(1)
    expect(result.diagnostic_counts['pokemon-reference-missing']).toBe(1)
    expect(result.catalogue.pokemon_without_type).toBe(1)
    expect(result.pokemon_reference.hash).toBe(changed.pokemonReference.hash)
  })
  it('keeps an absent dex as NULL even with an old DB name or suggestive card name', () => {
    const catalogue = fixture(), first = makePlan(catalogue, emptyState(), fixturePokemonReference)
    catalogue.cards[0]!.name = 'Pikachu ex et Zekrom'
    const state = { ...emptyState(), rows: first.rows, mappings: first.mappings }
    const plan = makePlan(catalogue, state, reference({ '1': 'Bulbizarre' }))
    expect(plan.rows.pokemon.every((row) => row.name_fr === null)).toBe(true)
    expect(plan.diagnostics).toHaveLength(2)
    catalogue.cards = catalogue.cards.slice(1)
    const retained = makePlan(catalogue, state, reference({ '25': 'Nom corrigé' }))
    expect(retained.rows.pokemon).toMatchObject([{ dex_number: 25, name_fr: 'Nom corrigé', is_active: false }, { dex_number: 644, name_fr: null, is_active: false }])
  })
})

describe('manual PokéAPI generation with mocked HTTP', () => {
  it('uses the explicit default variety, orders slots and ignores alternate forms', async () => {
    const file = await outputFile(), request = api([25])
    request.mockImplementation(input => {
      const url = requestUrl(input)
      if (url.includes('?')) return response(list([25]))
      if (url === `${endpoint}25/`) return response({ ...species(25), varieties: [
        { is_default: false, pokemon: { name: 'alternate', url: `${pokemonEndpoint}25/` } }, ...species(25).varieties,
      ] })
      expect(url).toBe(`${pokemonEndpoint}10025/`)
      return response({ ...pokemon(25), types: [
        { slot: 2, type: { name: 'flying', url: 'https://pokeapi.co/api/v2/type/3/' } },
        { slot: 1, type: { name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' } },
      ] })
    })
    await updatePokemonReference(file, { fetch: request })
    expect(parsePokemonReference(await readFile(file, 'utf8')).entries['25']?.types).toEqual(['fire', 'flying'])
  })
  it.each(['no-default', 'multiple-default', 'bad-url', 'wrong-pokemon-id', 'wrong-pokemon-name', 'wrong-species-url',
    'wrong-species-name', 'not-default', 'unknown-type', 'no-types', 'three-types', 'duplicate-type', 'duplicate-slot', 'missing-slot', 'wrong-type-url'])(
    'retains previous reference on invalid default/types: %s', async failure => {
    const file = await outputFile(), request = api([25])
    request.mockImplementation(input => {
      const url = requestUrl(input)
      if (url.includes('?')) return response(list([25]))
      if (url.startsWith(endpoint)) {
        const value = species(25)
        if (failure === 'no-default') value.varieties = []
        if (failure === 'multiple-default') value.varieties.push(value.varieties[0]!)
        if (failure === 'bad-url') value.varieties[0]!.pokemon.url = 'https://evil.test/pokemon/25/'
        return response(value)
      }
      const value = pokemon(25)
      if (failure === 'wrong-pokemon-id') value.id++
      if (failure === 'wrong-pokemon-name') value.name = 'other'
      if (failure === 'wrong-species-url') value.species.url = `${endpoint}26/`
      if (failure === 'wrong-species-name') value.species.name = 'other'
      if (failure === 'not-default') value.is_default = false
      if (failure === 'unknown-type') value.types[0]!.type.name = 'stellar'
      if (failure === 'no-types') value.types = []
      if (failure === 'three-types') value.types = Array.from({ length: 3 }, () => value.types[0]!)
      if (failure === 'duplicate-type') value.types.push({ ...value.types[0]!, slot: 2 })
      if (failure === 'duplicate-slot') value.types.push(value.types[0]!)
      if (failure === 'missing-slot') value.types[0]!.slot = 2
      if (failure === 'wrong-type-url') value.types[0]!.type.url = 'https://pokeapi.co/api/v2/type/10/'
      return response(value)
    })
    await expect(updatePokemonReference(file, { fetch: request })).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('previous file must survive')
    expect(await readdir(path.dirname(file))).toEqual(['pokemon-reference.json'])
  })
  it('settles every in-flight request before reporting failure', async () => {
    const file = await outputFile()
    let finish!: () => void, started = 0
    const pending = new Promise<void>(resolve => { finish = resolve })
    const request = vi.fn<typeof fetch>(async input => {
      const url = requestUrl(input)
      if (url.includes('?')) return Response.json(list([1, 25]))
      started++
      if (url === `${endpoint}1/`) { await pending; return Response.json(species(1)) }
      if (url === `${endpoint}25/`) return new Response(null, { status: 404 })
      return Response.json(resourceResponse(url))
    })
    let settled = false
    const result = updatePokemonReference(file, { fetch: request }).catch(() => { settled = true })
    await vi.waitFor(() => expect(started).toBe(2))
    expect(settled).toBe(false)
    finish(); await result
    expect(settled).toBe(true)
    expect(await readFile(file, 'utf8')).toBe('previous file must survive')
  })
  it('discovers pages and IDs, writes only French names, and repeats byte for byte', async () => {
    const file = await outputFile(), request = api(), page2 = `${endpoint}?offset=2&limit=2`
    request.mockImplementation((input) => {
      const url = requestUrl(input)
      if (url.includes('?')) return response(url === page2 ? list([150, 1025], null, 4) : list([25, 1], page2, 4))
      return response(resourceResponse(url))
    })
    const result = await updatePokemonReference(file, { fetch: request })
    expect(result).toMatchObject({ discovered: 4, with_fr: 4, without_fr: 0, min_dex: 1, max_dex: 1025 })
    const bytes = await readFile(file)
    expect(parsePokemonReference(bytes.toString()).entries).toEqual(reference(names).entries)
    expect(await readdir(path.dirname(file))).toEqual(['pokemon-reference.json'])
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
      if (url.startsWith(pokemonEndpoint)) return response(resourceResponse(url))
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
    expect(await readdir(path.dirname(file))).toEqual(['pokemon-reference.json'])
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
      return Response.json(resourceResponse(url))
    })
    await updatePokemonReference(file, { fetch: request })
    expect(maximum).toBe(6)
    expect(parsePokemonReference(await readFile(file, 'utf8')).count).toBe(20)
  })
})
