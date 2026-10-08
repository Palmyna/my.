import { expect, test } from 'vitest'
import {
  binderSlotCount, DEFAULT_USER_PREFERENCES, resolveBinderFormat, resolveCatalogView, resolveCollectionView,
  userPreferencesPatchSchema, userPreferencesSchema,
} from './view-preferences'
import { BINDER_FORMATS, CATALOG_VIEWS, COLLECTION_VIEWS } from '../types/view-preferences'

test('initial functional defaults resolve to List and 3x3', () => {
  expect(DEFAULT_USER_PREFERENCES).toEqual({
    catalogDefaultView: 'last_used', collectionDefaultView: 'last_used',
    lastCatalogView: 'list', lastCollectionView: 'list', binderDefaultFormat: '3x3',
  })
  expect(resolveCatalogView(DEFAULT_USER_PREFERENCES)).toBe('list')
  expect(resolveCollectionView(DEFAULT_USER_PREFERENCES)).toBe('list')
  expect(userPreferencesSchema.safeParse(DEFAULT_USER_PREFERENCES).success).toBe(true)
})

test.each(CATALOG_VIEWS)('catalog fixed view %s and independent last_used', view => {
  expect(resolveCatalogView({ catalogDefaultView: view, lastCatalogView: 'cards' })).toBe(view)
  expect(resolveCatalogView({ catalogDefaultView: 'last_used', lastCatalogView: view })).toBe(view)
})

test.each(COLLECTION_VIEWS)('collection fixed view %s and independent last_used', view => {
  expect(resolveCollectionView({ collectionDefaultView: view, lastCollectionView: 'binder' })).toBe(view)
  expect(resolveCollectionView({ collectionDefaultView: 'last_used', lastCollectionView: view })).toBe(view)
})

test.each(BINDER_FORMATS)('explicit override %s always wins over global', format => {
  for (const global of BINDER_FORMATS) expect(resolveBinderFormat(format, global)).toBe(format)
})

test.each(BINDER_FORMATS)('missing override dynamically inherits %s', format => {
  expect(resolveBinderFormat(null, format)).toBe(format)
  expect(resolveBinderFormat(undefined, format)).toBe(format)
})

test('missing values fallback to 3x3; resetting override inherits later global changes', () => {
  expect(resolveBinderFormat()).toBe('3x3')
  expect(resolveBinderFormat(null, null)).toBe('3x3')
  expect(resolveBinderFormat('2x2', '4x3')).toBe('2x2')
  expect(resolveBinderFormat(null, '4x3')).toBe('4x3')
  expect(resolveBinderFormat(null, '3x3')).toBe('3x3')
})

test.each([['2x2', 4], ['3x3', 9], ['4x3', 12]] as const)('slot count derived from %s', (format, expected) => {
  expect(binderSlotCount(format)).toBe(expected)
})

test.each([
  {}, { binderDefaultFormat: undefined }, { binderDefaultFormat: null }, { binderDefaultFormat: '2×2' },
  { binderDefaultFormat: '4x4' }, { catalogDefaultView: 'binder' }, { lastCollectionView: 'last_used' },
  { lastCatalogView: 'binder' }, { collectionDefaultView: 'unknown' }, { binderMode: 'continuous' },
  { userId: 'another' }, { binderDefaultFormat: '3x3', extra: true }, null, [], '3x3',
])('invalid or unauthorized preference patch %j rejected', input => {
  expect(userPreferencesPatchSchema.safeParse(input).success).toBe(false)
})

test.each(BINDER_FORMATS)('valid targeted format patch %s', format => {
  expect(userPreferencesPatchSchema.parse({ binderDefaultFormat: format })).toEqual({ binderDefaultFormat: format })
})
