import type { Database } from './database.generated'

type AutomaticArguments = Database['public']['Functions']['create_automatic_collection']['Args']

export interface CreateFreeCollectionInput {
  name: string
}

export interface CreateAutomaticCollectionInput {
  name: AutomaticArguments['p_name']
  targetType: 'pokemon' | 'set'
  targetId: AutomaticArguments['p_target_id']
}

export interface CollectionMutationResult {
  collectionId: Database['public']['Tables']['collections']['Row']['id']
}

export interface AutomaticCollectionResult extends CollectionMutationResult {
  created: boolean
}

export interface DashboardCollection extends CollectionMutationResult {
  name: string
  collectionType: 'free' | 'automatic'
  access: 'owned' | 'shared'
  targetType: 'pokemon' | 'set' | null
  targetName: string | null
  ownedCount: number
  totalCount: number
}

export type CollectionsErrorCode =
  | 'invalid_name'
  | 'invalid_target'
  | 'target_not_found'
  | 'automatic_state_missing'
  | 'automatic_state_inconsistent'
  | 'empty_automatic_target'
  | 'not_authorized'
  | 'collection_unavailable'
  | 'unexpected'
