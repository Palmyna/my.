import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'
import type { CollectionContentItem } from '../../types/collection-content'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from '../collections/collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { invalidateCopyPossession, physicalCopiesKey } from './physical-copies-query'

const item = (variantId: string): CollectionContentItem => ({ collectionItemId: 'item', variantId, origin: 'manual',
  cardNameFr: null, localId: null, setNameFr: null, imageUrl: null, variantLabel: null, owned: false })

test('copy key normalizes safe legacy IDs and preserves lossless BIGINT and identity scope', () => {
  expect(physicalCopiesKey('viewer', 'owner', 42)).toEqual(physicalCopiesKey('viewer', 'owner', '42'))
  expect(physicalCopiesKey('viewer', 'owner', '9007199254740995')).toEqual(['physical-copies', 'viewer', 'owner', '9007199254740995'])
  expect(physicalCopiesKey('viewer', 'owner', '9007199254740995')).not.toEqual(physicalCopiesKey('viewer', 'owner', '9007199254740994'))
})

test('possession invalidation targets matching variant content and viewer summaries only', async () => {
  const client = new QueryClient()
  const affected = [collectionContentKey('owner', 'one'), collectionContentKey('owner', 'two')]
  for (const key of affected) client.setQueryData(key, [item('9007199254740995')])
  const summaries = [dashboardCollectionsKey('owner'), collectionOverviewKey('owner', 'one'), collectionOverviewKey('owner', 'three')]
  for (const key of summaries) client.setQueryData(key, { cached: true })
  const untouched = [collectionContentKey('owner', 'empty'), collectionContentKey('owner', 'other-variant'),
    collectionContentKey('other-user', 'one'), dashboardCollectionsKey('other-user'),
    collectionOverviewKey('other-user', 'one'), collectionItemOrderKey('owner', 'one'),
    physicalCopiesKey('owner', 'owner', 42)]
  for (const key of untouched) client.setQueryData(key, [item('9007199254740995')])
  client.setQueryData(collectionContentKey('owner', 'empty'), [])
  client.setQueryData(collectionContentKey('owner', 'other-variant'), [item('9007199254740994')])
  await invalidateCopyPossession(client, 'owner', '9007199254740995')
  for (const key of [...affected, ...summaries]) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  // No optimistic possession update.
  expect(client.getQueryData(affected[0]!)).toEqual([item('9007199254740995')])
  client.clear()
})
test('content with no data is invalidated conservatively', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = collectionContentKey('owner', 'unloaded')
  await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('unavailable')) }).catch(() => undefined)
  await invalidateCopyPossession(client, 'owner', '42')
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  client.clear()
})
