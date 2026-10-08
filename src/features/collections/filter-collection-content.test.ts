import { expect, test } from 'vitest'
import type { CollectionContentItem } from '../../types/collection-content'
import { filterCollectionContent } from './filter-collection-content'

const pikachu: CollectionContentItem = { sourceCardId: '25', setId: '73',
  collectionItemId: 'b', variantId: '9007199254740995', origin: 'manual', owned: false,
  cardNameFr: 'Pikachu', setNameFr: 'Légendes Brillantes', setAbbreviationFr: 'ASC', setAbbreviation: 'SL3.5',
  seriesNameFr: 'Soleil et Lune', seriesNameSource: 'Sun & Moon', localId: '28/73', variantLabel: 'Reverse', imageUrl: null,
}
const empty: CollectionContentItem = { ...pikachu, collectionItemId: 'a', variantId: '1', cardNameFr: null,
  setNameFr: null, setAbbreviationFr: null, setAbbreviation: null, seriesNameFr: null, seriesNameSource: null,
  localId: null, variantLabel: null }

test.each(['PIKACHU', 'legendes brillantes', 'Le\u0301gendes Brillantes', 'ASC', 'sl3.5', 'Soleil Lune', 'sun moon',
  '28/73', 'reverse', 'Pikachu ASC', 'Pikachu Reverse ASC', 'Soleil Lune Pikachu', '  Pikachu   Reverse\tASC  ',
  '«Pikachu», Reverse — ASC!', 'Pikachu. / ASC'])('matches local fields with query %s', query => {
  expect(filterCollectionContent([empty, pikachu], query)).toEqual([pikachu])
})

test('French ligatures, apostrophes and hyphens stay searchable', () => {
  const item = { ...pikachu, cardNameFr: 'Cœur d’Évoli', setNameFr: 'Épée-Bouclier' }
  expect(filterCollectionContent([item], 'COEUR D’EVOLI epee bouclier')).toEqual([item])
})

test.each(['Pikachu Normal', 'inexistant', '2873', 'SL35'])('every term must match, meaningful separators preserved: %s', query => {
  expect(filterCollectionContent([empty, pikachu], query)).toEqual([])
})

test('A B C D E filters to B E without mutation, sorting or copying on empty query', () => {
  const items = [empty, pikachu, { ...empty, collectionItemId: 'c' }, { ...empty, collectionItemId: 'd' },
    { ...pikachu, collectionItemId: 'e', variantId: '2', cardNameFr: 'Pikachu ex' }]
  const before = structuredClone(items)
  expect(filterCollectionContent(items, 'Pikachu').map(item => item.collectionItemId)).toEqual(['b', 'e'])
  for (const query of ['', '  ', '— ! / ...']) expect(filterCollectionContent(items, query)).toBe(items)
  expect(items).toEqual(before)
})
