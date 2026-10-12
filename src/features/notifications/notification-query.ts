import { mutationOptions, queryOptions, type QueryClient, type QueryFilters } from '@tanstack/react-query'
import { getNotificationCenter, getNotificationContent, getNotificationUnreadCount, markNotificationRead,
  normalizeNotificationPagination, NotificationError, processAnnouncementNotification } from '../../services/notifications'
import type { AnnouncementProcessRequest, NotificationPagination, NotificationReadRequest } from '../../types/notifications'

export const notificationCenterKeys = (viewerId: string | undefined) => ['notifications', 'center', viewerId] as const
export const notificationCenterKey = (viewerId: string | undefined, input: NotificationPagination = {}) =>
  [...notificationCenterKeys(viewerId), normalizeNotificationPagination(input)] as const
export const notificationUnreadCountKey = (viewerId: string | undefined) => ['notifications', 'unread-count', viewerId] as const
export const notificationContentKey = (viewerId: string | undefined, announcementId: string) => ['notifications', 'content', viewerId, announcementId] as const

// Consumers explicitly fetch these options. No automatic observer reads,
// polling, focus, reconnect or invalidation refetch.
const consultation = { enabled: false, retry: false, refetchOnMount: false, refetchOnWindowFocus: false,
  refetchOnReconnect: false, refetchInterval: false } as const
function requireViewer(viewerId: string | undefined) { if (!viewerId) throw new NotificationError('not_authorized') }
export function notificationCenterOptions(viewerId: string | undefined, input: NotificationPagination = {}) {
  const params = normalizeNotificationPagination(input)
  return queryOptions({ ...consultation, queryKey: notificationCenterKey(viewerId, params),
    queryFn: () => { requireViewer(viewerId); return getNotificationCenter(params) } })
}
export function notificationUnreadCountOptions(viewerId: string | undefined) {
  return queryOptions({ ...consultation, queryKey: notificationUnreadCountKey(viewerId),
    queryFn: () => { requireViewer(viewerId); return getNotificationUnreadCount() } })
}
export function notificationContentOptions(viewerId: string | undefined, announcementId: string) {
  return queryOptions({ ...consultation, queryKey: notificationContentKey(viewerId, announcementId),
    queryFn: () => { requireViewer(viewerId); return getNotificationContent(announcementId) } })
}
// Used after tracking and confirmed 8F apply. Consumers explicitly reread on
// invalidation; disabled observers still never refetch by themselves.
export async function invalidateNotificationQueries(client: QueryClient, viewerId: string, announcementId?: string) {
  const filters: QueryFilters[] = [{ queryKey: notificationCenterKeys(viewerId) }, { queryKey: notificationUnreadCountKey(viewerId), exact: true },
    ...(announcementId ? [{ queryKey: notificationContentKey(viewerId, announcementId), exact: true }] : [])]
  await Promise.all(filters.map(filter => client.cancelQueries(filter)))
  await Promise.all(filters.map(filter => client.invalidateQueries({ ...filter, refetchType: 'none' })))
}
export function notificationReadMutationOptions(client: QueryClient, viewerId: string | undefined) {
  return mutationOptions({ mutationKey: ['notifications', 'read', viewerId], retry: false,
    mutationFn: (input: NotificationReadRequest) => { requireViewer(viewerId); return markNotificationRead(input) },
    onSuccess: (_result, input) => invalidateNotificationQueries(client, viewerId!,
      input.notificationKey.startsWith('announcement:') ? input.notificationKey.slice('announcement:'.length) : undefined) })
}
export function announcementProcessMutationOptions(client: QueryClient, viewerId: string | undefined) {
  return mutationOptions({ mutationKey: ['notifications', 'process', viewerId], retry: false,
    mutationFn: (input: AnnouncementProcessRequest) => { requireViewer(viewerId); return processAnnouncementNotification(input) },
    onSuccess: (_result, input) => invalidateNotificationQueries(client, viewerId!, input.announcementId) })
}
