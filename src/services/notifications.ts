import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { AnnouncementProcessRequest, NotificationCenter, NotificationContent, NotificationItem, NotificationPagination,
  NotificationReadRequest, NotificationTransition, NotificationUnreadCount } from '../types/notifications'
import { announcementProcessSchema, notificationCenterSchema, notificationContentSchema, notificationCountSchema,
  notificationInstant, notificationItemSchema, notificationPaginationSchema, notificationReadSchema,
  notificationTransitionSchema, notificationUuid } from '../lib/notification-contract'
import { getSupabaseClient } from './supabase'

export type NotificationErrorCode = 'invalid_input' | 'not_authorized' | 'action_unresolved' | 'unavailable' | 'unexpected'
export class NotificationError extends Error {
  constructor(readonly code: NotificationErrorCode) { super(code); this.name = 'NotificationError' }
}
function parse<S extends z.ZodType>(schema: S, value: unknown, code: NotificationErrorCode = 'unexpected'): z.output<S> {
  try { const result = schema.safeParse(value); if (result.success) return result.data } catch { /* Invalid cross-field input. */ }
  throw new NotificationError(code)
}
function mapItem(row: z.output<typeof notificationItemSchema>): NotificationItem {
  const common = { notificationKey: row.notification_key, revision: row.revision, state: row.state, title: row.title, updatedAt: row.updated_at }
  if (row.kind === 'collection_update') return { ...common, kind: row.kind, collectionId: row.collection_id,
    appliedTargetVersion: row.applied_target_version, targetVersion: row.target_version,
    action: { kind: row.action.kind, collectionId: row.action.collection_id } }
  const details = { ...common, announcementId: row.announcement_id, requiresAction: row.requires_action,
    action: { kind: row.action.kind, announcementId: row.action.announcement_id } }
  return row.kind === 'changelog'
    ? { ...details, kind: row.kind, appVersion: row.app_version }
    : { ...details, kind: row.kind, appVersion: row.app_version }
}
export function decodeNotificationCenter(value: unknown): NotificationCenter {
  const row = parse(notificationCenterSchema, value)
  return { items: row.items.map(mapItem), unreadCount: row.unread_count,
    nextCursor: row.next_cursor && { updatedAt: row.next_cursor.updated_at, notificationKey: row.next_cursor.notification_key } }
}
export function decodeNotificationUnreadCount(value: unknown): NotificationUnreadCount {
  return { unreadCount: parse(notificationCountSchema, value).unread_count }
}
export function decodeNotificationContent(value: unknown): NotificationContent | null {
  if (value === null) return null
  const row = parse(notificationContentSchema, value)
  const mapped = mapItem(row)
  if (mapped.kind === 'collection_update') throw new NotificationError('unexpected')
  return { ...mapped, body: row.body }
}
export function decodeNotificationTransition(value: unknown): NotificationTransition {
  return parse(notificationTransitionSchema, value)
}
function applicationError(error: unknown): NotificationError {
  if (error instanceof NotificationError) return error
  const row = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {}
  if (row.code === '42501' && row.message === 'notification_action_unresolved') return new NotificationError('action_unresolved')
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(row.code))) return new NotificationError('not_authorized')
  if (row.code === '22023' && row.message === 'notification_input_invalid') return new NotificationError('invalid_input')
  if (error instanceof TypeError || ['40001','40P01','55P03','57014','25000'].includes(String(row.code))) return new NotificationError('unavailable')
  return new NotificationError('unexpected')
}
async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) { throw applicationError(error) }
}
export function normalizeNotificationPagination(input: NotificationPagination = {}) {
  return parse(notificationPaginationSchema, input, 'invalid_input')
}
export function createNotificationService(client: SupabaseClient<Database>) {
  return {
    getNotificationCenter(input: NotificationPagination = {}): Promise<NotificationCenter> {
      return request(async () => {
        const params = normalizeNotificationPagination(input)
        const { data, error } = await client.rpc('get_notification_center', { p_limit: params.limit,
          p_cursor: params.cursor && { updated_at: params.cursor.updatedAt, notification_key: params.cursor.notificationKey } })
        if (error) throw error
        const result = decodeNotificationCenter(data)
        if (result.items.length > params.limit || (result.nextCursor && result.items.length !== params.limit)
          || (params.cursor && result.items.some(item => notificationInstant(item.updatedAt) > notificationInstant(params.cursor!.updatedAt)
            || (notificationInstant(item.updatedAt) === notificationInstant(params.cursor!.updatedAt) && item.notificationKey <= params.cursor!.notificationKey)))) {
          throw new NotificationError('unexpected')
        }
        return result
      })
    },
    getNotificationUnreadCount(): Promise<NotificationUnreadCount> {
      return request(async () => { const { data, error } = await client.rpc('get_notification_unread_count');
        if (error) throw error; return decodeNotificationUnreadCount(data) })
    },
    getNotificationContent(announcementId: string): Promise<NotificationContent | null> {
      return request(async () => {
        const id = parse(notificationUuid, announcementId, 'invalid_input')
        const { data, error } = await client.rpc('get_notification_content', { p_announcement_id: id })
        if (error) throw error
        const result = decodeNotificationContent(data)
        if (result && result.announcementId !== id) throw new NotificationError('unexpected')
        return result
      })
    },
    markNotificationRead(input: NotificationReadRequest): Promise<NotificationTransition> {
      return request(async () => {
        const original = parse(notificationReadSchema, input, 'invalid_input')
        const { data, error } = await client.rpc('mark_notification_read', {
          p_notification_key: original.notificationKey, p_observed_revision: original.observedRevision })
        if (error) throw error
        return decodeNotificationTransition(data)
      })
    },
    processAnnouncementNotification(input: AnnouncementProcessRequest): Promise<NotificationTransition> {
      return request(async () => {
        const original = parse(announcementProcessSchema, input, 'invalid_input')
        const { data, error } = await client.rpc('process_announcement_notification', {
          p_announcement_id: original.announcementId, p_observed_hash: original.observedHash })
        if (error) throw error
        return decodeNotificationTransition(data)
      })
    },
  }
}
function service() {
  const client = getSupabaseClient()
  if (!client) throw new NotificationError('not_authorized')
  return createNotificationService(client)
}
export async function getNotificationCenter(input: NotificationPagination = {}) { return service().getNotificationCenter(input) }
export async function getNotificationUnreadCount() { return service().getNotificationUnreadCount() }
export async function getNotificationContent(announcementId: string) { return service().getNotificationContent(announcementId) }
export async function markNotificationRead(input: NotificationReadRequest) { return service().markNotificationRead(input) }
export async function processAnnouncementNotification(input: AnnouncementProcessRequest) { return service().processAnnouncementNotification(input) }
