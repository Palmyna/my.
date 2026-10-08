import { resolveCollectionView } from '../../lib/view-preferences'
import { usePreferredView } from '../view-preferences/usePreferredView'
import { availableCollectionViews } from './collection-views'

export function useCollectionView(collectionId: string) {
  return usePreferredView(collectionId, {
    kind: 'collection', lastField: 'lastCollectionView',
    available: availableCollectionViews, resolve: resolveCollectionView,
  })
}
