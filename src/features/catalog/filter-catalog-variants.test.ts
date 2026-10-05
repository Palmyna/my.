import { expect, test } from 'vitest'
import { catalogPokemon, catalogSet } from '../../test/catalog-fixtures'
import { filterCatalogVariants } from './filter-catalog-variants'

test.each([' PIKACHU   écarlate  25 ', 'pikachu SCARLET 025', 'PIKACHU ev HOLO', 'pikachu sv 25'])('local AND across fields: %s', query => {
  expect(filterCatalogVariants(catalogPokemon.variants, query).map(row => row.variantId)).toEqual(['9007199254740995', '1'])
})
test('all fields searchable, source abbreviation, label and number included', () => {
  for (const query of ['pikachu', 'écarlate', 'scarlet', 'ev', 'sv', '025', 'holo']) {
    expect(filterCatalogVariants(catalogPokemon.variants, query).length).toBeGreaterThan(0)
  }
  expect(filterCatalogVariants(catalogPokemon.variants, 'holo reverse')).toEqual([])
  expect(filterCatalogVariants(catalogPokemon.variants, 'inexistant')).toEqual([])
})
test('empty query returns original canonical array; filtered order and inputs unchanged', () => {
  const before = structuredClone(catalogPokemon.variants)
  expect(filterCatalogVariants(catalogPokemon.variants, '  … ')).toBe(catalogPokemon.variants)
  expect(filterCatalogVariants(catalogPokemon.variants, '25').map(row => row.variantId)).toEqual(['9007199254740995', '1'])
  expect(catalogPokemon.variants).toEqual(before)
})

test.each(['DUO electrique 025 reverse', ' PIKACHU   Réverse ', 'raichu reverse'])('Extension AND across card and attached Pokémon: %s', query => {
  expect(filterCatalogVariants(catalogSet.variants, query).map(row => row.variantId)).toEqual(['9007199254740995'])
})

test('Extension search excludes its own metadata, includes all attached names, preserves canonical order', () => {
  const before = structuredClone(catalogSet.variants)
  expect(filterCatalogVariants(catalogSet.variants, '  … ')).toBe(catalogSet.variants)
  expect(filterCatalogVariants(catalogSet.variants, 'evoli holo').map(row => row.variantId)).toEqual(['2'])
  expect(filterCatalogVariants(catalogSet.variants, 'normale').map(row => row.variantId)).toEqual(['1', '3'])
  for (const query of ['Forces', 'Temporal', 'EV05', 'TEF', 'écarlate', 'pikachu holo', 'pikachu absent']) {
    expect(filterCatalogVariants(catalogSet.variants, query)).toEqual([])
  }
  expect(catalogSet.variants).toEqual(before)
})
