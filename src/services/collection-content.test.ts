import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { CollectionContentError, createCollectionContentService, decodeCollectionContentV2, getCollectionContent, getCollectionContentV2 } from './collection-content'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const collectionId = 'c1600000-0000-0000-0000-000000000001'
const firstId = 'd1600000-0000-0000-0000-000000000002'
const secondId = 'd1600000-0000-0000-0000-000000000001'
const row = () => ({
  collection_item_id: firstId, variant_id: '9007199254740995', source_card_id: '9007199254740996', set_id: '9223372036854775807', origin: 'manual',
  card_name_fr: 'Évoli', local_id: 'TG01', set_name_fr: 'Extension précise', set_abbreviation_fr: 'FR', set_abbreviation: 'EXT', series_name_fr: 'Soleil et Lune', series_name_source: 'Sun & Moon',
  image_url: 'https://example.invalid/variant/original.png', variant_label: 'Holo Cosmos Stamp corrigé', owned: true,
})
const envelope = () => ({ order_contract_version: 2, personal_revision: '9007199254740995', items: [{ ...row(), is_hidden: false }] })
function setup(data: unknown = [row()], error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error }), from = vi.fn()
  const client = { rpc, from } as unknown as SupabaseClient<Database>
  return { rpc, from, client, service: createCollectionContentService(client) }
}

