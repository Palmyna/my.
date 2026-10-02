import type { CollectionView } from '../../types/view-preferences'

// Add a mode here only when its renderer is functional.
export const availableCollectionViews = ['list', 'cards', 'binder'] as const satisfies readonly CollectionView[]

export function availableCollectionView(view: CollectionView): CollectionView {
  return availableCollectionViews.some(available => available === view) ? view : 'list'
}
