import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { createPhysicalCopiesService, createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, PhysicalCopiesError, updatePhysicalCopy } from './physical-copies'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const copy = { id: 'copy-id', name: null, note: null, created_at: '2026-09-23T00:00:00Z' }

test('list exposes the exact multiline note', async () => {
  const row = { ...copy, note: '  Recto intact\nVerso : rayure\n ' }
  await expect(setup([row]).service.list('owner', 42)).resolves.toEqual([row])
})

test.each(['', ' \t\n ', '  Recto\n\nVerso  \n', 'x'.repeat(750), '📝'.repeat(750)])('create and update preserve optional note %j', async note => {
  const mock = setup()
  const expected = { name: 'Nom', note: note.trim() ? note : null }
  await mock.service.create(42, ' Nom ', note)
  expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ variant_id: 42, ...expected })
  await mock.service.update(copy.id, ' Nom ', note)
  expect(mock.update).toHaveBeenCalledExactlyOnceWith(expected)
})

test.each(['x'.repeat(751), '📝'.repeat(751)])('oversized note is rejected before any request', async note => {
  const mock = setup()
  for (const operation of [() => mock.service.create(42, '', note), () => mock.service.update(copy.id, '', note)]) {
    await expect(operation()).rejects.toMatchObject({ code: 'note_too_long', message: 'note_too_long' })
  }
  expect(mock.from).not.toHaveBeenCalled()
})

function setup(data: unknown = { id: copy.id }, error: unknown = null) {
  const result = { data, error }
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  const from = vi.fn().mockReturnValue(builder)
  const client = { from } as unknown as SupabaseClient<Database>
  return { service: createPhysicalCopiesService(client), client, from,
    select: builder.select, eq: builder.eq, order: builder.order, insert: builder.insert,
    update: builder.update, delete: builder.delete, single: builder.single, maybeSingle: builder.maybeSingle }
}

test('list filters owner and variant and orders by creation then ID', async () => {
  const mock = setup([copy])
  await expect(mock.service.list('owner', 42)).resolves.toEqual([copy])
  expect(mock.from).toHaveBeenCalledExactlyOnceWith('physical_copies')
  expect(mock.select).toHaveBeenCalledExactlyOnceWith('id,name,note,created_at')
  expect(mock.eq.mock.calls).toEqual([['user_id', 'owner'], ['variant_id', 42]])
  expect(mock.order.mock.calls).toEqual([['created_at'], ['id']])
})

test.each(['', '  ', ' Mon exemplaire '])('create exactly one copy, normalize optional name %j', async name => {
  const mock = setup()
  await expect(mock.service.create(42, name)).resolves.toBeUndefined()
  expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ variant_id: 42, name: name.trim() || null, note: null })
  expect(mock.select).toHaveBeenCalledExactlyOnceWith('id')
  expect(mock.single).toHaveBeenCalledOnce()
})

test('create without name persists NULL', async () => {
  const mock = setup()
  await mock.service.create(42)
  expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ variant_id: 42, name: null, note: null })
})

test.each([' Nouveau nom ', '', '\t\n'])('update changes only name, supports clearing %j', async name => {
  const mock = setup()
  await mock.service.update(copy.id, name, '')
  expect(mock.update).toHaveBeenCalledExactlyOnceWith({ name: name.trim() || null, note: null })
  expect(mock.eq).toHaveBeenCalledExactlyOnceWith('id', copy.id)
  expect(mock.maybeSingle).toHaveBeenCalledOnce()
})

test('delete targets only one physical copy', async () => {
  const mock = setup()
  await mock.service.delete(copy.id)
  expect(mock.from).toHaveBeenCalledExactlyOnceWith('physical_copies')
  expect(mock.delete).toHaveBeenCalledOnce()
  expect(mock.eq).toHaveBeenCalledExactlyOnceWith('id', copy.id)
  expect(mock.select).toHaveBeenCalledExactlyOnceWith('id')
})

test.each(['update', 'delete'] as const)('zero rows for %s never reports success', async operation => {
  await expect(setup(null).service[operation](copy.id, '', '')).rejects.toMatchObject({ code: 'copy_unavailable' })
})

test.each([
  ['42501', 'private PostgreSQL text', 'not_authorized'],
  ['PGRST301', 'private JWT text', 'not_authorized'],
  ['PGRST302', 'private JWT text', 'not_authorized'],
  ['PGRST303', 'private JWT text', 'not_authorized'],
  ['23503', 'constraint "physical_copies_variant_id_fkey"', 'variant_unavailable'],
  ['23503', 'constraint "physical_copies_user_id_fkey"', 'unexpected'],
  ['23514', 'physical_copies_note_length_check private value', 'unexpected'],
  ['XX000', 'raw server failure', 'unexpected'],
])('safe mapping %s', async (code, message, expected) => {
  const raw = { code, message, details: 'private details', hint: 'private hint' }
  const mock = setup(null, raw)
  for (const operation of [() => mock.service.list('owner', 42), () => mock.service.create(42),
    () => mock.service.update(copy.id, '', ''), () => mock.service.delete(copy.id)]) {
    const error: unknown = await operation().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(PhysicalCopiesError)
    expect(error).toMatchObject({ code: expected, message: expected })
    for (const field of ['details', 'hint', 'cause']) expect(error).not.toHaveProperty(field)
    expect(JSON.stringify(error)).not.toContain(message)
  }
})

test('rejected network error is sanitized', async () => {
  const mock = setup()
  mock.single.mockRejectedValue(new Error('secret server URL'))
  await expect(mock.service.create(42)).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
})

test.each([null, {}, [{ ...copy, name: 3 }], [{ ...copy, note: 3 }], [{ ...copy, note: undefined }], [{ ...copy, created_at: 'invalid' }], [{ ...copy, id: '' }]])('invalid listing %j fails closed', async data => {
  await expect(setup(data).service.list('owner', 42)).rejects.toHaveProperty('code', 'unexpected')
})

test.each([{}, { id: '' }, { id: 42 }])('invalid mutation %j fails closed', async data => {
  await expect(setup(data).service.create(42)).rejects.toHaveProperty('code', 'unexpected')
})

test('all runtime entry points use configured client and fail safely without it', async () => {
  const mock = setup()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await createPhysicalCopy(42, '')
  await updatePhysicalCopy(copy.id, 'Nom', '')
  await deletePhysicalCopy(copy.id)
  const listing = setup([copy])
  vi.mocked(getSupabaseClient).mockReturnValue(listing.client)
  await expect(listPhysicalCopies('owner', 42)).resolves.toEqual([copy])
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  for (const operation of [() => createPhysicalCopy(42, ''), () => updatePhysicalCopy(copy.id, '', ''),
    () => deletePhysicalCopy(copy.id), () => listPhysicalCopies('owner', 42)]) {
    await expect(operation()).rejects.toHaveProperty('code', 'not_authorized')
  }
})
