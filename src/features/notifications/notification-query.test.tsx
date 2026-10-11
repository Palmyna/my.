import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { announcementProcessMutationOptions, invalidateNotificationQueries, notificationCenterKey, notificationCenterOptions,
  notificationContentKey, notificationContentOptions, notificationReadMutationOptions, notificationUnreadCountKey, notificationUnreadCountOptions } from './notification-query'
import { getNotificationCenter, getNotificationContent, getNotificationUnreadCount, markNotificationRead, processAnnouncementNotification } from '../../services/notifications'
import { announcementNotificationRow, notificationAnnouncementId } from '../../test/notifications'
vi.mock('../../services/notifications', async importOriginal => ({ ...await importOriginal<object>(),
  getNotificationCenter: vi.fn(), getNotificationContent: vi.fn(), getNotificationUnreadCount: vi.fn(), markNotificationRead: vi.fn(), processAnnouncementNotification: vi.fn() }))
const request = { notificationKey: announcementNotificationRow().notification_key, observedRevision: 'a'.repeat(64) }
const processRequest = { announcementId: notificationAnnouncementId(), observedHash: 'a'.repeat(64) }
const keys = (viewer: string) => [notificationCenterKey(viewer), notificationCenterKey(viewer, { limit: 1, cursor: {
  updatedAt: announcementNotificationRow().updated_at, notificationKey: request.notificationKey } }), notificationUnreadCountKey(viewer),
  notificationContentKey(viewer,notificationAnnouncementId()), notificationContentKey(viewer,notificationAnnouncementId(2))]
test('keys normalize defaults, isolate viewers, pagination and content identities', () => {
  expect(notificationCenterKey('v')).toEqual(notificationCenterKey('v',{ limit: 20, cursor: null }))
  expect(notificationCenterKey('v')).not.toEqual(notificationCenterKey('other'))
  expect(notificationContentKey('v',notificationAnnouncementId())).not.toEqual(notificationContentKey('v',notificationAnnouncementId(2)))
  expect(notificationCenterKey('v',{ limit: 1 })).not.toEqual(notificationCenterKey('v'))
})
test('mount/focus/reconnect/invalidation trigger no requests; explicit read has no mutation', async () => {
  vi.mocked(getNotificationCenter).mockResolvedValue({ items: [], unreadCount: '0', nextCursor: null })
  vi.mocked(getNotificationUnreadCount).mockResolvedValue({ unreadCount: '0' })
  vi.mocked(getNotificationContent).mockResolvedValue(null)
  const client = new QueryClient()
  const hook = renderHook(() => ({ center: useQuery(notificationCenterOptions('v')), count: useQuery(notificationUnreadCountOptions('v')),
    content: useQuery(notificationContentOptions('v',notificationAnnouncementId())) }),
  { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  try {
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online'))
    await act(() => invalidateNotificationQueries(client,'v',notificationAnnouncementId()))
    expect(getNotificationCenter).not.toHaveBeenCalled(); expect(getNotificationUnreadCount).not.toHaveBeenCalled(); expect(getNotificationContent).not.toHaveBeenCalled()
    await act(() => hook.result.current.count.refetch())
    await act(() => hook.result.current.center.refetch())
    await act(() => hook.result.current.content.refetch())
    expect(getNotificationCenter).toHaveBeenCalledExactlyOnceWith({ limit: 20, cursor: null })
    expect(getNotificationUnreadCount).toHaveBeenCalledOnce(); expect(getNotificationContent).toHaveBeenCalledExactlyOnceWith(notificationAnnouncementId())
    expect(markNotificationRead).not.toHaveBeenCalled(); expect(processAnnouncementNotification).not.toHaveBeenCalled()
    for (const option of [notificationCenterOptions('v'),notificationUnreadCountOptions('v'),notificationContentOptions('v',notificationAnnouncementId())]) {
      expect(option).toMatchObject({ enabled: false, retry: false, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchInterval: false })
    }
  } finally { hook.unmount(); client.clear() }
})
test.each(['read','process'] as const)('%s mutation targets all viewer pages/count and this content; no automatic refetch', async kind => {
  vi.mocked(markNotificationRead).mockResolvedValue({ outcome: 'recorded' })
  vi.mocked(processAnnouncementNotification).mockResolvedValue({ outcome: 'obsolete' })
  const client = new QueryClient()
  for (const key of [...keys('v'),...keys('other')]) client.setQueryData(key,{})
  const hook = renderHook(() => ({ read: useMutation(notificationReadMutationOptions(client,'v')), process: useMutation(announcementProcessMutationOptions(client,'v')) }),
    { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  try {
    await act(() => kind === 'read' ? hook.result.current.read.mutateAsync(request) : hook.result.current.process.mutateAsync(processRequest))
    for (const key of keys('v').slice(0,4)) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryState(keys('v')[4]!)?.isInvalidated).toBe(false)
    for (const key of keys('other')) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
    expect(getNotificationCenter).not.toHaveBeenCalled(); expect(getNotificationUnreadCount).not.toHaveBeenCalled(); expect(getNotificationContent).not.toHaveBeenCalled()
    expect(notificationReadMutationOptions(client,'v').retry).toBe(false); expect(announcementProcessMutationOptions(client,'v').retry).toBe(false)
  } finally { hook.unmount(); client.clear() }
})
test('8F integration seam invalidates centre/count only; collection read never processes', async () => {
  const client = new QueryClient()
  for (const key of keys('v')) client.setQueryData(key,{})
  await invalidateNotificationQueries(client,'v')
  for (const key of keys('v').slice(0,3)) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  for (const key of keys('v').slice(3)) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  expect(processAnnouncementNotification).not.toHaveBeenCalled()
  client.clear()
})
test('tracking error runs once, no optimistic confirmation or retry', async () => {
  vi.mocked(markNotificationRead).mockRejectedValue(new TypeError('lost response'))
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } })
  client.setQueryData(notificationUnreadCountKey('v'), { unreadCount: '1' })
  const hook = renderHook(() => useMutation(notificationReadMutationOptions(client,'v')),
    { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  try {
    await act(async () => { await expect(hook.result.current.mutateAsync(request)).rejects.toThrow('lost response') })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(markNotificationRead).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(notificationUnreadCountKey('v'))).toEqual({ unreadCount: '1' })
  } finally { hook.unmount(); client.clear() }
})
test('anonymous explicit query/mutation refuses before service dispatch', async () => {
  const client = new QueryClient()
  await expect(client.fetchQuery(notificationUnreadCountOptions(undefined))).rejects.toHaveProperty('code','not_authorized')
  await expect(client.getMutationCache().build(client,notificationReadMutationOptions(client,undefined)).execute(request)).rejects.toHaveProperty('code','not_authorized')
  expect(getNotificationUnreadCount).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled()
  client.clear()
})
test('invalidation cancels earlier response; late resolution cannot repopulate stale page', async () => {
  const client = new QueryClient()
  let resolve!: (value: { items: []; unreadCount: string; nextCursor: null }) => void
  vi.mocked(getNotificationCenter).mockReturnValue(new Promise(done => { resolve = done }))
  const pending = client.fetchQuery(notificationCenterOptions('v')).catch(() => undefined)
  await invalidateNotificationQueries(client,'v')
  resolve({ items: [], unreadCount: '9', nextCursor: null }); await pending
  expect(client.getQueryData(notificationCenterKey('v'))).toBeUndefined()
  client.clear()
})
