import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import type { Database } from '../types/database.generated'
import { announcementNotificationRow, collectionNotificationRow, notificationAnnouncementId, notificationCenterRow } from '../test/notifications'
import { createNotificationService, decodeNotificationCenter, decodeNotificationContent, decodeNotificationTransition,
  decodeNotificationUnreadCount, getNotificationCenter, getNotificationContent, getNotificationUnreadCount,
  markNotificationRead, NotificationError, processAnnouncementNotification } from './notifications'
import { getSupabaseClient } from './supabase'
vi.mock('./supabase', () => ({ getSupabaseClient: vi.fn() }))
const setup = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error }), from = vi.fn()
  const client = { rpc, from } as unknown as SupabaseClient<Database>
  return { rpc, from, client, service: createNotificationService(client) }
}
test('three discriminants, exact BIGINTs and internal actions', () => {
  const result = decodeNotificationCenter(notificationCenterRow())
  expect(result.unreadCount).toBe('9007199254740999')
  expect(result.items.map(item => item.kind)).toEqual(['collection_update','announcement','changelog'])
  expect(result.items[0]).toMatchObject({ revision: '9007199254740999', appliedTargetVersion: '9007199254740997',
    action: { kind: 'collection_preview', collectionId: collectionNotificationRow().collection_id } })
  expect(decodeNotificationUnreadCount({ unread_count: '0' })).toEqual({ unreadCount: '0' })
  expect(decodeNotificationContent(null)).toBeNull()
  expect(decodeNotificationContent({ ...announcementNotificationRow(), body: '<script>alert(1)</script> javascript:text' })?.body).toBe('<script>alert(1)</script> javascript:text')
})
for (const [name, row] of [['collection',collectionNotificationRow()],['announcement',announcementNotificationRow()],['changelog',announcementNotificationRow('changelog')]] as const) {
  test.each(Object.keys(row))(`${name} requires %s`, key => {
    const value: Record<string, unknown> = { ...row }; delete value[key]
    expect(() => decodeNotificationCenter({ items: [value], unread_count: '1', next_cursor: null })).toThrow(NotificationError)
  })
  test(`${name} rejects extra fields and nested action properties`, () => {
    for (const item of [{ ...row, extra: 1 }, { ...row, action: { ...row.action, url: 'javascript:alert(1)' } }]) {
      expect(() => decodeNotificationCenter({ items: [item], unread_count: '1', next_cursor: null })).toThrow(NotificationError)
    }
  })
}
test.each([0, null, '01', '-1', '+1', '1e3', '9223372036854775808', ' 1'])('reject noncanonical count/version %j', value => {
  expect(() => decodeNotificationUnreadCount({ unread_count: value })).toThrow(NotificationError)
  expect(() => decodeNotificationCenter({ ...notificationCenterRow(), items: [{ ...collectionNotificationRow(), target_version: value }] })).toThrow(NotificationError)
})
test.each([
  { revision: '2' }, { applied_target_version: '9007199254740999' }, { target_version: '0' },
  { state: 'processed' }, { kind: 'unknown' }, { notification_key: `announcement:${notificationAnnouncementId()}` },
  { collection_id: collectionNotificationRow().collection_id.toUpperCase() }, { collection_id: 'invalid' },
  { action: { kind: 'collection_preview', collection_id: notificationAnnouncementId() } },
  { action: { kind: 'notification_content', announcement_id: notificationAnnouncementId() } },
  { updated_at: '2026-02-30T00:00:00Z' }, { updated_at: 'infinity' }, { updated_at: '2026-10-11T10:00:00' },
  { updated_at: '2026-10-11T10:00:00.1234567Z' }, { title: '  \n\t' }, { title: 'x'.repeat(201) },
  { updated_at: '2026-10-11T10:00Z' }, { updated_at: '0000-10-11T10:00:00Z' }, { updated_at: '2026-10-11T10:00:00+16:00' },
])('reject incoherent collection %#', patch => expect(() => decodeNotificationCenter({
  items: [{ ...collectionNotificationRow(), ...patch }], unread_count: '1', next_cursor: null })).toThrow(NotificationError))
test.each([
  { revision: 'A'.repeat(64) }, { revision: 'a'.repeat(63) }, { app_version: 'invalid' },
  { notification_key: `collection:${notificationAnnouncementId()}` }, { requires_action: 'false' },
  { announcement_id: notificationAnnouncementId().toUpperCase() },
  { action: { kind: 'notification_content', announcement_id: notificationAnnouncementId(2) } },
  { action: { kind: 'url', url: '/collections/anything' } },
])('reject incoherent announcement %#', patch => expect(() => decodeNotificationContent({
  ...announcementNotificationRow(), ...patch, body: 'Text' })).toThrow(NotificationError))
