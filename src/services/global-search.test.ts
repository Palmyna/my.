import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { POKEMON_TYPES } from '../types/pokemon'
import { createGlobalSearchService, GlobalSearchError, searchGlobalNavigation } from './global-search'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const id = '9007199254740995'
const pokemon = { kind: 'pokemon', pokemon_id: id, name_fr: 'Pikachu', dex_number: 25, primary_type: 'electric', secondary_type: null }
const set = { kind: 'set', set_id: id, name_fr: null, name_source: 'Shining Legends', abbreviation_fr: null, abbreviation: 'SLG' }
const collection = { kind: 'collection', collection_id: 'c7e10000-0000-0000-0000-000000000001', name: 'Mes Pikachu',
  access: 'owned', collection_type: 'automatic', target_type: 'pokemon', target_name: 'Pikachu', target_primary_type: 'electric', target_secondary_type: null }
const card = { kind: 'card', source_card_id: id, name_fr: 'Pikachu', local_id: '28', set_name_fr: 'Légendes Brillantes',
  set_abbreviation_fr: 'SL3.5', set_abbreviation: 'SLG' }
const rows = [pokemon, set, collection, card]
function setup(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const client = { rpc } as unknown as SupabaseClient<Database>
  return { rpc, client, search: createGlobalSearchService(client).searchGlobalNavigation }
}
it('calls only exact RPC with untouched parameter, maps all four categories and preserves order/BIGINT', async () => {
  const { search, rpc } = setup(rows)
  const query = " PIKACHU’ — 28/73'; select 1; "
  expect(await search(query)).toEqual([
    { kind: 'pokemon', pokemonId: id, nameFr: 'Pikachu', dexNumber: 25, primaryType: 'electric', secondaryType: null },
    { kind: 'set', setId: id, nameFr: null, nameSource: 'Shining Legends', abbreviationFr: null, abbreviation: 'SLG' },
    { kind: 'collection', collectionId: collection.collection_id, name: 'Mes Pikachu', access: 'owned', collectionType: 'automatic',
      targetType: 'pokemon', targetName: 'Pikachu', targetPrimaryType: 'electric', targetSecondaryType: null },
    { kind: 'card', sourceCardId: id, nameFr: 'Pikachu', localId: '28', setNameFr: 'Légendes Brillantes', setAbbreviationFr: 'SL3.5', setAbbreviation: 'SLG' },
  ])
  expect(rpc).toHaveBeenCalledExactlyOnceWith('search_global_navigation', { p_query: query })
})
it('accepts empty success and ten unique Cards when no nominal category matches', async () => {
  expect(await setup([]).search('absent')).toEqual([])
  const cards = Array.from({ length: 10 }, (_, i) => ({ ...card, source_card_id: String(i) }))
  expect(await setup(cards).search('Pikachu')).toHaveLength(10)
})
it.each(POKEMON_TYPES)('accepts known Pokemon type %s', async primary_type => {
  expect(await setup([{ ...pokemon, primary_type }]).search('Pikachu')).toMatchObject([{ primaryType: primary_type }])
})
it('preserves dual and missing type metadata, personal/shared/free/set identities', async () => {
  expect(await setup([{ ...pokemon, primary_type: 'fire', secondary_type: 'flying' }]).search('Dracaufeu')).toMatchObject([{ primaryType: 'fire', secondaryType: 'flying' }])
  expect(await setup([{ ...pokemon, primary_type: null }]).search('Pikachu')).toMatchObject([{ primaryType: null, secondaryType: null }])
  for (const access of ['owned', 'shared']) {
    expect(await setup([{ ...collection, access }]).search('Pikachu')).toMatchObject([{ access, targetPrimaryType: 'electric' }])
    expect(await setup([{ ...collection, access, collection_type: 'free', target_type: null, target_name: null, target_primary_type: null }]).search('Pikachu'))
      .toMatchObject([{ access, collectionType: 'free', targetType: null }])
    expect(await setup([{ ...collection, access, target_type: 'set', target_primary_type: null }]).search('Pikachu'))
      .toMatchObject([{ access, targetType: 'set', targetPrimaryType: null }])
  }
})
describe.each(rows)('strict $kind decoder', row => {
  it('rejects unexpected/missing fields and wrong primitive types', async () => {
    const invalid = [{ ...row, score: 1 }, { ...row, variant_id: '1' }, { ...row, kind: 'variant' },
      ...Object.keys(row).map(key => Object.fromEntries(Object.entries(row).filter(([field]) => field !== key))),
      ...Object.keys(row).filter(key => key !== 'kind').map(key => ({ ...row, [key]: [] })),
    ]
    for (const value of invalid) await expect(setup([value]).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  })
})
it('rejects noncanonical/out-of-range/numeric BIGINT and accepts signed boundaries', async () => {
  for (const row of [pokemon, set, card]) {
    const key = row.kind === 'pokemon' ? 'pokemon_id' : row.kind === 'set' ? 'set_id' : 'source_card_id'
    for (const value of [Number(id), 25, '01', '1\n', '1.2', '9223372036854775808', '-9223372036854775809', null]) {
      await expect(setup([{ ...row, [key]: value }]).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected' })
    }
    for (const value of ['-9223372036854775808', '9223372036854775807', '0']) {
      expect(await setup([{ ...row, [key]: value }]).search('Pikachu')).toHaveLength(1)
    }
  }
})
it('rejects unknown/duplicate/secondary-only Pokemon types and inconsistent Collections', async () => {
  const invalid = [
    ...[{ primary_type: 'stellar' }, { secondary_type: 'electric' }, { primary_type: null, secondary_type: 'fire' }, { dex_number: 0 }].map(patch => ({ ...pokemon, ...patch })),
    ...[{ access: 'public' }, { collection_type: 'manual' }, { collection_id: 'private' }, { target_type: 'series' }, { target_type: null },
      { target_primary_type: 'stellar' }, { target_secondary_type: 'electric' }, { target_primary_type: null, target_secondary_type: 'fire' },
      { target_type: 'set' }, { collection_type: 'free' }, { collection_type: 'free', target_type: null, target_name: null },
    ].map(patch => ({ ...collection, ...patch })),
  ]
  for (const row of invalid) await expect(setup([row]).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected' })
})
it('rejects nonarray, overflow, category disorder, quotas and duplicate identities', async () => {
  for (const value of [null, undefined, {}, '[]', [card, pokemon], [set, collection, set], [card, card],
    [pokemon, pokemon], Array.from({ length: 11 }, (_, i) => ({ ...card, source_card_id: String(i) })),
    [1, 2, 3].map(i => ({ ...pokemon, pokemon_id: String(i) })),
    [1, 2, 3].map(i => ({ ...set, set_id: String(i) })),
    [1, 2, 3].map(i => ({ ...collection, collection_id: `c7e10000-0000-0000-0000-00000000000${i}` })),
  ]) await expect(setup(value).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected' })
})
it.each(['', 'ab', '😀😀', 'a'.repeat(201), '😀'.repeat(201), null, 42])('rejects invalid query length/type %# before RPC', async query => {
  const { search, rpc } = setup([])
  await expect(search(query as string)).rejects.toMatchObject({ code: 'invalid_query' })
  expect(rpc).not.toHaveBeenCalled()
})
it('counts Unicode codepoints and leaves useful-term validation to server', async () => {
  const { search, rpc } = setup([])
  await search('é'.repeat(200))
  await search('😀'.repeat(200))
  expect(rpc).toHaveBeenCalledTimes(2)
  await expect(setup(null, { code: '22023', message: 'global_search_invalid_query' }).search('!!!')).rejects.toMatchObject({ code: 'invalid_query' })
})
it('maps only known errors, sanitizes unknown Supabase and rejected transport errors', async () => {
  for (const code of ['42501', 'PGRST301', 'PGRST302', 'PGRST303']) {
    await expect(setup(null, { code, message: 'private' }).search('Pikachu')).rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
  }
  for (const error of [{ code: '22023', message: 'private' }, { code: '22P02' }, { code: 'XX000', message: 'global_search_invalid_query' }, new Error('private')]) {
    await expect(setup(null, error).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  }
  const { rpc, search } = setup([])
  rpc.mockRejectedValue(new Error('private'))
  await expect(search('Pikachu')).rejects.toBeInstanceOf(GlobalSearchError)
  await expect(search('Pikachu')).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
})
it('uses application client and refuses absent client', async () => {
  const { client } = setup(rows)
  vi.mocked(getSupabaseClient).mockReturnValue(client)
  expect(await searchGlobalNavigation('Pikachu')).toHaveLength(4)
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(searchGlobalNavigation('Pikachu')).rejects.toMatchObject({ code: 'not_authorized' })
  await expect(searchGlobalNavigation('ab')).rejects.toMatchObject({ code: 'invalid_query' })
})
