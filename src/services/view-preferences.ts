import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../types/database.generated'
import type { BinderFormat, UserPreferences, UserPreferencesPatch } from '../types/view-preferences'
import {
  binderFormatSchema, DEFAULT_USER_PREFERENCES, userPreferencesPatchSchema, userPreferencesSchema,
} from '../lib/view-preferences'
import { getSupabaseClient } from './supabase'

export type PreferencesErrorCode = 'invalid_input' | 'not_authorized' | 'collection_unavailable' | 'unexpected'
export class PreferencesError extends Error {
  constructor(readonly code: PreferencesErrorCode) { super(code); this.name = 'PreferencesError' }
}

// Match PostgreSQL UUIDs, including the repository's synthetic test identities.
const uuidSchema = z.guid().transform(value => value.toLowerCase())
const globalFields = 'user_id,catalog_default_view,collection_default_view,last_catalog_view,last_collection_view,binder_default_format' as const
const collectionFields = 'user_id,collection_id,binder_format' as const
const globalRowSchema = z.strictObject({
  user_id: uuidSchema,
  catalog_default_view: userPreferencesSchema.shape.catalogDefaultView,
  collection_default_view: userPreferencesSchema.shape.collectionDefaultView,
  last_catalog_view: userPreferencesSchema.shape.lastCatalogView,
  last_collection_view: userPreferencesSchema.shape.lastCollectionView,
  binder_default_format: binderFormatSchema,
})
const collectionRowSchema = z.strictObject({ user_id: uuidSchema, collection_id: uuidSchema, binder_format: binderFormatSchema })

function parse<T>(schema: z.ZodType<T>, value: unknown, code: PreferencesErrorCode): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new PreferencesError(code)
  return result.data
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

function applicationError(error: unknown): PreferencesError {
  if (error instanceof PreferencesError) return error
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(errorCode(error)))) {
    return new PreferencesError('not_authorized')
  }
  return new PreferencesError('unexpected')
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) { throw applicationError(error) }
}

function globalResult(data: unknown, userId: string): UserPreferences {
  const row = parse(globalRowSchema, data, 'unexpected')
  if (row.user_id !== userId) throw new PreferencesError('unexpected')
  return {
    catalogDefaultView: row.catalog_default_view, collectionDefaultView: row.collection_default_view,
    lastCatalogView: row.last_catalog_view, lastCollectionView: row.last_collection_view,
    binderDefaultFormat: row.binder_default_format,
  }
}

function collectionResult(data: unknown, userId: string, collectionId: string): BinderFormat {
  const row = parse(collectionRowSchema, data, 'unexpected')
  if (row.user_id !== userId || row.collection_id !== collectionId) throw new PreferencesError('unexpected')
  return row.binder_format
}

type WriteResult<T> = { data: T | null; error: unknown }

// PostgREST merge-upsert also writes PK columns, which our grants keep immutable.
// Update only supplied fields; insert only when absent. A concurrent first save
// retries the same targeted update once, preserving the other writer's fields.
async function saveTargeted<T>(update: () => PromiseLike<WriteResult<T>>, insert: () => PromiseLike<WriteResult<T>>): Promise<T> {
  const current = await update()
  if (current.error) throw applicationError(current.error)
  if (current.data !== null) return current.data
  const created = await insert()
  if (errorCode(created.error) === '23505') {
    const retry = await update()
    if (retry.error) throw applicationError(retry.error)
    if (retry.data !== null) return retry.data
    throw new PreferencesError('not_authorized')
  }
  if (created.error) throw applicationError(created.error)
  if (created.data === null) throw new PreferencesError('not_authorized')
  return created.data
}

