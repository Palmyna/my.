import type { CollectionView } from '../../types/view-preferences'

// Add a mode here only when its renderer is functional.
export const availableCollectionViews: readonly CollectionView[] = ['list']

export function availableCollectionView(view: CollectionView): CollectionView {
  return availableCollectionViews.includes(view) ? view : 'list'
}
