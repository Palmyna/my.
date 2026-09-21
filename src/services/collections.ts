import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { getSupabaseClient } from './supabase'
import type {
  AutomaticCollectionResult, CollectionMutationResult, CollectionsErrorCode,
  CreateAutomaticCollectionInput, CreateFreeCollectionInput, DashboardCollection,
} from '../types/collections'

export type CollectionsService = ReturnType<typeof createCollectionsService>

// Runtime entry point; the injected service remains independently testable.
export async function listDashboardCollections(): Promise<DashboardCollection[]> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionsError('not_authorized')
  return createCollectionsService(client).listDashboardCollections()
}

export async function getCollectionOverview(collectionId: string): Promise<DashboardCollection> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionsError('not_authorized')
  return createCollectionsService(client).getCollectionOverview(collectionId)
}

export async function createFree(input: CreateFreeCollectionInput): Promise<CollectionMutationResult> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionsError('not_authorized')
  return createCollectionsService(client).createFree(input)
}

export async function renameCollection(collectionId: string, name: string): Promise<CollectionMutationResult> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionsError('not_authorized')
  return createCollectionsService(client).rename(collectionId, name)
}

export async function deleteCollection(collectionId: string): Promise<CollectionMutationResult> {
  const client = getSupabaseClient()
  if (!client) throw new CollectionsError('not_authorized')
  return createCollectionsService(client).delete(collectionId)
}

// Presentation receives only a stable code, never raw server text, details or cause.
export class CollectionsError extends Error {
  constructor(readonly code: CollectionsErrorCode) { super(code); this.name = 'CollectionsError' }
}

function collectionError(error: unknown): CollectionsError {
  if (error instanceof CollectionsError) return error
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code
    const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
    if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
      return new CollectionsError('not_authorized')
    }
    // 23514 alone also covers target/hash/item invariants: never call all CHECK failures invalid names.
    if ((code === '23514' && message.includes('"collections_name_check"'))
      || (code === '23502' && message.includes('column "name"') && message.includes('relation "collections"'))) {
      return new CollectionsError('invalid_name')
    }
    if (code === '22023' && (message === 'Invalid automatic target type' || message === 'Automatic target ID is required')) {
      return new CollectionsError('invalid_target')
    }
    if (code === 'P0002' && message === 'Automatic target does not exist') return new CollectionsError('target_not_found')
    if (code === 'P0002' && message === 'automatic_target_state_missing') return new CollectionsError('automatic_state_missing')
    if (code === '23514' && message === 'automatic_target_hash_mismatch') return new CollectionsError('automatic_state_inconsistent')
    if (code === '23514' && message === 'automatic_collection_empty') return new CollectionsError('empty_automatic_target')
  }
  return new CollectionsError('unexpected')
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) { throw collectionError(error) }
}

function collectionResult(data: unknown, missing: 'unexpected' | 'collection_unavailable'): CollectionMutationResult {
  if (data === null) throw new CollectionsError(missing)
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) {
    throw new CollectionsError('unexpected')
  }
  return { collectionId: data.id }
}

export function createCollectionsService(client: SupabaseClient<Database>) {
  return {
    getCollectionOverview(collectionId: string): Promise<DashboardCollection> {
      return request(async () => {
        // Invalid route IDs have the same public outcome as any invisible collection.
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collectionId)) {
          throw new CollectionsError('collection_unavailable')
        }
        const { data, error } = await client.from('dashboard_collections')
          .select('collection_id,name,collection_type,access,target_type,target_name,owned_count,total_count')
          .eq('collection_id', collectionId).maybeSingle()
        if (error) throw error
        if (data === null) throw new CollectionsError('collection_unavailable')
        return dashboardCollection(data)
      })
    },
    listDashboardCollections(): Promise<DashboardCollection[]> {
      return request(async () => {
        const { data, error } = await client.from('dashboard_collections')
          .select('collection_id,name,collection_type,access,target_type,target_name,owned_count,total_count')
        if (error) throw error
        if (!Array.isArray(data)) throw new CollectionsError('unexpected')
        return data.map(dashboardCollection)
      })
    },
    createFree(input: CreateFreeCollectionInput): Promise<CollectionMutationResult> {
      return request(async () => {
        // PostgreSQL owns name validation and auth.uid() supplies the owner default.
        const { data, error } = await client.from('collections')
          .insert({ name: input.name, collection_type: 'free' }).select('id').single()
        if (error) throw error
        return collectionResult(data, 'unexpected')
      })
    },
    createAutomatic(input: CreateAutomaticCollectionInput): Promise<AutomaticCollectionResult> {
      return request(async () => {
        // Do not prevalidate the name: an existing collection bypasses that validation in SQL.
        // The generated Database type infers the RPC arguments and its table return type.
        const { data, error } = await client.rpc('create_automatic_collection', {
          p_name: input.name, p_target_type: input.targetType, p_target_id: input.targetId,
        })
        if (error) throw error
        if (!Array.isArray(data) || data.length !== 1) throw new CollectionsError('unexpected')
        const row = data[0]
        if (!row || typeof row.collection_id !== 'string' || !row.collection_id || typeof row.created !== 'boolean') {
          throw new CollectionsError('unexpected')
        }
        return { collectionId: row.collection_id, created: row.created }
      })
    },
    rename(collectionId: string, name: string): Promise<CollectionMutationResult> {
      return request(async () => {
        const { data, error } = await client.from('collections')
          .update({ name }).eq('id', collectionId).select('id').maybeSingle()
        if (error) throw error
        // RLS can hide an existing collection: zero affected rows cannot establish absence.
        return collectionResult(data, 'collection_unavailable')
      })
    },
    delete(collectionId: string): Promise<CollectionMutationResult> {
      return request(async () => {
        // Only the parent. PostgreSQL owns cascades; physical copies remain account-wide.
        const { data, error } = await client.from('collections')
          .delete().eq('id', collectionId).select('id').maybeSingle()
        if (error) throw error
        return collectionResult(data, 'collection_unavailable')
      })
    },
  }
}

function dashboardCollection(row: Database['public']['Views']['dashboard_collections']['Row']): DashboardCollection {
  // Generated view columns are nullable. Fail closed on malformed or contradictory
  // responses instead of inventing target names, access modes or progress values.
  if (!row || typeof row.collection_id !== 'string' || !row.collection_id || typeof row.name !== 'string'
    || (row.collection_type !== 'free' && row.collection_type !== 'automatic')
    || (row.access !== 'owned' && row.access !== 'shared')
    || (row.target_type !== null && row.target_type !== 'pokemon' && row.target_type !== 'set')
    || (row.target_name !== null && typeof row.target_name !== 'string')
    || (row.collection_type === 'free' && (row.target_type !== null || row.target_name !== null))
    || (row.collection_type === 'automatic' && row.target_type === null)
    || typeof row.owned_count !== 'number' || !Number.isSafeInteger(row.owned_count) || row.owned_count < 0
    || typeof row.total_count !== 'number' || !Number.isSafeInteger(row.total_count) || row.total_count < row.owned_count) {
    throw new CollectionsError('unexpected')
  }
  return {
    collectionId: row.collection_id, name: row.name, collectionType: row.collection_type, access: row.access,
    targetType: row.target_type, targetName: row.target_name, ownedCount: row.owned_count, totalCount: row.total_count,
  }
}
