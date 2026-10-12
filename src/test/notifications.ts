export const notificationCollectionId = 'c3600000-0000-0000-0000-000000000001'
export const notificationAnnouncementId = (n = 1) => `f3600000-0000-0000-0000-${String(n).padStart(12, '0')}`
export const collectionNotificationRow = () => ({ notification_key: `collection:${notificationCollectionId}`, kind: 'collection_update' as const,
  revision: '9007199254740999', state: 'unread' as const, title: 'Collection', updated_at: '2026-10-11T10:00:00.123456+00:00',
  collection_id: notificationCollectionId, applied_target_version: '9007199254740997', target_version: '9007199254740999',
  action: { kind: 'collection_preview' as const, collection_id: notificationCollectionId } })
export const announcementNotificationRow = (kind: 'announcement' | 'changelog' = 'announcement', n = 1) => ({
  notification_key: `announcement:${notificationAnnouncementId(n)}`, kind, revision: 'a'.repeat(64), state: 'unread' as const,
  title: 'Plain announcement', updated_at: '2026-10-11T09:00:00.123456Z', announcement_id: notificationAnnouncementId(n),
  app_version: kind === 'changelog' ? '0.8.15' : null, requires_action: false,
  action: { kind: 'notification_content' as const, announcement_id: notificationAnnouncementId(n) } })
export const notificationCenterRow = () => ({ items: [collectionNotificationRow(), announcementNotificationRow(), announcementNotificationRow('changelog', 2)],
  unread_count: '9007199254740999', next_cursor: null })
