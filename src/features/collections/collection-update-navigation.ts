import { useOutletContext } from 'react-router'

// One in-memory intent in the authenticated shell. No token, URL state or storage.
export type CollectionUpdateIntent = { viewerId: string; collectionId: string; opener: HTMLElement | null }
export type CollectionUpdateNavigation = {
  intent: CollectionUpdateIntent | null
  consume: (intent: CollectionUpdateIntent) => void
}
export function useCollectionUpdateNavigation() {
  return useOutletContext<CollectionUpdateNavigation | undefined>()
}
