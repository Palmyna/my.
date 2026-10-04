import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { createCatalogService, getCatalogCard, getCatalogPokemon, getCatalogSet } from './catalog'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const id = '9007199254740995'
const variant = { variant_id: id, image_url: null, variant_label: 'Reverse', effective_release_date: '2020-02-29' }
const pokemon = { pokemon_id: id, dex_number: 25, name_fr: 'Pikachu', primary_type: 'electric', secondary_type: null }
const summary = { pokemon_id: id, dex_number: 25, name_fr: 'Pikachu' }
const set = { set_id: id, name_fr: 'FR', name_source: 'Source', abbreviation_fr: 'ASC', abbreviation: 'SSP' }
const series = { series_id: id, name_fr: null, name_source: 'Series' }
const pokemonRow = { ...pokemon, variant_count: 1, variants: [{ ...variant, source_card_id: id, card_name_fr: null,
  local_id: '2A', set_id: id, set_name_fr: 'FR', set_name_source: 'Source', set_abbreviation_fr: 'ASC', set_abbreviation: 'SSP' }] }
const setRow = { ...set, release_date: null, series, logo_url: null, symbol_url: null, variant_count: 1,
  variants: [{ ...variant, source_card_id: id, card_name_fr: null, local_id: '2A', rarity: null, category: 'Pokemon', pokemon: [summary] }] }
const cardRow = { source_card_id: id, name_fr: null, local_id: '2A', rarity: null, category: 'Pokemon',
  effective_release_date: null, image_url: null, set, series, pokemon: [pokemon], variants: [variant] }
