import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getUserPreferences, saveUserPreferences } from '../../services/view-preferences'
import type { UserPreferences } from '../../types/view-preferences'
import { userPreferencesKey } from '../view-preferences/view-preferences-query'
import { availableCollectionViews } from './collection-views'
import { useCollectionView } from './useCollectionView'

const auth = vi.hoisted<{ user: { id: string } | null; isAuthorized: boolean }>(() => ({ user: { id: 'viewer' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), saveUserPreferences: vi.fn() }))
const read = vi.mocked(getUserPreferences), save = vi.mocked(saveUserPreferences)
beforeEach(() => {
  auth.user = { id: 'viewer' }; auth.isAuthorized = true
  read.mockReset().mockResolvedValue({ ...DEFAULT_USER_PREFERENCES })
  save.mockReset().mockImplementation((_id, patch) => Promise.resolve({ ...DEFAULT_USER_PREFERENCES, ...patch }))
})
afterEach(() => { vi.restoreAllMocks() })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(collectionId = 'collection') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(({ id }) => useCollectionView(id), { wrapper, initialProps: { id: collectionId } }) }
}

test.each([
  ['absent row defaults from 7A.3', DEFAULT_USER_PREFERENCES],
  ['fixed list overrides last choice', { ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'list', lastCollectionView: 'binder' }],
  ['last_used + list', { ...DEFAULT_USER_PREFERENCES }],
  ['fixed cards unavailable', { ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'cards' }],
  ['fixed binder unavailable', { ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'binder' }],
  ['last_used + cards unavailable', { ...DEFAULT_USER_PREFERENCES, lastCollectionView: 'cards' }],
  ['last_used + binder unavailable', { ...DEFAULT_USER_PREFERENCES, lastCollectionView: 'binder' }],
] as const)('%s initializes List without rewriting preferences', async (_label, preferences) => {
  read.mockResolvedValue({ ...preferences })
  const { result, client } = setup()
  expect(result.current.currentView).toBe('list')
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  expect(result.current.currentView).toBe('list')
  expect(read).toHaveBeenCalledExactlyOnceWith('viewer')
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual(preferences)
  expect(save).not.toHaveBeenCalled()
})

test('slow read and read error retain List; exact invalidation recovers', async () => {
  const pending = deferred<UserPreferences>()
  read.mockReturnValueOnce(pending.promise).mockResolvedValue(DEFAULT_USER_PREFERENCES)
  const { result, client } = setup()
  expect(result.current.isPreferencesLoading).toBe(true)
  expect(result.current.currentView).toBe('list')
  act(() => { pending.reject(new Error('private error')) })
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  expect(result.current.currentView).toBe('list')
  await act(async () => { await client.invalidateQueries({ queryKey: userPreferencesKey('viewer'), exact: true }) })
  expect(read).toHaveBeenCalledTimes(2)
  expect(save).not.toHaveBeenCalled()
})

test('new viewer, logout and authorization loss isolate state and pending reads', async () => {
  // Simulate the registry gaining a functional renderer, without shipping one.
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const old = deferred<UserPreferences>()
  read.mockReturnValueOnce(old.promise).mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'binder' })
  const { result, rerender } = setup()
  auth.user = { id: 'recipient' }; rerender({ id: 'collection' })
  expect(result.current.currentView).toBe('list')
  await waitFor(() => expect(result.current.currentView).toBe('binder'))
  await act(async () => { old.resolve({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'cards' }); await old.promise })
  expect(result.current.currentView).toBe('binder')
  expect(read.mock.calls.map(call => call[0])).toEqual(['viewer', 'recipient'])
  auth.isAuthorized = false; rerender({ id: 'collection' })
  expect(result.current.currentView).toBe('list')
  expect(result.current.isPreferencesLoading).toBe(false)
  await act(async () => { expect(await result.current.setCurrentView('list')).toBe(false) })
  auth.user = null; rerender({ id: 'collection' })
  expect(read).toHaveBeenCalledTimes(2)
  expect(save).not.toHaveBeenCalled()
})

