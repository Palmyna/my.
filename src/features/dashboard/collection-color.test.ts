import { expect, test } from 'vitest'
import { collectionColor, collectionColors } from './collection-color'

test('une cible conserve son accent entre collections, propriétaires et rendus', () => {
  const target = { collectionId: 'a', collectionType: 'automatic' as const, targetType: 'pokemon' as const, targetName: 'Évoli' }
  const color = collectionColor(target)
  expect(collectionColor({ ...target, collectionId: 'b', targetName: ' E\u0301VOLI ' })).toEqual(color)
  expect(collectionColor(target)).toEqual(color)
  expect(collectionColors).toContain(color)
})

test.each(['free', 'automatic'] as const)('utilise une identité stable sans cible : %s', collectionType => {
  const collection = { collectionId: 'stable-id', collectionType, targetType: null, targetName: null }
  expect(collectionColor({ ...collection })).toEqual(collectionColor(collection))
  expect(collectionColors).toContain(collectionColor(collection))
})
