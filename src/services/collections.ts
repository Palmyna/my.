import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import type {
  AutomaticCollectionResult, CollectionMutationResult, CollectionsErrorCode,
  CreateAutomaticCollectionInput, CreateFreeCollectionInput,
} from '../types/collections'

export type CollectionsService = ReturnType<typeof createCollectionsService>

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

async function mutation<T>(operation: () => Promise<T>): Promise<T> {
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
    createFree(input: CreateFreeCollectionInput): Promise<CollectionMutationResult> {
      return mutation(async () => {
        // PostgreSQL owns name validation and auth.uid() supplies the owner default.
        const { data, error } = await client.from('collections')
          .insert({ name: input.name, collection_type: 'free' }).select('id').single()
        if (error) throw error
        return collectionResult(data, 'unexpected')
      })
    },
    createAutomatic(input: CreateAutomaticCollectionInput): Promise<AutomaticCollectionResult> {
      return mutation(async () => {
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
      return mutation(async () => {
        const { data, error } = await client.from('collections')
          .update({ name }).eq('id', collectionId).select('id').maybeSingle()
        if (error) throw error
        // RLS can hide an existing collection: zero affected rows cannot establish absence.
        return collectionResult(data, 'collection_unavailable')
      })
    },
    delete(collectionId: string): Promise<CollectionMutationResult> {
      return mutation(async () => {
        // Only the parent. PostgreSQL owns cascades; physical copies remain account-wide.
        const { data, error } = await client.from('collections')
          .delete().eq('id', collectionId).select('id').maybeSingle()
        if (error) throw error
        return collectionResult(data, 'collection_unavailable')
      })
    },
  }
}
