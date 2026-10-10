import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { CollectionMutationResult, CollectionOperation, ItemMove, ManualCollectionItemsDatabase, ManualItemPlacement } from '../types/collection-items'
import { collectionUuid, personalRevision } from '../lib/collection-contract'
import { variantIdString } from '../lib/variant-id'
import { getSupabaseClient } from './supabase'

export type CollectionItemsErrorCode = 'not_authorized' | 'item_unavailable' | 'order_conflict' | 'unexpected'
  | 'collection_action_unavailable' | 'manual_item_invalid_placement' | 'manual_variant_unavailable'
  | 'already_present' | 'collection_structure_conflict' | 'manual_item_unexpected'
  | 'manual_item_unavailable' | 'automatic_item_removal_forbidden'
  | 'collection_operation_invalid' | 'collection_item_unavailable' | 'operation_id_conflict'
  | 'order_contract_upgrade_required' | 'phase8_operation_unexpected' | 'operation_uncertain' | 'content_refresh_failed'
  | 'operation_storage_unavailable' | 'collection_item_hidden_invalid'
export class CollectionItemsError extends Error {
  constructor(readonly code: CollectionItemsErrorCode) { super(code); this.name = 'CollectionItemsError' }
}

const resultSchema = z.strictObject({
  operation_id: collectionUuid, outcome: z.enum(['changed', 'noop']),
  personal_revision: personalRevision, collection_item_id: collectionUuid.nullable(),
})
export function decodeCollectionMutationResult(value: unknown, operationId?: string): CollectionMutationResult {
  const parsed = resultSchema.safeParse(value)
  if (!parsed.success || (operationId && parsed.data.operation_id.toLowerCase() !== operationId.toLowerCase())) {
    throw new CollectionItemsError('phase8_operation_unexpected')
  }
  return { operationId: parsed.data.operation_id, outcome: parsed.data.outcome,
    personalRevision: parsed.data.personal_revision, collectionItemId: parsed.data.collection_item_id }
}

function v2Error(error: unknown): CollectionItemsError {
  if (error instanceof CollectionItemsError) return error
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code), message = 'message' in error ? error.message : undefined
    const business: Record<string, string> = {
      collection_action_unavailable: '42501', collection_operation_invalid: '22023',
      collection_item_unavailable: 'P0002', manual_variant_unavailable: 'P0002', already_present: '23505',
      automatic_item_removal_forbidden: '23514', collection_structure_conflict: '40001',
      operation_id_conflict: '23505', order_contract_upgrade_required: '23514', phase8_operation_unexpected: 'XX000',
      collection_item_hidden_invalid: '23514',
    }
    if (typeof message === 'string' && business[message] === code) return new CollectionItemsError(message as CollectionItemsErrorCode)
    if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return new CollectionItemsError('not_authorized')
    // A PostgreSQL error response proves rollback. Missing/transport/protocol
    // responses cannot prove the writer did not commit.
    if (/^[0-9A-Z]{5}$/.test(code)) return new CollectionItemsError('phase8_operation_unexpected')
  }
  return new CollectionItemsError('operation_uncertain')
}

function validateOperation(collectionId: string, operation: Extract<CollectionOperation, { orderContractVersion: 2 }>) {
  if (!collectionUuid.safeParse(collectionId).success || !collectionUuid.safeParse(operation.operationId).success
    || !personalRevision.safeParse(operation.expectedRevision).success) throw new CollectionItemsError('collection_operation_invalid')
}

export function validateCollectionOperationResult(result: CollectionMutationResult,
  operation: Extract<CollectionOperation, { orderContractVersion: 2 }>, kind: 'move' | 'add' | 'remove' | 'hide', itemId: string | null) {
  const revision = BigInt(operation.expectedRevision) + (result.outcome === 'changed' ? 1n : 0n)
  if (result.operationId.toLowerCase() !== operation.operationId.toLowerCase()
    || result.collectionItemId === null || (itemId && result.collectionItemId.toLowerCase() !== itemId.toLowerCase())
    || ((kind === 'add' || kind === 'remove') && result.outcome !== 'changed') || result.personalRevision !== revision.toString()) {
    throw new CollectionItemsError('phase8_operation_unexpected')
  }
  return result
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof CollectionItemsError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === '23514' && 'message' in error && error.message === 'order_contract_upgrade_required') {
        throw new CollectionItemsError('order_contract_upgrade_required')
      }
      if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) {
        throw new CollectionItemsError('not_authorized')
      }
      if (error.code === 'P0002' && 'message' in error && error.message === 'reorder_item_unavailable') {
        throw new CollectionItemsError('item_unavailable')
      }
      if (['40001', '40P01', '55P03', '57014'].includes(String(error.code))
        || (error.code === '22023' && 'message' in error && error.message === 'reorder_invalid_move')) {
        throw new CollectionItemsError('order_conflict')
      }
    }
    throw new CollectionItemsError('unexpected')
  }
}

