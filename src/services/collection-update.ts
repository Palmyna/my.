import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { CollectionUpdatePreview, CollectionUpdateStatus, CollectionUpdateToken } from '../types/collection-update'
import { collectionBigint, collectionUuid, personalRevision } from '../lib/collection-contract'
import { getSupabaseClient } from './supabase'

export type CollectionUpdateErrorCode = 'not_authorized' | 'incompatible_collection' | 'inconsistent_state' | 'unavailable' | 'unexpected'
export class CollectionUpdateError extends Error {
  constructor(readonly code: CollectionUpdateErrorCode) { super(code); this.name = 'CollectionUpdateError' }
}
const uuid = collectionUuid.transform(value => value.toLowerCase())
const positive = personalRevision.refine(value => value !== '0')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const versions = { applied_target_version: positive, target_version: positive, target_hash: hash }
const status = z.strictObject({ collection_id: uuid, order_contract_version: z.union([z.literal(1),z.literal(2)]),
  ...versions, update_available: z.boolean(),
}).refine(row => BigInt(row.target_version) >= BigInt(row.applied_target_version)
  && (!row.update_available || BigInt(row.target_version) > BigInt(row.applied_target_version)))
const token = z.strictObject({ contract_version: z.literal(1), ...versions, personal_revision: personalRevision, plan_hash: hash,
}).refine(row => BigInt(row.target_version) >= BigInt(row.applied_target_version))
const added = z.strictObject({ variant_id: collectionBigint, automatic_rank: positive })
const existing = z.strictObject({ collection_item_id: uuid, variant_id: collectionBigint, automatic_rank: positive })
const rank = z.strictObject({ collection_item_id: uuid, variant_id: collectionBigint, previous_rank: positive, next_rank: positive,
}).refine(row => row.previous_rank !== row.next_rank)
const finalItem = z.strictObject({ collection_item_id: uuid.nullable(), variant_id: collectionBigint,
  origin: z.enum(['manual','automatic']), automatic_rank: positive.nullable(), is_hidden: z.boolean(),
}).refine(row => row.origin === 'manual'
  ? row.collection_item_id !== null && row.automatic_rank === null && !row.is_hidden
  : row.automatic_rank !== null && (row.collection_item_id !== null || !row.is_hidden))
const unique = <T>(rows: T[], key: (row: T) => string) => new Set(rows.map(key)).size === rows.length
const increasing = <T>(rows: T[], key: (row: T) => string) => rows.every((row,index) => index === 0 || BigInt(key(rows[index-1]!)) < BigInt(key(row)))
const preview = z.strictObject({ collection_id: uuid, token, update_available: z.boolean(), target_empty: z.boolean(),
  added: z.array(added), removed: z.array(existing), converted: z.array(existing), rank_changes: z.array(rank), final_order: z.array(finalItem),
}).refine(row => {
  const deltas = [...row.added,...row.removed,...row.converted,...row.rank_changes]
  const identities = [...row.removed,...row.converted,...row.rank_changes]
  const final = new Map(row.final_order.map(item => [item.variant_id,item]))
  if (!unique(deltas,item => item.variant_id) || !unique(identities,item => item.collection_item_id)
    || !unique(row.final_order,item => item.variant_id)
    || !unique(row.final_order.filter(item => item.collection_item_id !== null),item => item.collection_item_id!)
    || !increasing(row.added,item => item.automatic_rank) || !increasing(row.removed,item => item.automatic_rank)
    || !increasing(row.converted,item => item.automatic_rank) || !increasing(row.rank_changes,item => item.next_rank)) return false
  const automatic = row.final_order.filter(item => item.origin === 'automatic')
  const ranks = new Set(automatic.map(item => item.automatic_rank))
  if (ranks.size !== automatic.length || automatic.some(item => BigInt(item.automatic_rank!) > BigInt(automatic.length))
    || row.target_empty !== (automatic.length === 0)
    || row.update_available !== (deltas.length > 0)
    || (row.update_available && BigInt(row.token.target_version) <= BigInt(row.token.applied_target_version))) return false
  for (const item of row.added) {
    const projected = final.get(item.variant_id)
    if (!projected || projected.collection_item_id !== null || projected.origin !== 'automatic'
      || projected.automatic_rank !== item.automatic_rank || projected.is_hidden) return false
  }
  if (row.final_order.some(item => item.collection_item_id === null && !row.added.some(add => add.variant_id === item.variant_id))) return false
  const finalIds = new Set(row.final_order.map(item => item.collection_item_id))
  if (row.removed.some(item => final.has(item.variant_id) || finalIds.has(item.collection_item_id))) return false
  for (const item of row.converted) {
    const projected = final.get(item.variant_id)
    if (!projected || projected.collection_item_id !== item.collection_item_id || projected.origin !== 'automatic'
      || projected.automatic_rank !== item.automatic_rank || projected.is_hidden) return false
  }
  for (const item of row.rank_changes) {
    const projected = final.get(item.variant_id)
    if (!projected || projected.collection_item_id !== item.collection_item_id || projected.origin !== 'automatic'
      || projected.automatic_rank !== item.next_rank) return false
  }
  return true
})
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  try {
    const result = schema.safeParse(value)
    if (result.success) return result.data
  } catch { /* A cross-field BIGINT refinement may run after a field failed. */ }
  throw new CollectionUpdateError('unexpected')
}
const mapToken = (row: z.output<typeof token>): CollectionUpdateToken => ({ contractVersion: row.contract_version,
  appliedTargetVersion: row.applied_target_version, targetVersion: row.target_version, targetHash: row.target_hash,
  personalRevision: row.personal_revision, planHash: row.plan_hash })
