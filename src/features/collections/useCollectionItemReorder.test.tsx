import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CollectionItemsError, listCollectionItemOrder, moveCollectionItem } from '../../services/collection-items'
import type { ReorderAvailability } from '../../types/collection-items'
import { collectionItemOrderKey, collectionOverviewKey } from './collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { useCollectionItemReorder } from './useCollectionItemReorder'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(),
  listCollectionItemOrder: vi.fn(), moveCollectionItem: vi.fn(),
}))
const list = vi.mocked(listCollectionItemOrder), move = vi.mocked(moveCollectionItem)
const command = { itemId: 'c', destination: { placement: 'before', anchorId: 'a' } } as const
beforeEach(() => {
  auth.user.id = 'owner'; auth.isAuthorized = true
  list.mockReset().mockResolvedValue(['a', 'b', 'c'])
  move.mockReset().mockResolvedValue(undefined)
})
function setup(access: 'owned' | 'shared' = 'owned', availability: ReorderAvailability = { enabled: true }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useCollectionItemReorder({ collectionId: 'collection', access, availability }), { wrapper }) }
}

test('one write; retain confirmed order until authoritative refetch; exact cache scope', async () => {
  const { result, client } = setup()
  const untouched = [collectionOverviewKey('owner', 'collection'), dashboardCollectionsKey('owner'), collectionItemOrderKey('owner', 'other')]
  for (const key of untouched) client.setQueryData(key, { unchanged: true })
  await waitFor(() => expect(result.current.availability.enabled).toBe(true))
  let resolve!: () => void
  move.mockImplementation(() => new Promise<void>(done => { resolve = done }))
  let pending!: Promise<boolean>
  act(() => { pending = result.current.move(command) })
  await waitFor(() => expect(move).toHaveBeenCalledOnce())
  expect(result.current.itemIds).toEqual(['a', 'b', 'c'])
  expect(result.current.isSaving).toBe(true)
  await act(async () => { expect(await result.current.move(command)).toBe(false) })
  list.mockResolvedValue(['c', 'a', 'b'])
  await act(async () => { resolve(); expect(await pending).toBe(true) })
  expect(move).toHaveBeenCalledExactlyOnceWith('collection', command)
  expect(list).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(result.current.itemIds).toEqual(['c', 'a', 'b']))
  for (const key of untouched) {
    expect(client.getQueryData(key)).toEqual({ unchanged: true })
    expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  }
})
test('uncertain failure refetches server order, with safe feedback and no optimistic rollback', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.availability.enabled).toBe(true))
  move.mockRejectedValue(new CollectionItemsError('order_conflict'))
  list.mockResolvedValue(['b', 'a', 'c'])
  await act(async () => { expect(await result.current.move(command)).toBe(false) })
  await waitFor(() => expect(result.current.itemIds).toEqual(['b', 'a', 'c']))
  expect(result.current.error).toContain('Vérifiez l’ordre')
  expect(result.current.error).not.toContain('order_conflict')
})
test('failed refresh hides cached order and disables moves until explicit successful refresh', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.availability.enabled).toBe(true))
  list.mockRejectedValue(new Error('private backend'))
  await act(async () => { await result.current.move(command) })
  await waitFor(() => expect(result.current.itemIds).toEqual([]))
  expect(result.current.availability.enabled).toBe(false)
  expect(result.current.error).toContain('Impossible d’actualiser')
  list.mockResolvedValue(['c', 'a', 'b'])
  await act(async () => { await result.current.refresh() })
  await waitFor(() => expect(result.current.availability.enabled).toBe(true))
  expect(result.current.itemIds).toEqual(['c', 'a', 'b'])
})
test.each(['shared', 'filter', 'unauthorized'] as const)('%s prevents mutation', async mode => {
  if (mode === 'unauthorized') auth.isAuthorized = false
  const { result } = setup(mode === 'shared' ? 'shared' : 'owned', mode === 'filter'
    ? { enabled: false, reason: 'Effacez la recherche pour réorganiser la collection.' } : { enabled: true })
  if (mode !== 'unauthorized') await waitFor(() => expect(result.current.itemIds).toHaveLength(3))
  expect(result.current.availability.enabled).toBe(false)
  await act(async () => { expect(await result.current.move(command)).toBe(false) })
  expect(move).not.toHaveBeenCalled()
  if (mode === 'unauthorized') expect(list).not.toHaveBeenCalled()
})

test('navigation during a write invalidates its original collection only', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, rerender } = renderHook(({ collectionId }) => useCollectionItemReorder({ collectionId,
    access: 'owned', availability: { enabled: true } }), { wrapper, initialProps: { collectionId: 'first' } })
  await waitFor(() => expect(result.current.availability.enabled).toBe(true))
  let finish!: () => void
  move.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  let pending!: Promise<boolean>
  act(() => { pending = result.current.move(command) })
  await waitFor(() => expect(move).toHaveBeenCalledOnce())
  rerender({ collectionId: 'second' })
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('second'))
  await act(async () => { finish(); await pending })
  expect(move).toHaveBeenCalledExactlyOnceWith('first', command)
  expect(client.getQueryState(collectionItemOrderKey('owner', 'first'))?.isInvalidated).toBe(true)
  expect(client.getQueryState(collectionItemOrderKey('owner', 'second'))?.isInvalidated).toBe(false)
  expect(result.current.error).toBeNull()
})
