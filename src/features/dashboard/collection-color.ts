import type { DashboardCollection } from '../../types/collections'
import { resolveFunctionalIdentity, resolvePokemonIdentity } from '../../lib/catalog-identity'

/** Data is validated by Collections service; shared always overrides the target. */
export function resolveCollectionIdentity(collection: Pick<DashboardCollection,
  'access' | 'collectionType' | 'targetType' | 'targetPrimaryType' | 'targetSecondaryType'>) {
  if (collection.access === 'shared') return resolveFunctionalIdentity('shared')
  if (collection.collectionType === 'free') return resolveFunctionalIdentity('free')
  if (collection.collectionType === 'automatic') {
    if (collection.targetType === 'set') return resolveFunctionalIdentity('set')
    if (collection.targetType === 'pokemon') return resolvePokemonIdentity(collection.targetPrimaryType, collection.targetSecondaryType)
  }
  return resolvePokemonIdentity(null)
}