export function createViewPreferencesService(client: SupabaseClient<Database>) {
  async function requireCollection(collectionId: string): Promise<void> {
    const { data, error } = await client.from('collections').select('id').eq('id', collectionId).maybeSingle()
    if (error) throw error
    if (data === null) throw new PreferencesError('collection_unavailable')
    const row = parse(z.strictObject({ id: uuidSchema }), data, 'unexpected')
    if (row.id !== collectionId) throw new PreferencesError('unexpected')
  }

  return {
    getGlobal(userId: string): Promise<UserPreferences> {
      return request(async () => {
        const viewer = parse(uuidSchema, userId, 'invalid_input')
        const { data, error } = await client.from('user_preferences').select(globalFields).eq('user_id', viewer).maybeSingle()
        if (error) throw error
        return data === null ? { ...DEFAULT_USER_PREFERENCES } : globalResult(data, viewer)
      })
    },
    saveGlobal(userId: string, input: UserPreferencesPatch): Promise<UserPreferences> {
      return request(async () => {
        const viewer = parse(uuidSchema, userId, 'invalid_input')
        const patch = parse(userPreferencesPatchSchema, input, 'invalid_input')
        const values: Database['public']['Tables']['user_preferences']['Update'] = {}
        if (patch.catalogDefaultView !== undefined) values.catalog_default_view = patch.catalogDefaultView
        if (patch.collectionDefaultView !== undefined) values.collection_default_view = patch.collectionDefaultView
        if (patch.lastCatalogView !== undefined) values.last_catalog_view = patch.lastCatalogView
        if (patch.lastCollectionView !== undefined) values.last_collection_view = patch.lastCollectionView
        if (patch.binderDefaultFormat !== undefined) values.binder_default_format = patch.binderDefaultFormat
        const data = await saveTargeted(
          () => client.from('user_preferences').update(values).eq('user_id', viewer).select(globalFields).maybeSingle(),
          () => client.from('user_preferences').insert({ ...values, user_id: viewer }).select(globalFields).single(),
        )
        return globalResult(data, viewer)
      })
    },
    getCollectionOverride(userId: string, collectionId: string): Promise<BinderFormat | null> {
      return request(async () => {
        const viewer = parse(uuidSchema, userId, 'invalid_input')
        const collection = parse(uuidSchema, collectionId, 'invalid_input')
        await requireCollection(collection)
        const { data, error } = await client.from('collection_view_preferences').select(collectionFields)
          .eq('user_id', viewer).eq('collection_id', collection).maybeSingle()
        if (error) throw error
        return data === null ? null : collectionResult(data, viewer, collection)
      })
    },
    saveCollectionOverride(userId: string, collectionId: string, format: BinderFormat): Promise<BinderFormat> {
      return request(async () => {
        const viewer = parse(uuidSchema, userId, 'invalid_input')
        const collection = parse(uuidSchema, collectionId, 'invalid_input')
        const binderFormat = parse(binderFormatSchema, format, 'invalid_input')
        await requireCollection(collection)
        const data = await saveTargeted(
          () => client.from('collection_view_preferences').update({ binder_format: binderFormat })
            .eq('user_id', viewer).eq('collection_id', collection).select(collectionFields).maybeSingle(),
          () => client.from('collection_view_preferences').insert({ user_id: viewer, collection_id: collection, binder_format: binderFormat })
            .select(collectionFields).single(),
        )
        return collectionResult(data, viewer, collection)
      })
    },
    deleteCollectionOverride(userId: string, collectionId: string): Promise<void> {
      return request(async () => {
        const viewer = parse(uuidSchema, userId, 'invalid_input')
        const collection = parse(uuidSchema, collectionId, 'invalid_input')
        await requireCollection(collection)
        const { data, error } = await client.from('collection_view_preferences').delete()
          .eq('user_id', viewer).eq('collection_id', collection).select(collectionFields).maybeSingle()
        if (error) throw error
        if (data !== null) collectionResult(data, viewer, collection)
        // Absence already means inheritance. Recheck access to distinguish revocation
        // during this request from an idempotent reset of an absent override.
        else await requireCollection(collection)
      })
    },
  }
}

function service() {
  const client = getSupabaseClient()
  if (!client) throw new PreferencesError('not_authorized')
  return createViewPreferencesService(client)
}

export async function getUserPreferences(userId: string) { return service().getGlobal(userId) }
export async function saveUserPreferences(userId: string, patch: UserPreferencesPatch) { return service().saveGlobal(userId, patch) }
export async function getCollectionViewOverride(userId: string, collectionId: string) { return service().getCollectionOverride(userId, collectionId) }
export async function saveCollectionViewOverride(userId: string, collectionId: string, format: BinderFormat) { return service().saveCollectionOverride(userId, collectionId, format) }
export async function deleteCollectionViewOverride(userId: string, collectionId: string) { return service().deleteCollectionOverride(userId, collectionId) }
