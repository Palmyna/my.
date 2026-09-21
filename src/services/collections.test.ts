import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import type { CreateAutomaticCollectionInput, CreateFreeCollectionInput } from '../types/collections'
import { CollectionsError, createCollectionsService, createFree, listDashboardCollections } from './collections'
import { getSupabaseClient } from './supabase'

vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))

const id = 'c1200000-0000-0000-0000-000000000001'
const nameCheck = { code: '23514', message: 'new row for relation "collections" violates check constraint "collections_name_check"' }
const automatic: CreateAutomaticCollectionInput = { name: 'Collection Pokémon', targetType: 'pokemon', targetId: 25 }

test('le point d’entrée Dashboard utilise le service avec le client configuré', async () => {
  const mock = mockCollectionsClient()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await expect(listDashboardCollections()).resolves.toEqual([])
  expect(mock.from).toHaveBeenCalledExactlyOnceWith('dashboard_collections')
  expect(mock.dashboardSelect).toHaveBeenCalledOnce()
})

test('le point d’entrée Dashboard échoue proprement sans client configuré', async () => {
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(listDashboardCollections()).rejects.toMatchObject({ code: 'not_authorized' })
})

test('le point d’entrée création libre délègue sans modifier le nom', async () => {
  const mock = mockCollectionsClient()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  await expect(createFree({ name: '  Mes cartes  ' })).resolves.toEqual({ collectionId: id })
  expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ name: '  Mes cartes  ', collection_type: 'free' })
})

test('le point d’entrée création libre refuse un client absent', async () => {
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  await expect(createFree({ name: 'Mes cartes' })).rejects.toMatchObject({ code: 'not_authorized' })
})

function mockCollectionsClient() {
  const single = vi.fn().mockResolvedValue({ data: { id }, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id }, error: null })
  const select = vi.fn(() => ({ single, maybeSingle }))
  const eq = vi.fn(() => ({ select }))
  const insert = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const remove = vi.fn(() => ({ eq }))
  const dashboardSelect = vi.fn().mockResolvedValue({ data: [], error: null })
  const from = vi.fn((table: string) => table === 'dashboard_collections'
    ? { select: dashboardSelect } : { insert, update, delete: remove })
  const rpc = vi.fn().mockResolvedValue({ data: [{ collection_id: id, created: true }], error: null })
  const client = { from, rpc } as unknown as SupabaseClient<Database>
  return { client, service: createCollectionsService(client), from, insert, update, remove, eq, select, single, maybeSingle, rpc, dashboardSelect }
}

describe('création libre', () => {
  test('payload autorisé uniquement, nom intact et ID métier', async () => {
    const mock = mockCollectionsClient()
    const input = { name: '  Ma collection\t', owner_id: 'other', target_set_id: 1, applied_target_version: 99 } as CreateFreeCollectionInput
    await expect(mock.service.createFree(input)).resolves.toEqual({ collectionId: id })
    expect(mock.from).toHaveBeenCalledExactlyOnceWith('collections')
    expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ name: input.name, collection_type: 'free' })
    expect(mock.select).toHaveBeenCalledExactlyOnceWith('id')
    expect(mock.single).toHaveBeenCalledOnce()
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.remove).not.toHaveBeenCalled()
  })
  test.each([' AB ', '\u00a0AB\u3000', ' 😀 '])('la base valide le nom %j, sans trim ni comptage JS', async name => {
    const mock = mockCollectionsClient()
    mock.single.mockResolvedValue({ data: null, error: nameCheck })
    await expect(mock.service.createFree({ name })).rejects.toMatchObject({ code: 'invalid_name' })
    expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ name, collection_type: 'free' })
  })
  test('trois caractères Unicode sont transmis sans normalisation', async () => {
    const mock = mockCollectionsClient()
    await expect(mock.service.createFree({ name: ' 😀😀😀 ' })).resolves.toEqual({ collectionId: id })
    expect(mock.insert).toHaveBeenCalledExactlyOnceWith({ name: ' 😀😀😀 ', collection_type: 'free' })
  })
  test('NOT NULL du seul nom devient invalid_name', async () => {
    const mock = mockCollectionsClient()
    mock.single.mockResolvedValue({ data: null, error: {
      code: '23502', message: 'null value in column "name" of relation "collections" violates not-null constraint',
    } })
    await expect(mock.service.createFree({ name: null } as unknown as CreateFreeCollectionInput)).rejects.toMatchObject({ code: 'invalid_name' })
  })
  test('refus RLS transmis comme erreur métier', async () => {
    const mock = mockCollectionsClient()
    mock.single.mockResolvedValue({ data: null, error: { code: '42501', message: 'private raw text' } })
    await expect(mock.service.createFree({ name: 'Valid' })).rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
  })
  test.each([null, {}, { id: null }, { id: '' }, { id: 42 }])('réponse libre invalide %j sans faux succès', async data => {
    const mock = mockCollectionsClient()
    mock.single.mockResolvedValue({ data, error: null })
    await expect(mock.service.createFree({ name: 'Valid' })).rejects.toHaveProperty('code', 'unexpected')
  })
})