async function manualRequest<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof CollectionItemsError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code)
      const message = 'message' in error ? error.message : undefined
      const businessErrors: Record<string, string> = {
        order_contract_upgrade_required: '23514',
        collection_action_unavailable: '42501', manual_item_invalid_placement: '22023',
        manual_variant_unavailable: 'P0002', already_present: '23505',
        manual_item_unavailable: 'P0002', automatic_item_removal_forbidden: '23514',
        manual_item_unexpected: 'XX000',
      }
      if (typeof message === 'string' && Object.hasOwn(businessErrors, message) && businessErrors[message] === code) {
        throw new CollectionItemsError(message as CollectionItemsErrorCode)
      }
      if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new CollectionItemsError('not_authorized')
      if (['40001', '40P01', '55P03', '57014'].includes(code)) throw new CollectionItemsError('collection_structure_conflict')
    }
    throw new CollectionItemsError('manual_item_unexpected')
  }
}

export function createCollectionItemsService(client: SupabaseClient<Database>) {
  const manualClient = client as unknown as SupabaseClient<ManualCollectionItemsDatabase>
  async function operationResult(collectionId: string, operationId: string): Promise<CollectionMutationResult | null> {
    if (!collectionUuid.safeParse(collectionId).success || !collectionUuid.safeParse(operationId).success) {
      throw new CollectionItemsError('collection_operation_invalid')
    }
    try {
      const { data, error } = await client.rpc('get_collection_operation_result', {
        p_collection_id: collectionId, p_operation_id: operationId,
      })
      if (error) throw error
      return data === null ? null : decodeCollectionMutationResult(data, operationId)
    } catch (error) { throw v2Error(error) }
  }
  async function v2Request(collectionId: string, operation: Extract<CollectionOperation, { orderContractVersion: 2 }>,
    kind: 'move' | 'add' | 'remove' | 'hide', itemId: string | null, send: () => PromiseLike<{ data: unknown; error: unknown }>) {
    validateOperation(collectionId, operation)
    function result(value: unknown) {
      const decoded = decodeCollectionMutationResult(value, operation.operationId)
      return validateCollectionOperationResult(decoded, operation, kind, itemId)
    }
    try {
      const { data, error } = await send()
      if (error) throw v2Error(error)
      // Invalid success payload is uncertain too: mutation may already be committed.
      try { return result(data) } catch { throw new CollectionItemsError('operation_uncertain') }
    } catch (error) {
      const mapped = v2Error(error)
      if (mapped.code !== 'operation_uncertain') throw mapped
      try {
        const receipt = await operationResult(collectionId, operation.operationId)
        if (receipt) return result({ operation_id: receipt.operationId, outcome: receipt.outcome,
          personal_revision: receipt.personalRevision, collection_item_id: receipt.collectionItemId })
      } catch { /* Preserve original request on unavailable/invalid receipt. */ }
      throw new CollectionItemsError('operation_uncertain')
    }
  }
  return {
    operationResult,
    async setHidden(collectionId: string, collectionItemId: string, isHidden: boolean,
      operation: Extract<CollectionOperation, { orderContractVersion: 2 }>): Promise<CollectionMutationResult> {
      if (operation?.orderContractVersion !== 2) throw new CollectionItemsError('order_contract_upgrade_required')
      if (!collectionUuid.safeParse(collectionItemId).success || typeof isHidden !== 'boolean') {
        throw new CollectionItemsError('collection_operation_invalid')
      }
      return v2Request(collectionId, operation, 'hide', collectionItemId, () => manualClient.rpc('set_collection_item_hidden', {
        p_collection_id: collectionId, p_collection_item_id: collectionItemId, p_is_hidden: isHidden,
        p_expected_revision: operation.expectedRevision, p_operation_id: operation.operationId,
      }))
    },
    async add(collectionId: string, variantId: string, placement: ManualItemPlacement = 'end', operation?: CollectionOperation): Promise<string> {
      if (operation?.orderContractVersion === 2) {
        let exactVariant: string
        try { exactVariant = variantIdString(variantId) } catch { throw new CollectionItemsError('collection_operation_invalid') }
        if (!['start', 'end'].includes(placement)) throw new CollectionItemsError('collection_operation_invalid')
        const result = await v2Request(collectionId, operation, 'add', null, () => manualClient.rpc('add_manual_collection_item_v2', {
          p_collection_id: collectionId, p_variant_id: exactVariant, p_placement: placement,
          p_expected_revision: operation.expectedRevision, p_operation_id: operation.operationId,
        }))
        return result.collectionItemId!
      }
      return manualRequest(async () => {
        const { data, error } = await manualClient.rpc('add_manual_collection_item', {
          p_collection_id: collectionId, p_variant_id: variantIdString(variantId), p_placement: placement,
        })
        if (error) throw error
        if (typeof data !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data)) {
          throw new CollectionItemsError('manual_item_unexpected')
        }
        return data
      })
    },
    async remove(collectionId: string, collectionItemId: string, operation?: CollectionOperation): Promise<void> {
      if (operation?.orderContractVersion === 2) {
        if (!collectionUuid.safeParse(collectionItemId).success) throw new CollectionItemsError('collection_operation_invalid')
        await v2Request(collectionId, operation, 'remove', collectionItemId, () => manualClient.rpc('remove_manual_collection_item_v2', {
          p_collection_id: collectionId, p_collection_item_id: collectionItemId,
          p_expected_revision: operation.expectedRevision, p_operation_id: operation.operationId,
        }))
        return
      }
      return manualRequest(async () => {
        const { data, error } = await client.rpc('remove_manual_collection_item', {
          p_collection_id: collectionId, p_collection_item_id: collectionItemId,
        })
        if (error) throw error
        if (data !== null) throw new CollectionItemsError('manual_item_unexpected')
      })
    },
    // Minimal authoritative order, independent of future variant/row content.
    // Never transport NUMERIC positions through JavaScript numbers.
    listOrder(collectionId: string): Promise<string[]> {
      return request(async () => {
        const { data, error } = await client.rpc('get_collection_item_order', { p_collection_id: collectionId })
        if (error) throw error
        if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !id)
          || new Set(data).size !== data.length) throw new CollectionItemsError('unexpected')
        return data
      })
    },
    async move(collectionId: string, { itemId, destination }: ItemMove, operation?: CollectionOperation): Promise<void> {
      if (operation?.orderContractVersion === 2) {
        const anchorId = 'anchorId' in destination ? destination.anchorId : null
        if (!collectionUuid.safeParse(itemId).success || !['start', 'end', 'before', 'after'].includes(destination.placement)
          || (['before', 'after'].includes(destination.placement) ? !collectionUuid.safeParse(anchorId).success
            || anchorId?.toLowerCase() === itemId.toLowerCase() : anchorId !== null)) {
          throw new CollectionItemsError('collection_operation_invalid')
        }
        await v2Request(collectionId, operation, 'move', itemId, () => manualClient.rpc('reorder_collection_item_v2', {
          p_collection_id: collectionId, p_item_id: itemId, p_placement: destination.placement, p_anchor_id: anchorId,
          p_expected_revision: operation.expectedRevision, p_operation_id: operation.operationId,
        }))
        return
      }
      return request(async () => {
        const { error } = await client.rpc('reorder_collection_item', {
          p_collection_id: collectionId, p_item_id: itemId, p_placement: destination.placement,
          ...('anchorId' in destination ? { p_anchor_id: destination.anchorId } : {}),
        })
        if (error) throw error
      })
    },
  }
}

function service() {
  const client = getSupabaseClient()
  if (!client) throw new CollectionItemsError('not_authorized')
  return createCollectionItemsService(client)
}
export async function listCollectionItemOrder(collectionId: string) { return service().listOrder(collectionId) }
export async function moveCollectionItem(collectionId: string, move: ItemMove, operation?: CollectionOperation) { return service().move(collectionId, move, operation) }
export async function addManualCollectionItem(collectionId: string, variantId: string, placement: ManualItemPlacement, operation?: CollectionOperation) { return service().add(collectionId, variantId, placement, operation) }
export async function removeManualCollectionItem(collectionId: string, collectionItemId: string, operation?: CollectionOperation) { return service().remove(collectionId, collectionItemId, operation) }
export async function getCollectionOperationResult(collectionId: string, operationId: string) { return service().operationResult(collectionId, operationId) }
export async function setCollectionItemHidden(collectionId: string, collectionItemId: string, isHidden: boolean,
  operation: Extract<CollectionOperation, { orderContractVersion: 2 }>) { return service().setHidden(collectionId, collectionItemId, isHidden, operation) }
