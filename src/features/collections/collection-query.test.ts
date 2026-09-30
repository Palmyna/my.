import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from './collection-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { physicalCopiesKey } from '../physical-copies/physical-copies-query'

test('content keys isolate collection and viewer without colliding with existing caches', async () => {
  const client = new QueryClient()
  const target = collectionContentKey('viewer', 'collection')
  const others = [collectionContentKey('viewer', 'other'), collectionContentKey('other', 'collection'),
    collectionOverviewKey('viewer', 'collection'), collectionItemOrderKey('viewer', 'collection'),
    dashboardCollectionsKey('viewer'), physicalCopiesKey('viewer', 'viewer', 42)]
  for (const key of [target, ...others]) client.setQueryData(key, [])
  // This exact key is sufficient for future reorder and item-membership invalidations.
  await client.invalidateQueries({ queryKey: target, exact: true })
  expect(client.getQueryState(target)?.isInvalidated).toBe(true)
  for (const key of others) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  client.clear()
})
