import type { CSSProperties } from 'react'
import type { DashboardCollection } from '../../types/collections'
import { resolveCollectionIdentity } from '../dashboard/collection-color'

export function collectionPresentation(collection: DashboardCollection) {
  const identity = resolveCollectionIdentity(collection)
  return {
    typeLabel: collection.collectionType === 'free' ? 'Personnalisée'
      : collection.targetType === 'pokemon' ? 'Automatique · Pokémon' : 'Automatique · Extension',
    style: {
      '--collection-accent': identity.primaryAccent,
      '--collection-secondary': identity.secondaryAccent,
      '--collection-ink': identity.textAccent,
      '--collection-on-accent': identity.onAccent,
      '--collection-surface': identity.surface,
      '--collection-border': identity.border,
      '--collection-gradient': identity.gradient,
    } as CSSProperties,
  }
}