test('changelog needs SemVer and content stays bounded plain text', () => {
  for (const app_version of [null, '01.0.0', '1.0.0-01', 'x'.repeat(65)]) expect(() => decodeNotificationContent({
    ...announcementNotificationRow('changelog'), app_version, body: 'Text' })).toThrow(NotificationError)
  for (const body of ['', ' \n\t', 'x'.repeat(20001), null]) expect(() => decodeNotificationContent({
    ...announcementNotificationRow(), body })).toThrow(NotificationError)
  expect(() => decodeNotificationContent({ ...announcementNotificationRow(), body: 'Text', private_context: {} })).toThrow(NotificationError)
})
test('strict envelope, uniqueness, exact date/key order, cursor, count consistency', () => {
  const a = announcementNotificationRow(), b = announcementNotificationRow('changelog', 2)
  for (const value of [
    null, {}, { ...notificationCenterRow(), extra: 1 }, { items: [a,a], unread_count: '2', next_cursor: null },
    { items: [b,a], unread_count: '2', next_cursor: null }, { items: [a], unread_count: '0', next_cursor: null },
    { items: [], unread_count: '0', next_cursor: { updated_at: a.updated_at, notification_key: a.notification_key } },
    { items: [a], unread_count: '1', next_cursor: { updated_at: a.updated_at, notification_key: b.notification_key } },
    { items: [a], unread_count: '1', next_cursor: { updated_at: a.updated_at, notification_key: a.notification_key, extra: 1 } },
    { items: [a], unread_count: '1', next_cursor: { updated_at: 'invalid', notification_key: a.notification_key } },
    { items: [a], unread_count: '1', next_cursor: [] },
    { items: [{ ...a, updated_at: '2026-10-11T09:00:00.123455Z' }, b], unread_count: '2', next_cursor: null },
  ]) expect(() => decodeNotificationCenter(value)).toThrow(NotificationError)
  expect(decodeNotificationCenter({ items: [a,b], unread_count: '2', next_cursor: { updated_at: b.updated_at, notification_key: b.notification_key } }).nextCursor)
    .toEqual({ updatedAt: b.updated_at, notificationKey: b.notification_key })
  expect(decodeNotificationCenter({ items: [{ ...a, state: 'read' }], unread_count: '0', next_cursor: null }).items[0]?.state).toBe('read')
})
test.each([null, {}, { outcome: 'applied' }, { outcome: 'recorded', extra: 1 }])('strict transition %j', value => {
  expect(() => decodeNotificationTransition(value)).toThrow(NotificationError)
})
test('all five transports, exact observed parameters, pure readers, no browser DML', async () => {
  const center = setup(notificationCenterRow()), count = setup({ unread_count: '9' }), content = setup({ ...announcementNotificationRow(), body: 'Text' })
  const read = setup({ outcome: 'recorded' }), process = setup({ outcome: 'obsolete' })
  await center.service.getNotificationCenter()
  await count.service.getNotificationUnreadCount()
  await content.service.getNotificationContent(notificationAnnouncementId())
  await read.service.markNotificationRead({ notificationKey: collectionNotificationRow().notification_key, observedRevision: '9007199254740997' })
  await process.service.processAnnouncementNotification({ announcementId: notificationAnnouncementId(), observedHash: 'a'.repeat(64) })
  expect(center.rpc).toHaveBeenCalledExactlyOnceWith('get_notification_center', { p_limit: 20, p_cursor: null })
  expect(count.rpc).toHaveBeenCalledExactlyOnceWith('get_notification_unread_count')
  expect(content.rpc).toHaveBeenCalledExactlyOnceWith('get_notification_content', { p_announcement_id: notificationAnnouncementId() })
  expect(read.rpc).toHaveBeenCalledExactlyOnceWith('mark_notification_read', { p_notification_key: collectionNotificationRow().notification_key, p_observed_revision: '9007199254740997' })
  expect(process.rpc).toHaveBeenCalledExactlyOnceWith('process_announcement_notification', { p_announcement_id: notificationAnnouncementId(), p_observed_hash: 'a'.repeat(64) })
  for (const service of [center,count,content,read,process]) expect(service.from).not.toHaveBeenCalled()
})
test('pagination transport and response binding including microseconds', async () => {
  const a = announcementNotificationRow(), cursor = { updatedAt: collectionNotificationRow().updated_at, notificationKey: collectionNotificationRow().notification_key }
  const mock = setup({ items: [a], unread_count: '2', next_cursor: null })
  await mock.service.getNotificationCenter({ limit: 1, cursor })
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('get_notification_center', { p_limit: 1, p_cursor: { updated_at: cursor.updatedAt, notification_key: cursor.notificationKey } })
  await expect(setup(notificationCenterRow()).service.getNotificationCenter({ limit: 1 })).rejects.toHaveProperty('code','unexpected')
  await expect(setup({ items: [a], unread_count: '1', next_cursor: { updated_at: a.updated_at, notification_key: a.notification_key } }).service.getNotificationCenter({ limit: 2 })).rejects.toHaveProperty('code','unexpected')
  await expect(setup({ items: [a], unread_count: '1', next_cursor: null }).service.getNotificationCenter({ cursor: { updatedAt: a.updated_at, notificationKey: a.notification_key } })).rejects.toHaveProperty('code','unexpected')
  await expect(setup({ ...a, body: 'Text' }).service.getNotificationContent(notificationAnnouncementId(2))).rejects.toHaveProperty('code','unexpected')
})
test('invalid inputs never dispatch', async () => {
  const mock = setup(null)
  for (const limit of [0,51,1.1]) await expect(mock.service.getNotificationCenter({ limit })).rejects.toHaveProperty('code','invalid_input')
  await expect(mock.service.getNotificationCenter({ cursor: { updatedAt: 'invalid', notificationKey: 'unknown' } })).rejects.toHaveProperty('code','invalid_input')
  await expect(mock.service.getNotificationContent('invalid')).rejects.toHaveProperty('code','invalid_input')
  const injectedAudience = { limit: 20, user_id: notificationAnnouncementId(), created_at: '2000-01-01T00:00:00Z' }
  await expect(mock.service.getNotificationCenter(injectedAudience)).rejects.toHaveProperty('code','invalid_input')
  await expect(mock.service.markNotificationRead({ notificationKey: collectionNotificationRow().notification_key, observedRevision: 'a'.repeat(64) })).rejects.toHaveProperty('code','invalid_input')
  await expect(mock.service.markNotificationRead({ notificationKey: announcementNotificationRow().notification_key, observedRevision: '2' })).rejects.toHaveProperty('code','invalid_input')
  await expect(mock.service.processAnnouncementNotification({ announcementId: notificationAnnouncementId(), observedHash: 'bad' })).rejects.toHaveProperty('code','invalid_input')
  expect(mock.rpc).not.toHaveBeenCalled()
})
test.each([
  [{ code: '42501', message: 'notification_unavailable' }, 'not_authorized'],
  [{ code: '42501', message: 'notification_action_unresolved' }, 'action_unresolved'],
  [{ code: '22023', message: 'notification_input_invalid' }, 'invalid_input'],
  [{ code: 'PGRST301' }, 'not_authorized'], [{ code: '40P01' }, 'unavailable'],
  [{ code: '57014' }, 'unavailable'], [{ code: '25000' }, 'unavailable'], [{ code: 'XX000', message: 'private secret' }, 'unexpected'],
])('sanitized RPC errors %j', async (error, code) => {
  await expect(setup(null,error).service.getNotificationUnreadCount()).rejects.toMatchObject({ code, message: code })
})
test('transport/malformed response never auto retry a tracking write', async () => {
  const input = { notificationKey: announcementNotificationRow().notification_key, observedRevision: 'a'.repeat(64) }
  const malformed = setup({ outcome: 'recorded', secret: 1 })
  await expect(malformed.service.markNotificationRead(input)).rejects.toHaveProperty('code','unexpected')
  expect(malformed.rpc).toHaveBeenCalledTimes(1)
  const lost = setup(null); lost.rpc.mockRejectedValue(new TypeError('lost'))
  await expect(lost.service.markNotificationRead(input)).rejects.toHaveProperty('code','unavailable')
  expect(lost.rpc).toHaveBeenCalledTimes(1)
})
test('default wrappers deny missing session/client', async () => {
  vi.mocked(getSupabaseClient).mockReturnValue(null)
  for (const operation of [() => getNotificationCenter(), () => getNotificationUnreadCount(), () => getNotificationContent(notificationAnnouncementId()),
    () => markNotificationRead({ notificationKey: announcementNotificationRow().notification_key, observedRevision: 'a'.repeat(64) }),
    () => processAnnouncementNotification({ announcementId: notificationAnnouncementId(), observedHash: 'a'.repeat(64) })]) {
    await expect(operation()).rejects.toHaveProperty('code','not_authorized')
  }
})
