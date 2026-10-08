import { expect, test } from 'vitest'
import { adjacentBinderPage, adjacentOccurrence, binderOccurrencePage, binderOpening, binderPages, parseBinderPage } from './binder-pagination'

test.each([['2x2', 4], ['3x3', 9], ['4x3', 12]] as const)('%s paginates authoritative order with real empty slots', (format, slots) => {
  const items = Array.from({ length: slots + 2 }, (_, id) => ({ id }))
  const pages = binderPages(items, format)
  expect(pages).toHaveLength(2)
  expect(pages[0]).toEqual(items.slice(0, slots))
  expect(pages[1]).toEqual([...items.slice(slots), ...Array<null>(slots - 2).fill(null)])
  expect(pages[0]![0]).toBe(items[0])
  expect(binderPages([], format)).toEqual([])
  expect(binderOccurrencePage(slots, format)).toBe(2)
})

test('book openings keep first page right and last even page left', () => {
  expect([1, 2, 3, 4, 5, 6].map(page => binderOpening(page, 6, true)))
    .toEqual([[1], [2, 3], [2, 3], [4, 5], [4, 5], [6]])
  expect(binderOpening(5, 5, true)).toEqual([4, 5])
  expect(binderOpening(1, 1, true)).toEqual([1])
  expect(binderOpening(1, 0, true)).toEqual([])
  expect(binderOpening(3, 6, false)).toEqual([3])
})

test('previous/next never loop in book or single-page modes', () => {
  expect([1, 2, 4, 6].map(page => adjacentBinderPage(page, 6, true, 1))).toEqual([2, 4, 6, null])
  expect([1, 2, 4, 6].map(page => adjacentBinderPage(page, 6, true, -1))).toEqual([null, 1, 3, 5])
  expect(adjacentBinderPage(3, 6, false, -1)).toBe(2)
  expect(adjacentBinderPage(3, 6, false, 1)).toBe(4)
  expect(adjacentBinderPage(1, 0, false, 1)).toBeNull()
  expect(adjacentOccurrence(0, 3, -1)).toBeNull()
  expect(adjacentOccurrence(2, 3, 1)).toBeNull()
  expect(adjacentOccurrence(0, 3, 1)).toBe(1)
})

test.each(['', ' ', 'abc', '2a', '1.5', '-1', '0', '7', '1e1', 'Infinity'])('invalid direct page %s does not navigate', value => {
  expect(parseBinderPage(value, 6)).toBeNull()
})
test('direct page validates against actual page total', () => {
  expect(parseBinderPage(' 3 ', 6)).toBe(3)
  expect(parseBinderPage('6', 6)).toBe(6)
  expect(parseBinderPage('1', 0)).toBeNull()
})
