import { z } from 'zod'
import { variantIdString } from './variant-id'

// Same UUID and signed BIGINT conventions as the historical readers.
export const collectionUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
export const collectionBigint = z.string().refine(value => {
  try { return variantIdString(value) === value } catch { return false }
})
export const personalRevision = collectionBigint.refine(value => !value.startsWith('-'))