describe('création ou ouverture automatique', () => {
  test.each([true, false])('un appel RPC exact, created=%s', async created => {
    const mock = mockCollectionsClient()
    mock.rpc.mockResolvedValue({ data: [{ collection_id: id, created, extra: 'not exposed' }], error: null })
    const input = { ...automatic, name: created ? automatic.name : 'x', owner_id: 'other', variants: [1], hash: 'client-hash',
      automatic_rank: 9, sort_position: 9, version: 999 } as CreateAutomaticCollectionInput
    await expect(mock.service.createAutomatic(input)).resolves.toEqual({ collectionId: id, created })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('create_automatic_collection', {
      p_name: input.name, p_target_type: 'pokemon', p_target_id: 25,
    })
    // No catalogue read, item write or local reconstruction accompanies the RPC.
    expect(mock.from).not.toHaveBeenCalled()
  })
  test('la cible set utilise la même RPC et son ID exact', async () => {
    const mock = mockCollectionsClient()
    await mock.service.createAutomatic({ name: 'Extension', targetType: 'set', targetId: 188 })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('create_automatic_collection', {
      p_name: 'Extension', p_target_type: 'set', p_target_id: 188,
    })
  })
  test.each([
    ['23514', 'automatic_collection_empty', 'empty_automatic_target'],
    ['P0002', 'automatic_target_state_missing', 'automatic_state_missing'],
    ['23514', 'automatic_target_hash_mismatch', 'automatic_state_inconsistent'],
    ['22023', 'Invalid automatic target type', 'invalid_target'],
    ['22023', 'Automatic target ID is required', 'invalid_target'],
    ['P0002', 'Automatic target does not exist', 'target_not_found'],
    ['23514', nameCheck.message, 'invalid_name'],
    ['42501', 'Authenticated aal2 session required', 'not_authorized'],
    ['42501', 'MY. profile required', 'not_authorized'],
    ['PGRST301', 'JWT invalid', 'not_authorized'],
    ['PGRST302', 'Authentication missing', 'not_authorized'],
    ['PGRST303', 'JWT expired', 'not_authorized'],
    ['23514', 'some_new_constraint', 'unexpected'],
    ['23502', 'null value in column "owner_id" of relation "collections" violates not-null constraint', 'unexpected'],
    ['22023', 'some_new_argument_error', 'unexpected'],
    ['P0002', 'some_other_missing_object', 'unexpected'],
    ['XX000', 'automatic_collection_empty', 'unexpected'],
    ['PGRST202', 'RPC absent from schema cache', 'unexpected'],
    ['PGRST300', 'JWT configuration error', 'unexpected'],
  ])('mapping contrôlé %s / %s → %s', async (code, message, expected) => {
    const mock = mockCollectionsClient()
    const raw = { code, message, details: 'private details', hint: 'private hint' }
    mock.rpc.mockResolvedValue({ data: null, error: raw })
    const error: unknown = await mock.service.createAutomatic(automatic).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CollectionsError)
    expect(error).toMatchObject({ code: expected, message: expected })
    expect(error).not.toBe(raw)
    expect(error).not.toHaveProperty('cause')
    expect(error).not.toHaveProperty('details')
    expect(error).not.toHaveProperty('hint')
    expect(mock.rpc).toHaveBeenCalledOnce()
    expect(mock.from).not.toHaveBeenCalled()
  })
  test.each([null, [], {}, [{ collection_id: id, created: true }, { collection_id: id, created: false }],
    [{}], [{ collection_id: id }], [{ collection_id: '', created: true }], [{ collection_id: id, created: 'false' }],
  ])('refuse une réponse RPC invalide %j', async data => {
    const mock = mockCollectionsClient()
    mock.rpc.mockResolvedValue({ data, error: null })
    await expect(mock.service.createAutomatic(automatic)).rejects.toHaveProperty('code', 'unexpected')
  })
})

