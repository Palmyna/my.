import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type { VariantIdInput } from '../lib/variant-id'
import { createVariantDetailService, getVariantDetail } from './variant-detail'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const id = '9007199254740995'
const row = {
  variant_id: id, image_url: 'https://example.test/reverse.webp', card_name_fr: 'Pikachu', local_id: '28',
  rarity: 'Rare', category: 'Pokemon', set_name_fr: 'Légendes Brillantes', set_name_source: 'Shining Legends',
  set_abbreviation_fr: 'SL3.5', set_abbreviation: 'SLG', series_name_fr: 'Soleil et Lune', series_name_source: 'Sun & Moon',
  variant_label: 'Reverse', variant_type: 'reverse', variant_subtype: 'special', variant_size: 'standard',
  variant_foil: 'holo', variant_stamps: ['Z stamp', 'A stamp', 'Z stamp'], effective_release_date: '2017-10-06', date_origin: 'set',
}
const nullableKeys = ['image_url', 'card_name_fr', 'local_id', 'rarity', 'category', 'set_name_fr', 'set_name_source',
  'set_abbreviation_fr', 'set_abbreviation', 'series_name_fr', 'series_name_source', 'variant_label', 'variant_type',
  'variant_subtype', 'variant_size', 'variant_foil', 'effective_release_date']
function setup(data: unknown = row, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const client = { rpc } as unknown as SupabaseClient<Database>
  return { rpc, client, get: createVariantDetailService(client).getVariantDetail }
}

describe('independent variant detail', () => {
  it('calls only the detail RPC with lossless BIGINT and maps exactly the catalogue payload', async () => {
    const { rpc, get } = setup()
    expect(await get(id)).toEqual({
      variantId: id, imageUrl: row.image_url, cardNameFr: 'Pikachu', localId: '28', rarity: 'Rare', category: 'Pokemon',
      setNameFr: 'Légendes Brillantes', setNameSource: 'Shining Legends', setAbbreviationFr: 'SL3.5', setAbbreviation: 'SLG',
      seriesNameFr: 'Soleil et Lune', seriesNameSource: 'Sun & Moon', variantLabel: 'Reverse', variantType: 'reverse',
      variantSubtype: 'special', variantSize: 'standard', variantFoil: 'holo', variantStamps: ['Z stamp', 'A stamp', 'Z stamp'],
      effectiveReleaseDate: '2017-10-06', dateOrigin: 'set',
    })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_variant_detail', { p_variant_id: id })
  })
  it('preserves every nullable field and empty stamps without fallback', async () => {
    const nullableRow = { ...row, ...Object.fromEntries(nullableKeys.map(key => [key, null])), variant_stamps: [], date_origin: 'unknown' }
    const detail = await setup(nullableRow).get(id)
    expect(Object.values(detail).filter(value => value === null)).toHaveLength(nullableKeys.length)
    expect(detail).toMatchObject({ variantId: id, variantStamps: [], effectiveReleaseDate: null, dateOrigin: 'unknown' })
  })
  it.each(['variant', 'card', 'product', 'set', 'override', 'unknown'])('preserves persisted date with %s provenance', async date_origin => {
    expect(await setup({ ...row, date_origin }).get(id)).toMatchObject({ effectiveReleaseDate: '2017-10-06', dateOrigin: date_origin })
  })
  it.each(['-9223372036854775808', '9223372036854775807', '0'])('preserves boundary ID %s', async variant_id => {
    const { get, rpc } = setup({ ...row, variant_id })
    expect((await get(variant_id)).variantId).toBe(variant_id)
    expect(rpc).toHaveBeenCalledWith('get_variant_detail', { p_variant_id: variant_id })
  })
  it('accepts safe legacy numeric input through the existing helper', async () => {
    const { get, rpc } = setup({ ...row, variant_id: '42' })
    expect((await get(42)).variantId).toBe('42')
    expect(rpc).toHaveBeenCalledWith('get_variant_detail', { p_variant_id: '42' })
  })
  it('maps SQL null to unavailable', async () => {
    await expect(setup(null).get(id)).rejects.toMatchObject({ code: 'variant_unavailable' })
  })
  it.each(['', '01', '-0', '1.0', '1e3', ' 1', '1\n', '9223372036854775808', '-9223372036854775809',
    9007199254740996, NaN, Infinity, 1.5, null, undefined, {}, 1n])('rejects invalid ID %# before any Supabase call', async value => {
    const { get, rpc } = setup()
    await expect(get(value as VariantIdInput)).rejects.toMatchObject({ code: 'variant_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
    vi.mocked(getSupabaseClient).mockClear()
    await expect(getVariantDetail(value as VariantIdInput)).rejects.toMatchObject({ code: 'variant_unavailable' })
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })
  it.each([
    undefined, [], [row], {}, 'null', 1, { ...row, owned: true }, { ...row, variant_id: '42' },
    ...[42, 9007199254740995n, '01', '1\n', '9223372036854775808'].map(variant_id => ({ ...row, variant_id })),
    ...Object.keys(row).map(key => Object.fromEntries(Object.entries(row).filter(([name]) => name !== key))),
    ...nullableKeys.flatMap(key => [undefined, 7, {}, []].map(value => ({ ...row, [key]: value }))),
    ...[null, 'Z stamp', [null], [1], [['stamp']]].map(variant_stamps => ({ ...row, variant_stamps })),
    ...[null, 'other', 4, []].map(date_origin => ({ ...row, date_origin })),
  ].map(data => ({ data })))('fails closed on malformed payload %#', async ({ data }) => {
    // undefined must remain an explicit malformed response, not the setup default.
    const { get, rpc } = setup()
    rpc.mockResolvedValue({ data, error: null })
    await expect(get(id)).rejects.toMatchObject({ code: 'unexpected' })
  })
  it.each(['42501', 'PGRST301', 'PGRST302', 'PGRST303'])('maps authorization error %s without server details', async code => {
    await expect(setup(null, { code, message: 'private detail' }).get(id))
      .rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
  })
  it('maps other SQL and transport failures', async () => {
    await expect(setup(null, { code: 'XX000', message: 'private detail' }).get(id))
      .rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
    const { get, rpc } = setup()
    rpc.mockRejectedValue(new Error('private network detail'))
    await expect(get(id)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  })
  it('uses the application client and rejects its absence', async () => {
    const { client } = setup()
    vi.mocked(getSupabaseClient).mockReturnValue(client)
    expect((await getVariantDetail(id)).variantId).toBe(id)
    vi.mocked(getSupabaseClient).mockReturnValue(null)
    await expect(getVariantDetail(id)).rejects.toMatchObject({ code: 'not_authorized' })
  })
})
