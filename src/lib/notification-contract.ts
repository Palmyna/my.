import { z } from 'zod'
import { collectionUuid, personalRevision } from './collection-contract'

export const notificationUuid = collectionUuid.refine(value => value === value.toLowerCase())
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const notificationKeySchema = z.string().regex(new RegExp(`^(collection|announcement):${uuidPattern}$`))
export const notificationHash = z.string().regex(/^[a-f0-9]{64}$/)
export const notificationVersion = personalRevision.refine(value => value !== '0')
export const notificationDate = z.iso.datetime({ offset: true })
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-9]{2})$/)
  .refine(value => !value.startsWith('0000-') && Number.isFinite(Date.parse(value)))
const semver = z.string().max(64).regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/)
const plainText = (max: number) => z.string().refine(value => /\S/.test(value)
  && Array.from(value.replace(/^ +| +$/g, '')).length <= max)
const common = { notification_key: notificationKeySchema, revision: z.string(), state: z.enum(['unread', 'read']),
  title: plainText(200), updated_at: notificationDate }
const collection = z.strictObject({ ...common, kind: z.literal('collection_update'), revision: notificationVersion,
  collection_id: notificationUuid, applied_target_version: notificationVersion, target_version: notificationVersion,
  action: z.strictObject({ kind: z.literal('collection_preview'), collection_id: notificationUuid }),
})
const announcementFields = { ...common, revision: notificationHash, announcement_id: notificationUuid,
  requires_action: z.boolean(), action: z.strictObject({ kind: z.literal('notification_content'), announcement_id: notificationUuid }) }
const announcement = z.strictObject({ ...announcementFields, kind: z.literal('announcement'), app_version: semver.nullable() })
const changelog = z.strictObject({ ...announcementFields, kind: z.literal('changelog'), app_version: semver })
const coherentAnnouncement = (row: z.output<typeof announcement> | z.output<typeof changelog>) =>
  row.notification_key === `announcement:${row.announcement_id}` && row.action.announcement_id === row.announcement_id
export const notificationItemSchema = z.discriminatedUnion('kind', [collection, announcement, changelog]).refine(row =>
  row.kind === 'collection_update'
    ? row.notification_key === `collection:${row.collection_id}` && row.action.collection_id === row.collection_id
      && row.revision === row.target_version && BigInt(row.target_version) > BigInt(row.applied_target_version)
    : coherentAnnouncement(row))
export const notificationContentSchema = z.discriminatedUnion('kind', [
  announcement.extend({ body: plainText(20000) }), changelog.extend({ body: plainText(20000) }),
]).refine(coherentAnnouncement)
export const notificationCursorSchema = z.strictObject({ updatedAt: notificationDate, notificationKey: notificationKeySchema })
const wireCursor = z.strictObject({ updated_at: notificationDate, notification_key: notificationKeySchema })

// Compare exact PostgreSQL microseconds; Date alone loses pagination precision.
export function notificationInstant(value: string): bigint {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? ''
  return BigInt(Date.parse(value.replace(/\.\d+/, ''))) * 1000n + BigInt(fraction.padEnd(6, '0'))
}
export const notificationCenterSchema = z.strictObject({ items: z.array(notificationItemSchema).max(50),
  unread_count: personalRevision, next_cursor: wireCursor.nullable(),
}).refine(row => {
  if (new Set(row.items.map(item => item.notification_key)).size !== row.items.length
    || BigInt(row.unread_count) < BigInt(row.items.filter(item => item.state === 'unread').length)) return false
  if (!row.items.every((item, index) => {
    const previous = row.items[index - 1]
    return !previous || notificationInstant(previous.updated_at) > notificationInstant(item.updated_at)
      || (notificationInstant(previous.updated_at) === notificationInstant(item.updated_at) && previous.notification_key < item.notification_key)
  })) return false
  const last = row.items.at(-1)
  return row.next_cursor === null || (!!last && row.next_cursor.notification_key === last.notification_key
    && notificationInstant(row.next_cursor.updated_at) === notificationInstant(last.updated_at))
})
export const notificationCountSchema = z.strictObject({ unread_count: personalRevision })
export const notificationTransitionSchema = z.strictObject({ outcome: z.enum(['recorded', 'obsolete']) })
export const notificationPaginationSchema = z.strictObject({ limit: z.number().int().min(1).max(50).default(20),
  cursor: notificationCursorSchema.nullable().default(null) })
export const notificationReadSchema = z.strictObject({ notificationKey: notificationKeySchema, observedRevision: z.string() })
  .refine(row => (row.notificationKey.startsWith('collection:') ? notificationVersion : notificationHash).safeParse(row.observedRevision).success)
export const announcementProcessSchema = z.strictObject({ announcementId: notificationUuid, observedHash: notificationHash })