describe('renommage et suppression sous RLS', () => {
  test('renomme uniquement le champ name de l’ID demandé', async () => {
    const mock = mockCollectionsClient()
    await expect(mock.service.rename(id, '  Nouveau nom ')).resolves.toEqual({ collectionId: id })
    expect(mock.from).toHaveBeenCalledExactlyOnceWith('collections')
    expect(mock.update).toHaveBeenCalledExactlyOnceWith({ name: '  Nouveau nom ' })
    expect(mock.eq).toHaveBeenCalledExactlyOnceWith('id', id)
    expect(mock.select).toHaveBeenCalledExactlyOnceWith('id')
    expect(mock.maybeSingle).toHaveBeenCalledOnce()
    expect(mock.insert).not.toHaveBeenCalled()
    expect(mock.remove).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  test('renommage invalide : même contrainte de nom que la création', async () => {
    const mock = mockCollectionsClient()
    mock.maybeSingle.mockResolvedValue({ data: null, error: nameCheck })
    await expect(mock.service.rename(id, ' AB ')).rejects.toHaveProperty('code', 'invalid_name')
    expect(mock.update).toHaveBeenCalledExactlyOnceWith({ name: ' AB ' })
  })
  test('supprime uniquement le parent ciblé, sans appel sur ses dépendances', async () => {
    const mock = mockCollectionsClient()
    await expect(mock.service.delete(id)).resolves.toEqual({ collectionId: id })
    expect(mock.from).toHaveBeenCalledExactlyOnceWith('collections')
    expect(mock.remove).toHaveBeenCalledExactlyOnceWith()
    expect(mock.eq).toHaveBeenCalledExactlyOnceWith('id', id)
    expect(mock.select).toHaveBeenCalledExactlyOnceWith('id')
    expect(mock.maybeSingle).toHaveBeenCalledOnce()
    expect(mock.insert).not.toHaveBeenCalled()
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  test.each(['rename', 'delete'] as const)('%s : zéro ligne signifie absente ou non modifiable, sans tentative de désambiguïsation', async operation => {
    const mock = mockCollectionsClient()
    mock.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(operation === 'rename' ? mock.service.rename(id, 'Valid') : mock.service.delete(id))
      .rejects.toHaveProperty('code', 'collection_unavailable')
    expect(mock.from).toHaveBeenCalledExactlyOnceWith('collections')
    expect(mock.eq).toHaveBeenCalledExactlyOnceWith('id', id)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  test.each(['rename', 'delete'] as const)('%s : refus SQL explicite', async operation => {
    const mock = mockCollectionsClient()
    mock.maybeSingle.mockResolvedValue({ data: null, error: { code: '42501', message: 'private refusal' } })
    await expect(operation === 'rename' ? mock.service.rename(id, 'Valid') : mock.service.delete(id))
      .rejects.toMatchObject({ code: 'not_authorized', message: 'not_authorized' })
  })
  test.each(['rename', 'delete'] as const)('%s : une erreur de cardinalité reste inattendue', async operation => {
    const mock = mockCollectionsClient()
    mock.maybeSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Unexpected row count' } })
    await expect(operation === 'rename' ? mock.service.rename(id, 'Valid') : mock.service.delete(id))
      .rejects.toHaveProperty('code', 'unexpected')
  })
})

test.each(['free', 'automatic', 'rename', 'delete'] as const)('%s : rejet réseau assaini, sans retry ni faux succès', async operation => {
  const mock = mockCollectionsClient()
  const failure = new Error('private transport failure')
  mock.single.mockRejectedValue(failure)
  mock.maybeSingle.mockRejectedValue(failure)
  mock.rpc.mockRejectedValue(failure)
  const request = operation === 'free' ? mock.service.createFree({ name: 'Valid' })
    : operation === 'automatic' ? mock.service.createAutomatic(automatic)
      : operation === 'rename' ? mock.service.rename(id, 'Valid') : mock.service.delete(id)
  await expect(request).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  expect(mock.from.mock.calls.length + mock.rpc.mock.calls.length).toBe(1)
})

describe('lecture Dashboard', () => {
  const free = {
    collection_id: id, name: 'Libre', collection_type: 'free', access: 'owned',
    target_type: null, target_name: null, owned_count: 1, total_count: 3,
  }
  test('une seule lecture, types/cibles/accès et progression mappés sans calcul ni tri frontend', async () => {
    const mock = mockCollectionsClient()
    mock.dashboardSelect.mockResolvedValue({ error: null, data: [
      free,
      { ...free, collection_id: 'pokemon-id', name: 'Partagée', collection_type: 'automatic', access: 'shared',
        target_type: 'pokemon', target_name: 'Évoli', owned_count: 82, total_count: 120 },
      { ...free, collection_id: 'set-id', name: 'Extension', collection_type: 'automatic', target_type: 'set',
        target_name: 'Légendes Brillantes', owned_count: 3, total_count: 5 },
      { ...free, collection_id: 'empty-id', name: 'Vide', owned_count: 0, total_count: 0 },
      { ...free, collection_id: 'unnamed-id', name: 'Sans nom cible', collection_type: 'automatic', access: 'shared',
        target_type: 'pokemon', target_name: null, owned_count: 0, total_count: 0 },
    ] })
    await expect(mock.service.listDashboardCollections()).resolves.toEqual([
      { collectionId: id, name: 'Libre', collectionType: 'free', access: 'owned',
        targetType: null, targetName: null, ownedCount: 1, totalCount: 3 },
      { collectionId: 'pokemon-id', name: 'Partagée', collectionType: 'automatic', access: 'shared',
        targetType: 'pokemon', targetName: 'Évoli', ownedCount: 82, totalCount: 120 },
      { collectionId: 'set-id', name: 'Extension', collectionType: 'automatic', access: 'owned',
        targetType: 'set', targetName: 'Légendes Brillantes', ownedCount: 3, totalCount: 5 },
      { collectionId: 'empty-id', name: 'Vide', collectionType: 'free', access: 'owned',
        targetType: null, targetName: null, ownedCount: 0, totalCount: 0 },
      { collectionId: 'unnamed-id', name: 'Sans nom cible', collectionType: 'automatic', access: 'shared',
        targetType: 'pokemon', targetName: null, ownedCount: 0, totalCount: 0 },
    ])
    expect(mock.from).toHaveBeenCalledExactlyOnceWith('dashboard_collections')
    expect(mock.dashboardSelect).toHaveBeenCalledExactlyOnceWith(
      'collection_id,name,collection_type,access,target_type,target_name,owned_count,total_count',
    )
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.eq).not.toHaveBeenCalled()
    expect(mock.insert).not.toHaveBeenCalled()
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.remove).not.toHaveBeenCalled()
  })
  test('liste vide sans collection accessible', async () => {
    const mock = mockCollectionsClient()
    await expect(mock.service.listDashboardCollections()).resolves.toEqual([])
  })
  test.each([null, {}, 'invalid'])('réponse autre qu’une liste : %j', async data => {
    const mock = mockCollectionsClient()
    mock.dashboardSelect.mockResolvedValue({ data, error: null })
    await expect(mock.service.listDashboardCollections()).rejects.toHaveProperty('code', 'unexpected')
  })
  test.each([
    null, {}, { ...free, collection_id: null }, { ...free, collection_id: '' }, { ...free, name: null },
    { ...free, collection_type: 'other' }, { ...free, access: 'public' },
    { ...free, target_type: 'series' }, { ...free, target_type: 'set' },
    { ...free, target_name: 'Invented free target' },
    { ...free, collection_type: 'automatic' }, { ...free, target_name: 42 },
    { ...free, owned_count: null }, { ...free, owned_count: '1' }, { ...free, owned_count: -1 },
    { ...free, owned_count: 1.5 }, { ...free, owned_count: 4 },
    { ...free, total_count: null }, { ...free, total_count: -1 }, { ...free, total_count: Number.NaN },
    { ...free, total_count: Number.MAX_SAFE_INTEGER + 1 },
  ])('ligne incohérente refusée sans valeurs inventées : %j', async row => {
    const mock = mockCollectionsClient()
    mock.dashboardSelect.mockResolvedValue({ data: [free, row], error: null })
    await expect(mock.service.listDashboardCollections()).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  })
  test.each([['42501', 'not_authorized'], ['XX000', 'unexpected']])('erreur Supabase %s assainie', async (code, expected) => {
    const mock = mockCollectionsClient()
    mock.dashboardSelect.mockResolvedValue({ data: null, error: { code, message: 'private text', details: 'private detail' } })
    const error: unknown = await mock.service.listDashboardCollections().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(CollectionsError)
    expect(error).toMatchObject({ code: expected, message: expected })
    expect(error).not.toHaveProperty('details')
    expect(error).not.toHaveProperty('cause')
  })
  test('rejet réseau : convention unexpected conservée', async () => {
    const mock = mockCollectionsClient()
    mock.dashboardSelect.mockRejectedValue(new Error('private transport error'))
    await expect(mock.service.listDashboardCollections()).rejects.toMatchObject({ code: 'unexpected', message: 'unexpected' })
  })
})
