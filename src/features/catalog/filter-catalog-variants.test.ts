import { expect, test } from 'vitest'
import { catalogPokemon } from '../../test/catalog-fixtures'
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
