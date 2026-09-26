import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { createCatalogSearchService, searchCatalogVariantsForAdd } from './catalog-search'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const row = { variant_id: '9007199254740995', image_url: null, card_name_fr: 'Pikachu',
  set_name_fr: 'Légendes Brillantes', local_id: '28', variant_label: 'Reverse' }
function setup(data: unknown = [row], error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const client = { rpc } as unknown as SupabaseClient<Database>
  return { rpc, client, search: createCatalogSearchService(client).searchCatalogVariantsForAdd }
}
describe('exact catalogue variant search', () => {
  it('calls only the dedicated typed RPC and preserves BIGINT, labels, nulls and order', async () => {
    const { rpc, search } = setup([row, { ...row, variant_id: '2', variant_label: null }])
    expect(await search('Pikachu 28', { limit: 2, offset: 7 })).toEqual([
      { variantId: '9007199254740995', imageUrl: null, cardNameFr: 'Pikachu', setNameFr: 'Légendes Brillantes', localId: '28', variantLabel: 'Reverse' },
      { variantId: '2', imageUrl: null, cardNameFr: 'Pikachu', setNameFr: 'Légendes Brillantes', localId: '28', variantLabel: null },
    ])
    expect(rpc).toHaveBeenCalledExactlyOnceWith('search_catalog_variants_for_add', { p_query: 'Pikachu 28', p_limit: 2, p_offset: 7 })
  })
  it('accepts empty results and one useful character, with server defaults mirrored', async () => {
    const { rpc, search } = setup([])
    expect(await search('2')).toEqual([])
    expect(rpc).toHaveBeenCalledExactlyOnceWith('search_catalog_variants_for_add', { p_query: '2', p_limit: 20, p_offset: 0 })
  })
  it('uses the authenticated application client', async () => {
    const { client } = setup()
    vi.mocked(getSupabaseClient).mockReturnValue(client)
    expect((await searchCatalogVariantsForAdd('Pikachu'))[0]?.variantId).toBe('9007199254740995')
    vi.mocked(getSupabaseClient).mockReturnValue(null)
    await expect(searchCatalogVariantsForAdd('Pikachu')).rejects.toMatchObject({ code: 'not_authorized' })
  })
  it.each(['', '   ', ' & , !! ', 'x'.repeat(201)])('rejects invalid query %j before RPC', async query => {
    const { rpc, search } = setup()
    await expect(search(query)).rejects.toMatchObject({ code: 'invalid_query' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN }, { offset: -1 }, { offset: 1.5 }, { offset: 2147483648 }])('rejects invalid paging %j', async options => {
    const { rpc, search } = setup()
    await expect(search('Pikachu', options)).rejects.toMatchObject({ code: 'invalid_query' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([null, {}, '[]', [null], [[]], [1], [{ ...row, unexpected: true }], [{ ...row, variant_id: undefined }],
    ...[9007199254740995n, 42, '', '01', '-0', '1.0', '1e3', ' 1', '1\n', '9223372036854775808', '-9223372036854775809'].map(variant_id => [{ ...row, variant_id }]),
    ...['image_url', 'card_name_fr', 'set_name_fr', 'local_id', 'variant_label'].flatMap(key => [undefined, 5, {}, []].map(value => [{ ...row, [key]: value }])),
    [row, row],
  ].map(data => ({ data })))('fails closed on malformed payload %#', async ({ data }) => {
    await expect(setup(data).search('Pikachu')).rejects.toMatchObject({ code: 'unexpected' })
  })
  it('rejects oversized pages and accepts nullable display values without fallback', async () => {
    await expect(setup([row, { ...row, variant_id: '2' }]).search('Pikachu', { limit: 1 })).rejects.toMatchObject({ code: 'unexpected' })
    expect(await setup([{ variant_id: '-9223372036854775808', image_url: null, card_name_fr: null, set_name_fr: null, local_id: null, variant_label: null }]).search('Pikachu')).toEqual([
      { variantId: '-9223372036854775808', imageUrl: null, cardNameFr: null, setNameFr: null, localId: null, variantLabel: null },
    ])
  })
  it.each([['42501', 'not_authorized'], ['PGRST301', 'not_authorized'], ['PGRST302', 'not_authorized'], ['PGRST303', 'not_authorized'],
    ['22023', 'invalid_query'], ['22P02', 'invalid_query'], ['22003', 'invalid_query'], ['XX000', 'unexpected']])('maps %s without leaking server messages', async (code, expected) => {
    await expect(setup(null, { code, message: 'private server detail' }).search('Pikachu')).rejects.toMatchObject({ code: expected, message: expected })
  })
  it('maps rejected transport failures', async () => {
    const { rpc, search } = setup()
    rpc.mockRejectedValue(new Error('private network detail'))
    await expect(search('Pikachu')).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  })
})
