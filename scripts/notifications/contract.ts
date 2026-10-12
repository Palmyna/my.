import { createHash } from 'node:crypto'
import { z } from 'zod'
import { notificationDate, notificationInstant, notificationSemver } from '../../src/lib/notification-scalars.ts'

export const publicationKey = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,119}$/)
// Reject executable/link syntax, invisible controls and malformed Unicode.
// eslint-disable-next-line no-control-regex
const unsafeText = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uD800-\uDFFF]|[a-z][a-z0-9+.-]*:\/\/|www\.|https?:|javascript:|data:|vbscript:|file:|mailto:|\/\//iu
const text = (max: number) => z.string().transform(value => value.replace(/\r\n?/g, '\n').normalize('NFC').trim())
  .refine(value => Array.from(value).length >= 1 && Array.from(value).length <= max && !unsafeText.test(value))
const expiration = notificationDate.transform(value => {
  const instant = notificationInstant(value)
  const fraction = ((instant % 1_000_000n) + 1_000_000n) % 1_000_000n
  const seconds = (instant - fraction) / 1_000_000n
  return `${new Date(Number(seconds * 1000n)).toISOString().slice(0, 19)}.${fraction.toString().padStart(6, '0')}Z`
}).pipe(notificationDate)

export const publicationSchema = z.strictObject({
  publication_key: publicationKey,
  category: z.enum(['announcement', 'changelog']),
  title: text(200).refine(value => !/[\n\t]/.test(value)),
  body: text(20000),
  app_version: notificationSemver.nullable(),
  action: z.strictObject({ kind: z.literal('notification_content') }).nullable(),
  requires_action: z.literal(false),
  include_new_users: z.boolean(),
  expires_at: expiration.nullable(),
  publication_context: z.strictObject({ reason: text(1000), include_new_users_justification: text(1000).nullable() }),
}).refine(p => (p.category !== 'changelog' || p.app_version !== null)
  && p.include_new_users === (p.publication_context.include_new_users_justification !== null))

export type Publication = z.output<typeof publicationSchema>

// Fixed ordered JSON array: independent of object ordering, PG JSONB spacing,
// generated UUID/date/operator. SQL revalidates and computes this independently.
export function publicationCanonical(p: Publication): string {
  return JSON.stringify(['my.notification.publication.v1', p.publication_key, p.category, p.title, p.body,
    p.app_version, p.action?.kind ?? null, p.requires_action, p.include_new_users, p.expires_at,
    p.publication_context.reason, p.publication_context.include_new_users_justification])
}
export function publicationHash(p: Publication): string {
  return createHash('sha256').update(publicationCanonical(p), 'utf8').digest('hex')
}

const identity = { publication_key: publicationKey, announcement_id: z.uuid().refine(value => value === value.toLowerCase()) }
export const publishedResult = z.strictObject({ ...identity, outcome: z.literal('published'), published_at: notificationDate,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/) })
export const withdrawnResult = z.strictObject({ ...identity, outcome: z.literal('withdrawn'), withdrawn_at: notificationDate })