const cases = [
  { method: 'getCatalogPokemon', rpc: 'get_catalog_pokemon', arg: 'p_pokemon_id', row: pokemonRow, outputId: 'pokemonId', wireId: 'pokemon_id', app: getCatalogPokemon },
  { method: 'getCatalogSet', rpc: 'get_catalog_set', arg: 'p_set_id', row: setRow, outputId: 'setId', wireId: 'set_id', app: getCatalogSet },
  { method: 'getCatalogCard', rpc: 'get_catalog_card', arg: 'p_card_id', row: cardRow, outputId: 'sourceCardId', wireId: 'source_card_id', app: getCatalogCard },
] as const
function setup(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const client = { rpc } as unknown as SupabaseClient<Database>
  return { rpc, client, service: createCatalogService(client) }
}
describe.each(cases)('$method strict Catalogue contract', item => {
  it('calls only its RPC, preserves BIGINT strings, nulls, labels and order', async () => {
    const { service, rpc } = setup(item.row)
    const result = await service[item.method](id)
    expect(result).toHaveProperty(item.outputId, id)
    expect(result.variants).toMatchObject([{ variantId: id, imageUrl: null, variantLabel: 'Reverse', effectiveReleaseDate: '2020-02-29' }])
    expect(rpc).toHaveBeenCalledExactlyOnceWith(item.rpc, { [item.arg]: id })
    const second = { ...item.row, variants: [item.row.variants[0], { ...item.row.variants[0], variant_id: '-42' }],
      ...(item.method === 'getCatalogCard' ? {} : { variant_count: 2 }) }
    expect((await setup(second).service[item.method](id)).variants.map(row => row.variantId)).toEqual([id, '-42'])
  })
  it('accepts signed BIGINT boundaries as strings', async () => {
    for (const value of ['-9223372036854775808', '9223372036854775807', '0']) {
      expect(await setup({ ...item.row, [item.wireId]: value }).service[item.method](value)).toHaveProperty(item.outputId, value)
    }
  })
  it.each(['', '01', '1\n', '1.2', '9223372036854775808', 42, null, 1n])('rejects invalid input %# before transport', async value => {
    const { service, rpc } = setup(item.row)
    await expect(service[item.method](value as string)).rejects.toMatchObject({ code: 'catalog_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects malformed objects, missing/extra fields, wrong target, dates and duplicate variants', async () => {
    const invalid: unknown[] = [undefined, [], {}, 'null', { ...item.row, owned: true }, { ...item.row, [item.wireId]: '42' },
      { ...item.row, [item.wireId]: Number(id) }, { ...item.row, variants: [] },
      { ...item.row, variants: [item.row.variants[0], item.row.variants[0]], ...(item.method === 'getCatalogCard' ? {} : { variant_count: 2 }) },
      ...Object.keys(item.row).map(key => Object.fromEntries(Object.entries(item.row).filter(([field]) => field !== key))),
      ...[null, 1, [], '01'].map(variant_id => ({ ...item.row, variants: [{ ...item.row.variants[0], variant_id }] })),
      { ...item.row, variants: [{ ...item.row.variants[0], effective_release_date: '2020-02-30' }] },
      { ...item.row, variants: [{ ...item.row.variants[0], collection_id: 'private' }] },
    ]
    for (const data of invalid) await expect(setup(data).service[item.method](id)).rejects.toMatchObject({ code: 'unexpected' })
  })
  it('maps NULL and authorization/transport failures to stable errors', async () => {
    await expect(setup(null).service[item.method](id)).rejects.toMatchObject({ code: 'catalog_unavailable' })
    for (const code of ['42501', 'PGRST301', 'PGRST302', 'PGRST303']) {
      await expect(setup(null, { code, message: 'private' }).service[item.method](id)).rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
    }
    const { service, rpc } = setup(null)
    rpc.mockRejectedValue(new Error('private'))
    await expect(service[item.method](id)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
    await expect(setup(null, { code: 'XX000' }).service[item.method](id)).rejects.toMatchObject({ code: 'unexpected' })
  })
  it('uses app client and checks input before absent-client error', async () => {
    const { client } = setup(item.row)
    vi.mocked(getSupabaseClient).mockReturnValue(client)
    expect(await item.app(id)).toHaveProperty(item.outputId, id)
    vi.mocked(getSupabaseClient).mockReturnValue(null)
    await expect(item.app(id)).rejects.toMatchObject({ code: 'not_authorized' })
    await expect(item.app('01')).rejects.toMatchObject({ code: 'catalog_unavailable' })
  })
})
it('rejects unknown, duplicate and secondary-only types and inconsistent counts', async () => {
  for (const patch of [{ primary_type: 'stellar' }, { primary_type: null, secondary_type: 'fire' },
    { secondary_type: 'electric' }, { variant_count: 2 }, { variant_count: '1' }]) {
    await expect(setup({ ...pokemonRow, ...patch }).service.getCatalogPokemon(id)).rejects.toMatchObject({ code: 'unexpected' })
  }
  const result = await setup({ ...pokemonRow, primary_type: null }).service.getCatalogPokemon(id)
  expect(result.primaryType).toBeNull()
  for (const patch of [{ ...pokemon, primary_type: 'stellar' }, { ...pokemon, dex_number: 0 }, { ...pokemon, owned: true }]) {
    await expect(setup({ ...cardRow, pokemon: [patch] }).service.getCatalogCard(id)).rejects.toMatchObject({ code: 'unexpected' })
  }
  await expect(setup({ ...setRow, series: { ...series, series_id: 42 } }).service.getCatalogSet(id)).rejects.toMatchObject({ code: 'unexpected' })
  await expect(setup({ ...cardRow, set: { ...set, owned: true } }).service.getCatalogCard(id)).rejects.toMatchObject({ code: 'unexpected' })
  await expect(setup({ ...cardRow, pokemon: [pokemon, pokemon] }).service.getCatalogCard(id)).rejects.toMatchObject({ code: 'unexpected' })
  await expect(setup({ ...setRow, variants: [{ ...setRow.variants[0], pokemon: [summary, summary] }] }).service.getCatalogSet(id)).rejects.toMatchObject({ code: 'unexpected' })
})
