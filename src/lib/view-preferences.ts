import { z } from 'zod'
import { BINDER_FORMATS, CATALOG_VIEWS, COLLECTION_VIEWS } from '../types/view-preferences'
import type { BinderFormat, CatalogView, CollectionView, UserPreferences } from '../types/view-preferences'

export const binderFormatSchema = z.enum(BINDER_FORMATS)
export const catalogViewSchema = z.enum(CATALOG_VIEWS)
export const collectionViewSchema = z.enum(COLLECTION_VIEWS)
export const userPreferencesSchema = z.strictObject({
  catalogDefaultView: z.enum([...CATALOG_VIEWS, 'last_used']),
  collectionDefaultView: z.enum([...COLLECTION_VIEWS, 'last_used']),
  lastCatalogView: catalogViewSchema,
  lastCollectionView: collectionViewSchema,
  binderDefaultFormat: binderFormatSchema,
})
export const userPreferencesPatchSchema = userPreferencesSchema.partial().refine(
  patch => Object.keys(patch).length > 0 && Object.values(patch).every(value => value !== undefined),
)

export const DEFAULT_USER_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  catalogDefaultView: 'last_used', collectionDefaultView: 'last_used',
  lastCatalogView: 'list', lastCollectionView: 'list', binderDefaultFormat: '3x3',
})

export function resolveCatalogView(preferences: Pick<UserPreferences, 'catalogDefaultView' | 'lastCatalogView'>): CatalogView {
  return preferences.catalogDefaultView === 'last_used' ? preferences.lastCatalogView : preferences.catalogDefaultView
}

export function resolveCollectionView(preferences: Pick<UserPreferences, 'collectionDefaultView' | 'lastCollectionView'>): CollectionView {
  return preferences.collectionDefaultView === 'last_used' ? preferences.lastCollectionView : preferences.collectionDefaultView
}

export function resolveBinderFormat(override?: BinderFormat | null, globalDefault?: BinderFormat | null): BinderFormat {
  return override ?? globalDefault ?? DEFAULT_USER_PREFERENCES.binderDefaultFormat
}

export function binderSlotCount(format: BinderFormat): number {
  const [columns, rows] = format.split('x').map(Number)
  return columns! * rows!
}
