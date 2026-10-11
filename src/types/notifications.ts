export type NotificationAction =
  | { kind: 'collection_preview'; collectionId: string }
  | { kind: 'notification_content'; announcementId: string }

interface NotificationBase {
  notificationKey: string
  revision: string
  state: 'unread' | 'read'
  title: string
  updatedAt: string
}
export interface CollectionUpdateNotification extends NotificationBase {
  kind: 'collection_update'
  collectionId: string
  appliedTargetVersion: string
  targetVersion: string
  action: Extract<NotificationAction, { kind: 'collection_preview' }>
}
interface AnnouncementBase extends NotificationBase {
  announcementId: string
  requiresAction: boolean
  action: Extract<NotificationAction, { kind: 'notification_content' }>
}
export interface AnnouncementNotification extends AnnouncementBase {
  kind: 'announcement'
  appVersion: string | null
}
export interface ChangelogNotification extends AnnouncementBase {
  kind: 'changelog'
  appVersion: string
}
export type NotificationItem = CollectionUpdateNotification | AnnouncementNotification | ChangelogNotification
export type NotificationContent = (AnnouncementNotification | ChangelogNotification) & { body: string }
export interface NotificationCursor { updatedAt: string; notificationKey: string }
export interface NotificationPagination { limit?: number; cursor?: NotificationCursor | null }
export interface NotificationCenter { items: NotificationItem[]; unreadCount: string; nextCursor: NotificationCursor | null }
export interface NotificationUnreadCount { unreadCount: string }
export interface NotificationTransition { outcome: 'recorded' | 'obsolete' }
export interface NotificationReadRequest { notificationKey: string; observedRevision: string }
export interface AnnouncementProcessRequest { announcementId: string; observedHash: string }