test('unavailable explicit choices do not save, including current fallback', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  await act(async () => {
    expect(await result.current.setCurrentView('cards')).toBe(false)
    expect(await result.current.setCurrentView('binder')).toBe(false)
  })
  expect(result.current.currentView).toBe('list')
  expect(save).not.toHaveBeenCalled()
})

test('explicit List persists only lastCollectionView and preserves fixed default', async () => {
  const preferences = { ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'binder' as const, lastCollectionView: 'cards' as const }
  read.mockResolvedValue(preferences)
  save.mockResolvedValue({ ...preferences, lastCollectionView: 'list' })
  const { result, client } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  await act(async () => { expect(await result.current.setCurrentView('list')).toBe(true) })
  expect(save).toHaveBeenCalledExactlyOnceWith('viewer', { lastCollectionView: 'list' })
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual({ ...preferences, lastCollectionView: 'list' })
})

test('future available choice is immediate, fixed default unchanged, reopening resolves default', async () => {
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const pending = deferred<UserPreferences>()
  save.mockReturnValue(pending.promise)
  read.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'list' })
  const { result, client, rerender } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  let saved!: Promise<boolean>
  act(() => { saved = result.current.setCurrentView('cards') })
  expect(result.current.currentView).toBe('cards')
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'list' })
  await act(async () => {
    pending.resolve({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: 'list', lastCollectionView: 'cards' })
    expect(await saved).toBe(true)
  })
  expect(save).toHaveBeenCalledExactlyOnceWith('viewer', { lastCollectionView: 'cards' })
  expect(result.current.currentView).toBe('cards')
  rerender({ id: 'another' })
  expect(result.current.currentView).toBe('list')
})

test('last_used reopening uses the saved available choice', async () => {
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const { result, rerender } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  await act(async () => { await result.current.setCurrentView('cards') })
  rerender({ id: 'another' })
  expect(result.current.currentView).toBe('cards')
})

test('save failure rolls back temporary view, reconciles and returns false', async () => {
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const pending = deferred<UserPreferences>()
  save.mockReturnValue(pending.promise)
  const { result } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  let saved!: Promise<boolean>
  act(() => { saved = result.current.setCurrentView('cards') })
  expect(result.current.currentView).toBe('cards')
  await act(async () => { pending.reject(new Error('private payload')); expect(await saved).toBe(false) })
  expect(result.current.currentView).toBe('list')
  expect(read).toHaveBeenCalledTimes(2)
})

test('late mutation from a departed session cannot repopulate cache or change viewer', async () => {
  const pending = deferred<UserPreferences>()
  save.mockReturnValue(pending.promise)
  const { result, client, rerender } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  let saved!: Promise<boolean>
  act(() => { saved = result.current.setCurrentView('list') })
  auth.user = { id: 'recipient' }; rerender({ id: 'collection' })
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  client.removeQueries({ queryKey: userPreferencesKey('viewer'), exact: true })
  await act(async () => { pending.resolve(DEFAULT_USER_PREFERENCES); await saved })
  expect(client.getQueryData(userPreferencesKey('viewer'))).toBeUndefined()
  expect(result.current.currentView).toBe('list')
  expect(save).toHaveBeenCalledExactlyOnceWith('viewer', { lastCollectionView: 'list' })
})

test('serial choices preserve latest presentation and last successful view on failure', async () => {
  vi.spyOn(availableCollectionViews, 'includes').mockReturnValue(true)
  const first = deferred<UserPreferences>(), second = deferred<UserPreferences>()
  save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const { result } = setup()
  await waitFor(() => expect(result.current.isPreferencesLoading).toBe(false))
  let a!: Promise<boolean>, b!: Promise<boolean>
  act(() => { a = result.current.setCurrentView('cards'); b = result.current.setCurrentView('binder') })
  expect(result.current.currentView).toBe('binder')
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  await act(async () => { first.resolve({ ...DEFAULT_USER_PREFERENCES, lastCollectionView: 'cards' }); await a })
  expect(result.current.currentView).toBe('binder')
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  read.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, lastCollectionView: 'cards' })
  await act(async () => { second.reject(new Error('failed')); expect(await b).toBe(false) })
  expect(result.current.currentView).toBe('cards')
})