test.each([1, 2])('v2 reader transports actual contract %s and complete authoritative rows', async version => {
  const mock = setup({ ...envelope(), order_contract_version: version })
  const content = await mock.service.getCollectionContentV2(collectionId)
  expect(content).toEqual({ orderContractVersion: version, personalRevision: '9007199254740995',
    items: [expect.objectContaining({ variantId: '9007199254740995', isHidden: false, owned: true })] })
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('get_collection_content_v2', { p_collection_id: collectionId })
  expect(mock.from).not.toHaveBeenCalled()
})
test('v2 visible empty is an envelope; SQL NULL is unavailable', async () => {
  await expect(setup({ ...envelope(), items: [] }).service.getCollectionContentV2(collectionId)).resolves.toHaveProperty('items', [])
  await expect(setup(null).service.getCollectionContentV2(collectionId)).rejects.toHaveProperty('code', 'collection_unavailable')
})
test.each(['0', '9007199254740994', '9223372036854775807'])('exact personal revision %s', revision => {
  expect(decodeCollectionContentV2({ ...envelope(), personal_revision: revision }).personalRevision).toBe(revision)
})
test.each([-1, 12, null, undefined, '-1', '01', '+1', '1.0', '1e3', ' 1', '9223372036854775808'])('rejects revision %j', revision => {
  expect(() => decodeCollectionContentV2({ ...envelope(), personal_revision: revision })).toThrow(CollectionContentError)
})
test.each([0, 3, '2', null, undefined])('rejects unknown order contract %j', version => {
  expect(() => decodeCollectionContentV2({ ...envelope(), order_contract_version: version })).toThrow(CollectionContentError)
})
test.each(Object.keys(envelope()))('rejects missing envelope field %s', field => {
  const payload: Record<string, unknown> = envelope(); delete payload[field]
  expect(() => decodeCollectionContentV2(payload)).toThrow(CollectionContentError)
})
test.each(Object.keys({ ...row(), is_hidden: false }))('rejects missing v2 item field %s', field => {
  const item: Record<string, unknown> = { ...row(), is_hidden: false }; delete item[field]
  expect(() => decodeCollectionContentV2({ ...envelope(), items: [item] })).toThrow(CollectionContentError)
})
test.each([true, null, undefined, 0, 'false'])('rejects unsupported hidden state %j before 8C', is_hidden => {
  expect(() => decodeCollectionContentV2({ ...envelope(), items: [{ ...row(), is_hidden }] })).toThrow(CollectionContentError)
})
test('rejects extra keys, numeric identifiers, malformed UUID, unknown origin and both duplicate identities', () => {
  for (const payload of [[], { ...envelope(), extra: true }, { ...envelope(), items: [{ ...row(), is_hidden: false, extra: true }] },
    ...['variant_id', 'source_card_id', 'set_id'].map(key => ({ ...envelope(), items: [{ ...row(), is_hidden: false, [key]: 42 }] })),
    { ...envelope(), items: [{ ...row(), collection_item_id: 'bad', is_hidden: false }] },
    { ...envelope(), items: [{ ...row(), origin: 'future', is_hidden: false }] },
    { ...envelope(), items: [envelope().items[0], { ...envelope().items[0], variant_id: '42', collection_item_id: firstId.toUpperCase() }] },
    { ...envelope(), items: [envelope().items[0], { ...envelope().items[0], collection_item_id: secondId }] }]) {
    expect(() => decodeCollectionContentV2(payload)).toThrow(CollectionContentError)
  }
})
test('old decoder stays strict and rejects v2 envelopes/items', async () => {
  await expect(setup(envelope()).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
  await expect(setup(envelope().items).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test('public v2 wrapper uses generated RPC and safe auth/errors', async () => {
  const mock = setup(envelope()); vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await expect(getCollectionContentV2(collectionId)).resolves.toHaveProperty('orderContractVersion', 2)
  await expect(setup(null, { code: '42501', message: 'private SQL' }).service.getCollectionContentV2(collectionId)).rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(getCollectionContentV2(collectionId)).rejects.toHaveProperty('code', 'not_authorized')
  const invalid = setup(envelope())
  await expect(invalid.service.getCollectionContentV2('bad')).rejects.toHaveProperty('code', 'unexpected')
  expect(invalid.rpc).not.toHaveBeenCalled()
})

test('one RPC maps the complete row, preserving the BIGINT string, exact labels and image', async () => {
  const mock = setup()
  const content = await mock.service.getCollectionContent(collectionId)
  expect(content).toEqual([{
    collectionItemId: firstId, variantId: '9007199254740995', sourceCardId: '9007199254740996', setId: '9223372036854775807', origin: 'manual',
    cardNameFr: 'Évoli', localId: 'TG01', setNameFr: 'Extension précise', setAbbreviationFr: 'FR', setAbbreviation: 'EXT', seriesNameFr: 'Soleil et Lune', seriesNameSource: 'Sun & Moon',
    imageUrl: 'https://example.invalid/variant/original.png', variantLabel: 'Holo Cosmos Stamp corrigé', owned: true,
  }])
  expect(content[0]?.variantId).toBe('9007199254740995')
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('get_collection_content', { p_collection_id: collectionId })
  expect(mock.from).not.toHaveBeenCalled()
})
test('empty content is valid without claiming collection availability', async () => {
  await expect(setup([]).service.getCollectionContent(collectionId)).resolves.toEqual([])
})
test('preserves received order, both origins, owned=false and every nullable field', async () => {
  const data = [row(), { collection_item_id: secondId, variant_id: '42', source_card_id: '456', set_id: '78', origin: 'automatic',
    card_name_fr: null, local_id: null, set_name_fr: null, set_abbreviation_fr: null, set_abbreviation: null, series_name_fr: null, series_name_source: null, image_url: null, variant_label: null, owned: false }]
  const before = structuredClone(data)
  await expect(setup(data).service.getCollectionContent(collectionId)).resolves.toEqual([
    expect.objectContaining({ collectionItemId: firstId, origin: 'manual', owned: true }),
    { collectionItemId: secondId, variantId: '42', sourceCardId: '456', setId: '78', origin: 'automatic', cardNameFr: null,
      localId: null, setNameFr: null, setAbbreviationFr: null, setAbbreviation: null, seriesNameFr: null, seriesNameSource: null, imageUrl: null, variantLabel: null, owned: false },
  ])
  expect(data).toEqual(before)
})
test.each(['0', '-42', '-9007199254740995', '-9223372036854775808', '9223372036854775807'])(
  'preserves canonical BIGINT decimal %s', async variant_id => {
    const result = await setup([{ ...row(), variant_id }]).service.getCollectionContent(collectionId)
    expect(result[0]?.variantId).toBe(variant_id)
  })
test('does not truncate a payload exceeding 1000 items', async () => {
  const data = Array.from({ length: 1005 }, (_, n) => ({ ...row(), variant_id: String(n + 1),
    collection_item_id: `d1600000-0000-0000-0000-${String(n + 1).padStart(12, '0')}` }))
  const content = await setup(data).service.getCollectionContent(collectionId)
  expect(content).toHaveLength(1005)
  expect(content.map(item => item.collectionItemId)).toEqual(data.map(item => item.collection_item_id))
})
test.each([null, undefined, {}, '[]', 1, true])('rejects non-array payload %j', async data => {
  // Explicit undefined must reach the mock instead of setup's default argument.
  const mock = setup(); mock.rpc.mockResolvedValue({ data, error: null })
  await expect(mock.service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test.each([null, [], 'row', 42, true])('rejects non-object entry %j', async value => {
  await expect(setup([value]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test.each(['', 'item', 'd1600000-0000-0000-0000-00000000000z', `${firstId}\n`, null, 42])('rejects invalid item ID %j', async collection_item_id => {
  await expect(setup([{ ...row(), collection_item_id }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test.each(['', ' 42', '42 ', '42\n', '1.5', '1e3', '+42', '01', '-0', 'NaN', '9223372036854775808', '-9223372036854775809', 42, null])(
  'rejects invalid decimal variant ID %j', async variant_id => {
    await expect(setup([{ ...row(), variant_id }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
  })
test.each(['Manual', 'tcgdex', '', null, 1])('rejects invalid origin %j', async origin => {
  await expect(setup([{ ...row(), origin }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test.each(['true', 'false', 0, 1, null])('rejects non-boolean ownership %j', async owned => {
  await expect(setup([{ ...row(), owned }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test.each(['card_name_fr', 'local_id', 'set_name_fr', 'set_abbreviation', 'set_abbreviation_fr', 'series_name_fr', 'series_name_source', 'image_url', 'variant_label'])(
  'rejects wrong types for nullable field %s', async field => {
    for (const value of [42, false, [], {}]) {
      await expect(setup([{ ...row(), [field]: value }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
    }
  })
test.each(Object.keys(row()))('rejects missing field %s', async field => {
  const value: Record<string, unknown> = row(); delete value[field]
  await expect(setup([value]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
test('rejects extra fields and duplicate item/variant identities', async () => {
  for (const data of [[{ ...row(), extra: 'unexpected' }], [row(), { ...row(), variant_id: '42' }],
    [row(), { ...row(), collection_item_id: secondId }]]) {
    await expect(setup(data).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
  }
})
test.each(['42501', 'PGRST301', 'PGRST302', 'PGRST303', 'PGRST202', 'P0002', '57014', 'unknown'])(
  'maps backend error %s without exposing private details', async code => {
    const raw = { code, message: 'private message', details: 'private details', hint: 'private hint' }
    const error: unknown = await setup(null, raw).service.getCollectionContent(collectionId).catch((cause: unknown) => cause)
    const expected = ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) ? 'not_authorized' : 'unexpected'
    expect(error).toBeInstanceOf(CollectionContentError)
    expect(error).toMatchObject({ code: expected, message: expected })
    for (const field of ['details', 'hint', 'cause']) expect(error).not.toHaveProperty(field)
    expect(JSON.stringify(error)).not.toContain('private')
  })
test('runtime wrapper handles client absence and transport exceptions safely', async () => {
  const mock = setup([])
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await expect(getCollectionContent(collectionId)).resolves.toEqual([])
  mock.rpc.mockRejectedValue(new Error('private transport URL'))
  await expect(getCollectionContent(collectionId)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'not_authorized')
})
test('invalid collection argument fails safely without a backend request', async () => {
  const mock = setup()
  await expect(mock.service.getCollectionContent('invalid')).rejects.toHaveProperty('code', 'unexpected')
  expect(mock.rpc).not.toHaveBeenCalled()
})

test.each(['source_card_id', 'set_id'] as const)('navigation ID %s is required canonical BIGINT text', async field => {
  for (const value of ['0', '-42', '9007199254740995', '-9223372036854775808', '9223372036854775807']) {
    const content = await setup([{ ...row(), [field]: value }]).service.getCollectionContent(collectionId)
    expect(content[0]?.[field === 'source_card_id' ? 'sourceCardId' : 'setId']).toBe(value)
  }
  for (const value of [42, Number.MAX_SAFE_INTEGER + 2, null, undefined, '', 'abc', '01', '-0', '+42', '1.5', '1e3', '42\n', ' 42', '9223372036854775808', '-9223372036854775809']) {
    await expect(setup([{ ...row(), [field]: value }]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
  }
  const missing: Record<string, unknown> = row(); delete missing[field]; missing.extra = 'replacement'
  await expect(setup([missing]).service.getCollectionContent(collectionId)).rejects.toHaveProperty('code', 'unexpected')
})
