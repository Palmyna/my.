import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { getSupabaseClient } from './supabase'

export type PhysicalCopy = Pick<Database['public']['Tables']['physical_copies']['Row'], 'id' | 'name' | 'note' | 'created_at'>
export const PHYSICAL_COPY_NOTE_MAX_LENGTH = 750
export type PhysicalCopiesErrorCode = 'not_authorized' | 'copy_unavailable' | 'variant_unavailable' | 'note_too_long' | 'unexpected'

export class PhysicalCopiesError extends Error {
  constructor(readonly code: PhysicalCopiesErrorCode) { super(code); this.name = 'PhysicalCopiesError' }
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof PhysicalCopiesError) throw error
    if (error && typeof error === 'object' && 'code' in error) {
      if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) {
        throw new PhysicalCopiesError('not_authorized')
      }
      if (error.code === '23503' && 'message' in error && typeof error.message === 'string'
        && error.message.includes('physical_copies_variant_id_fkey')) throw new PhysicalCopiesError('variant_unavailable')
    }
    throw new PhysicalCopiesError('unexpected')
  }
}

function copyResult(data: unknown): PhysicalCopy {
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id
    || !('name' in data) || (data.name !== null && typeof data.name !== 'string')
    || !('note' in data) || (data.note !== null && typeof data.note !== 'string')
    || !('created_at' in data) || typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at))) {
    throw new PhysicalCopiesError('unexpected')
  }
  return { id: data.id, name: data.name, note: data.note, created_at: data.created_at }
}

function metadata(name: string, note: string) {
  // PostgreSQL char_length counts Unicode code points, not UTF-16 code units.
  if (Array.from(note).length > PHYSICAL_COPY_NOTE_MAX_LENGTH) throw new PhysicalCopiesError('note_too_long')
  return { name: name.trim() || null, note: note.trim() ? note : null }
}

function mutationResult(data: unknown): void {
  if (data === null) throw new PhysicalCopiesError('copy_unavailable')
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id) {
    throw new PhysicalCopiesError('unexpected')
  }
}

export function createPhysicalCopiesService(client: SupabaseClient<Database>) {
  return {
    list(ownerId: string, variantId: number): Promise<PhysicalCopy[]> {
      return request(async () => {
        // Scope by owner as well as variant: a recipient may also own copies.
        const { data, error } = await client.from('physical_copies').select('id,name,note,created_at')
          .eq('user_id', ownerId).eq('variant_id', variantId).order('created_at').order('id')
        if (error) throw error
        if (!Array.isArray(data)) throw new PhysicalCopiesError('unexpected')
        return data.map(copyResult)
      })
    },
    create(variantId: number, name = '', note = ''): Promise<void> {
      return request(async () => {
        const values = metadata(name, note)
        // auth.uid() supplies the owner; never accept identity or generated labels.
        const { data, error } = await client.from('physical_copies')
          .insert({ variant_id: variantId, ...values }).select('id').single()
        if (error) throw error
        mutationResult(data)
      })
    },
    update(copyId: string, name: string, note: string): Promise<void> {
      return request(async () => {
        const values = metadata(name, note)
        const { data, error } = await client.from('physical_copies').update(values)
          .eq('id', copyId).select('id').maybeSingle()
        if (error) throw error
        mutationResult(data)
      })
    },
    delete(copyId: string): Promise<void> {
      return request(async () => {
        const { data, error } = await client.from('physical_copies').delete().eq('id', copyId).select('id').maybeSingle()
        if (error) throw error
        mutationResult(data)
      })
    },
  }
}

function service() {
  const client = getSupabaseClient()
  if (!client) throw new PhysicalCopiesError('not_authorized')
  return createPhysicalCopiesService(client)
}

export async function listPhysicalCopies(ownerId: string, variantId: number) { return service().list(ownerId, variantId) }
export async function createPhysicalCopy(variantId: number, name: string, note = '') { return service().create(variantId, name, note) }
export async function updatePhysicalCopy(copyId: string, name: string, note: string) { return service().update(copyId, name, note) }
export async function deletePhysicalCopy(copyId: string) { return service().delete(copyId) }
