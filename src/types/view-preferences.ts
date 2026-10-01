export const CATALOG_VIEWS = ['list', 'cards'] as const
export const COLLECTION_VIEWS = [...CATALOG_VIEWS, 'binder'] as const
export const BINDER_FORMATS = ['2x2', '3x3', '4x3'] as const

export type CatalogView = typeof CATALOG_VIEWS[number]
export type CollectionView = typeof COLLECTION_VIEWS[number]
export type BinderFormat = typeof BINDER_FORMATS[number]

export interface UserPreferences {
  catalogDefaultView: CatalogView | 'last_used'
  collectionDefaultView: CollectionView | 'last_used'
  lastCatalogView: CatalogView
  lastCollectionView: CollectionView
  binderDefaultFormat: BinderFormat
}

export type UserPreferencesPatch = Partial<UserPreferences>
