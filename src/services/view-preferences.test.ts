import { createClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import type { BinderFormat, UserPreferencesPatch } from '../types/view-preferences'
import { DEFAULT_USER_PREFERENCES } from '../lib/view-preferences'
import {
  createViewPreferencesService, deleteCollectionViewOverride, getCollectionViewOverride, getUserPreferences,
  PreferencesError, saveCollectionViewOverride, saveUserPreferences,
} from './view-preferences'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const userId = 'a2000000-0000-0000-0000-000000000001'
const otherUser = 'a2000000-0000-0000-0000-000000000002'
const collectionId = 'c2000000-0000-0000-0000-000000000001'
const otherCollection = 'c2000000-0000-0000-0000-000000000002'
const globalRow = {
  user_id: userId, catalog_default_view: 'last_used', collection_default_view: 'last_used',
  last_catalog_view: 'list', last_collection_view: 'list', binder_default_format: '3x3',
}
const overrideRow = { user_id: userId, collection_id: collectionId, binder_format: '2x2' }
const access = [{ id: collectionId }]
type Reply = { data?: unknown; code?: string; status?: number; reject?: boolean }

function setup(...replies: Reply[]) {
  const fetcher = vi.fn<typeof fetch>()
  for (const reply of replies) {
    if (reply.reject) fetcher.mockRejectedValueOnce(new Error('private server URL'))
    else fetcher.mockResolvedValueOnce(new Response(JSON.stringify(reply.code
      ? { code: reply.code, message: 'private server text', details: 'secret details', hint: 'secret hint' }
      : reply.data), { status: reply.status ?? (reply.code ? 403 : 200), headers: { 'Content-Type': 'application/json' } }))
  }
  const client = createClient<Database>('https://supabase.example.test', 'test-key', {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  function call(index: number) {
    const [input, init] = fetcher.mock.calls[index]!
    return { url: new URL(input instanceof Request ? input.url : input), method: init?.method,
      body: init?.body ? JSON.parse(init.body as string) as unknown : undefined }
  }
  return { client, fetcher, service: createViewPreferencesService(client), call }
}

test('absent global preferences return functional defaults without any write', async () => {
  const mock = setup({ data: [] })
  await expect(mock.service.getGlobal(userId)).resolves.toEqual(DEFAULT_USER_PREFERENCES)
  expect(mock.fetcher).toHaveBeenCalledOnce()
  expect(mock.call(0).method).toBe('GET')
  expect(mock.call(0).url.searchParams.get('user_id')).toBe(`eq.${userId}`)
})

test('global preference payload decoded exactly', async () => {
  await expect(setup({ data: [{ ...globalRow, last_collection_view: 'binder', binder_default_format: '4x3' }] })
    .service.getGlobal(userId)).resolves.toEqual({ ...DEFAULT_USER_PREFERENCES, lastCollectionView: 'binder', binderDefaultFormat: '4x3' })
})

test.each([
  {}, { ...globalRow, user_id: otherUser }, { ...globalRow, user_id: 'bad' },
  { ...globalRow, binder_default_format: undefined }, { ...globalRow, binder_default_format: '5x5' },
  { ...globalRow, catalog_default_view: 'binder' }, { ...globalRow, last_collection_view: 'last_used' },
  { ...globalRow, collection_default_view: null }, { ...globalRow, extra: 'unexpected' },
])('malformed global response %j fails closed', async row => {
  await expect(setup({ data: [row] }).service.getGlobal(userId)).rejects.toHaveProperty('code', 'unexpected')
})

test('first global save inserts supplied fields only; SQL owns omitted defaults', async () => {
  const mock = setup({ data: null }, { data: { ...globalRow, binder_default_format: '2x2' } })
  await expect(mock.service.saveGlobal(userId, { binderDefaultFormat: '2x2' }))
    .resolves.toEqual({ ...DEFAULT_USER_PREFERENCES, binderDefaultFormat: '2x2' })
  expect(mock.call(0).body).toEqual({ binder_default_format: '2x2' })
  expect(mock.call(1).body).toEqual({ user_id: userId, binder_default_format: '2x2' })
  expect(mock.call(1).method).toBe('POST')
})

test('targeted global save preserves other preferences and only changes explicit last choice', async () => {
  const mock = setup({ data: { ...globalRow, collection_default_view: 'cards', last_collection_view: 'binder' } })
  await expect(mock.service.saveGlobal(userId, { lastCollectionView: 'binder' }))
    .resolves.toEqual({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'cards', lastCollectionView: 'binder' })
  expect(mock.fetcher).toHaveBeenCalledOnce()
  expect(mock.call(0).method).toBe('PATCH')
  expect(mock.call(0).body).toEqual({ last_collection_view: 'binder' })
})

test('all global fields can be saved explicitly', async () => {
  const mock = setup({ data: globalRow })
  await mock.service.saveGlobal(userId, { ...DEFAULT_USER_PREFERENCES })
  expect(mock.call(0).body).toEqual({ catalog_default_view: 'last_used', collection_default_view: 'last_used',
    last_catalog_view: 'list', last_collection_view: 'list', binder_default_format: '3x3' })
})

test('concurrent first global save retries targeted update without resetting concurrent fields', async () => {
  const mock = setup({ data: null }, { code: '23505', status: 409 }, { data: { ...globalRow, last_catalog_view: 'cards', binder_default_format: '4x3' } })
  await expect(mock.service.saveGlobal(userId, { binderDefaultFormat: '4x3' }))
    .resolves.toEqual({ ...DEFAULT_USER_PREFERENCES, lastCatalogView: 'cards', binderDefaultFormat: '4x3' })
  expect(mock.call(2).body).toEqual({ binder_default_format: '4x3' })
})

test.each(['', 'owner', ' a2000000-0000-0000-0000-000000000001', `${userId}x`])('invalid UUID %s never requests Supabase', async invalid => {
  const mock = setup()
  const operations = [() => mock.service.getGlobal(invalid), () => mock.service.saveGlobal(invalid, { binderDefaultFormat: '3x3' }),
    () => mock.service.getCollectionOverride(invalid, collectionId), () => mock.service.getCollectionOverride(userId, invalid),
    () => mock.service.saveCollectionOverride(userId, invalid, '3x3'), () => mock.service.deleteCollectionOverride(userId, invalid)]
  for (const operation of operations) await expect(operation()).rejects.toHaveProperty('code', 'invalid_input')
  expect(mock.fetcher).not.toHaveBeenCalled()
})

test.each([{}, { binderDefaultFormat: 'invalid' }, { lastCollectionView: 'last_used' }, { userId: otherUser }, { binderDefaultFormat: undefined }])('invalid global patch %j rejected before network', async input => {
  const mock = setup()
  await expect(mock.service.saveGlobal(userId, input as UserPreferencesPatch)).rejects.toHaveProperty('code', 'invalid_input')
  expect(mock.fetcher).not.toHaveBeenCalled()
})

test('missing override returns null for dynamic global inheritance', async () => {
  const mock = setup({ data: access }, { data: [] })
  await expect(mock.service.getCollectionOverride(userId, collectionId)).resolves.toBeNull()
  expect(mock.call(1).url.searchParams.get('user_id')).toBe(`eq.${userId}`)
  expect(mock.call(1).url.searchParams.get('collection_id')).toBe(`eq.${collectionId}`)
})

test('existing viewer override reads its exact format', async () => {
  await expect(setup({ data: access }, { data: [overrideRow] }).service.getCollectionOverride(userId, collectionId)).resolves.toBe('2x2')
})

test.each([{}, { ...overrideRow, user_id: otherUser }, { ...overrideRow, collection_id: otherCollection },
  { ...overrideRow, binder_format: null }, { ...overrideRow, binder_format: '5x5' }, { ...overrideRow, extra: 1 }])('invalid override payload %j fails closed', async row => {
  await expect(setup({ data: access }, { data: [row] }).service.getCollectionOverride(userId, collectionId)).rejects.toHaveProperty('code', 'unexpected')
})

test('explicit first override inserts format without copying global defaults', async () => {
  const mock = setup({ data: access }, { data: null }, { data: overrideRow })
  await expect(mock.service.saveCollectionOverride(userId, collectionId, '2x2')).resolves.toBe('2x2')
  expect(mock.call(1).body).toEqual({ binder_format: '2x2' })
  expect(mock.call(2).body).toEqual(overrideRow)
})

test('existing override changes format only for viewer + collection', async () => {
  const mock = setup({ data: access }, { data: { ...overrideRow, binder_format: '4x3' } })
  await expect(mock.service.saveCollectionOverride(userId, collectionId, '4x3')).resolves.toBe('4x3')
  expect(mock.call(1).body).toEqual({ binder_format: '4x3' })
  expect(mock.call(1).url.searchParams.get('user_id')).toBe(`eq.${userId}`)
  expect(mock.call(1).url.searchParams.get('collection_id')).toBe(`eq.${collectionId}`)
})

test('concurrent override creation retries once', async () => {
  const mock = setup({ data: access }, { data: null }, { code: '23505', status: 409 }, { data: overrideRow })
  await expect(mock.service.saveCollectionOverride(userId, collectionId, '2x2')).resolves.toBe('2x2')
  expect(mock.call(3).body).toEqual({ binder_format: '2x2' })
})

test.each(['5x5', '2×2', null, undefined])('invalid override format %s rejected before access read', async format => {
  const mock = setup()
  await expect(mock.service.saveCollectionOverride(userId, collectionId, format as BinderFormat)).rejects.toHaveProperty('code', 'invalid_input')
  expect(mock.fetcher).not.toHaveBeenCalled()
})

test('reset deletes override without saving a global value', async () => {
  const mock = setup({ data: access }, { data: overrideRow })
  await expect(mock.service.deleteCollectionOverride(userId, collectionId)).resolves.toBeUndefined()
  expect(mock.call(1).method).toBe('DELETE')
  expect(mock.call(1).body).toBeUndefined()
  expect(mock.call(1).url.searchParams.get('user_id')).toBe(`eq.${userId}`)
  expect(mock.call(1).url.searchParams.get('collection_id')).toBe(`eq.${collectionId}`)
})

test('reset already absent override is idempotent after access recheck', async () => {
  await expect(setup({ data: access }, { data: null }, { data: access }).service.deleteCollectionOverride(userId, collectionId)).resolves.toBeUndefined()
})

test('revoked access during reset never reports success', async () => {
  await expect(setup({ data: access }, { data: null }, { data: [] }).service.deleteCollectionOverride(userId, collectionId)).rejects.toHaveProperty('code', 'collection_unavailable')
})

test('inaccessible collection blocks every override operation before table access', async () => {
  for (const action of ['getCollectionOverride', 'saveCollectionOverride', 'deleteCollectionOverride'] as const) {
    const mock = setup({ data: [] })
    await expect(mock.service[action](userId, collectionId, '2x2')).rejects.toHaveProperty('code', 'collection_unavailable')
    expect(mock.fetcher).toHaveBeenCalledOnce()
  }
})

test.each(['42501', 'PGRST301', 'PGRST302', 'PGRST303', '23514', '23503', 'XX000'])('server error %s is sanitized across operations', async code => {
  const expected = ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) ? 'not_authorized' : 'unexpected'
  const mocks = [setup({ code }), setup({ code }), setup({ data: access }, { code }),
    setup({ data: access }, { code }), setup({ data: access }, { code })]
  const operations = [() => mocks[0]!.service.getGlobal(userId), () => mocks[1]!.service.saveGlobal(userId, { binderDefaultFormat: '2x2' }),
    () => mocks[2]!.service.getCollectionOverride(userId, collectionId), () => mocks[3]!.service.saveCollectionOverride(userId, collectionId, '2x2'),
    () => mocks[4]!.service.deleteCollectionOverride(userId, collectionId)]
  for (const operation of operations) {
    const error: unknown = await operation().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(PreferencesError)
    expect(error).toMatchObject({ code: expected, message: expected })
    expect(JSON.stringify(error)).not.toContain('private')
    for (const field of ['details', 'hint', 'cause']) expect(error).not.toHaveProperty(field)
  }
})

test('network failure never exposes raw URL', async () => {
  await expect(setup({ reject: true }).service.getGlobal(userId)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
})

test('failed conflict retry cannot report save success', async () => {
  await expect(setup({ data: null }, { code: '23505', status: 409 }, { data: null }).service.saveGlobal(userId, { binderDefaultFormat: '2x2' }))
    .rejects.toHaveProperty('code', 'not_authorized')
})

test('runtime entry points use common client and fail safely if unconfigured', async () => {
  const mock = setup({ data: [globalRow] }, { data: globalRow }, { data: access }, { data: [overrideRow] },
    { data: access }, { data: overrideRow }, { data: access }, { data: overrideRow })
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await getUserPreferences(userId)
  await saveUserPreferences(userId, { binderDefaultFormat: '3x3' })
  await getCollectionViewOverride(userId, collectionId)
  await saveCollectionViewOverride(userId, collectionId, '2x2')
  await deleteCollectionViewOverride(userId, collectionId)
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  for (const operation of [() => getUserPreferences(userId), () => saveUserPreferences(userId, { binderDefaultFormat: '3x3' }),
    () => getCollectionViewOverride(userId, collectionId), () => saveCollectionViewOverride(userId, collectionId, '3x3'),
    () => deleteCollectionViewOverride(userId, collectionId)]) await expect(operation()).rejects.toHaveProperty('code', 'not_authorized')
})