export function decodeCollectionUpdateToken(value: unknown): CollectionUpdateToken { return mapToken(parse(token,value)) }
export function decodeCollectionUpdateStatus(value: unknown): CollectionUpdateStatus {
  const row = parse(status,value)
  return { collectionId: row.collection_id, orderContractVersion: row.order_contract_version, appliedTargetVersion: row.applied_target_version,
    targetVersion: row.target_version, targetHash: row.target_hash, updateAvailable: row.update_available }
}
export function decodeCollectionUpdatePreview(value: unknown): CollectionUpdatePreview {
  const row = parse(preview,value)
  const mapAdded = (item: z.output<typeof added>) => ({ variantId: item.variant_id, automaticRank: item.automatic_rank })
  const mapExisting = (item: z.output<typeof existing>) => ({ ...mapAdded(item),collectionItemId: item.collection_item_id })
  return { collectionId: row.collection_id, token: mapToken(row.token), updateAvailable: row.update_available, targetEmpty: row.target_empty,
    added: row.added.map(mapAdded), removed: row.removed.map(mapExisting), converted: row.converted.map(mapExisting),
    rankChanges: row.rank_changes.map(item => ({ collectionItemId: item.collection_item_id, variantId: item.variant_id,
      previousRank: item.previous_rank, nextRank: item.next_rank })),
    finalOrder: row.final_order.map(item => ({ collectionItemId: item.collection_item_id, variantId: item.variant_id,
      origin: item.origin, automaticRank: item.automatic_rank, isHidden: item.is_hidden })) }
}
function readError(error: unknown): CollectionUpdateError {
  if (error instanceof CollectionUpdateError) return error
  if (error instanceof TypeError) return new CollectionUpdateError('unavailable')
  const row = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {}
  if (['42501','PGRST301','PGRST302','PGRST303'].includes(String(row.code))) return new CollectionUpdateError('not_authorized')
  if (row.code === '23514' && row.message === 'collection_update_state_invalid') return new CollectionUpdateError('inconsistent_state')
  if (row.code === '23514' && ['collection_update_ineligible','order_contract_upgrade_required'].includes(String(row.message))) return new CollectionUpdateError('incompatible_collection')
  if (['40001','40P01','55P03','57014'].includes(String(row.code))) return new CollectionUpdateError('unavailable')
  return new CollectionUpdateError('unexpected')
}
export function createCollectionUpdateService(client: SupabaseClient<Database>) {
  async function read<T>(name: 'get_collection_update_status' | 'preview_collection_update', collectionId: string, decode: (value: unknown) => T): Promise<T> {
    try {
      const id = parse(uuid,collectionId)
      const { data,error } = await client.rpc(name,{ p_collection_id: id })
      if (error) throw error
      const result = decode(data)
      if ((result as { collectionId: string }).collectionId !== id) throw new CollectionUpdateError('unexpected')
      return result
    } catch (error) { throw readError(error) }
  }
  return {
    getCollectionUpdateStatus: (id: string) => read('get_collection_update_status',id,decodeCollectionUpdateStatus),
    previewCollectionUpdate: (id: string) => read('preview_collection_update',id,decodeCollectionUpdatePreview),
  }
}
export async function getCollectionUpdateStatus(id: string): Promise<CollectionUpdateStatus> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionUpdateError('not_authorized')
  return createCollectionUpdateService(client).getCollectionUpdateStatus(id)
}
export async function previewCollectionUpdate(id: string): Promise<CollectionUpdatePreview> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionUpdateError('not_authorized')
  return createCollectionUpdateService(client).previewCollectionUpdate(id)
}
