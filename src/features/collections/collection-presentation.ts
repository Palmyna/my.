import type { CSSProperties } from 'react'
import type { DashboardCollection } from '../../types/collections'
import { collectionColor } from '../dashboard/collection-color'

export function collectionPresentation(collection: DashboardCollection) {
  const color = collectionColor(collection)
  return {
    typeLabel: collection.collectionType === 'free' ? 'Personnalisée'
      : collection.targetType === 'pokemon' ? 'Automatique · Pokémon' : 'Automatique · Extension',
    colorClassName: `collection-color-${color.name}`,
    style: {
      '--collection-accent': color.accent,
      '--collection-surface': color.surface,
      '--collection-border': color.border,
    } as CSSProperties,
  }
}
