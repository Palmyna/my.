import { expect, it } from 'vitest'
import { formatFrSource } from './format-fr-source'

it.each([
  ['ASC', 'SSP', 'ASC (SSP)'], ['EVS', 'EVS', 'EVS'], ['FR', null, 'FR'],
  [null, 'Source', 'Source'], [null, null, null], ['', '', null], ['', 'Source', 'Source'],
  ['Épreuve d’Unicode', 'Test', 'Épreuve d’Unicode (Test)'],
])('formats FR/source %s / %s', (fr, source, expected) => {
  expect(formatFrSource(fr, source)).toBe(expected)
})
