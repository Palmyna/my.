import { z } from 'zod'

export const notificationDate = z.iso.datetime({ offset: true })
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-9]{2})$/)
  .refine(value => !value.startsWith('0000-') && Number.isFinite(Date.parse(value)))
export const notificationSemver = z.string().max(64).regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/)

// Preserve PostgreSQL microseconds; Date alone loses precision.
export function notificationInstant(value: string): bigint {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? ''
  return BigInt(Date.parse(value.replace(/\.\d+/, ''))) * 1000n + BigInt(fraction.padEnd(6, '0'))
}
