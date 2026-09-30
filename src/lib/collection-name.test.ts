import { expect, test } from 'vitest'
import { isValidCollectionName } from './collection-name'

test.each(['', '   ', '\t\n\u00a0\u3000', 'a', ' ab ', '😀😀', ' \u00a0😀\u3000 '])('refuse un nom trop court après trim : %j', name => {
  expect(isValidCollectionName(name)).toBe(false)
})

test.each(['abc', '  Mes cartes  ', '\tÉté\n', '😀😀😀', 'A B'])('accepte trois caractères Unicode utiles : %j', name => {
  expect(isValidCollectionName(name)).toBe(true)
})
