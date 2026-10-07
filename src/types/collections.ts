import type { Database } from './database.generated'
import type { PokemonType } from './pokemon'

type AutomaticArguments = Database['public']['Functions']['create_automatic_collection']['Args']

export interface CreateFreeCollectionInput {
  name: string
}

export interface CreateAutomaticCollectionInput {
  name: AutomaticArguments['p_name']
  targetType: 'pokemon' | 'set'
  targetId: AutomaticArguments['p_target_id'] | string
}

// Adapt only BIGINT transport; generated database types remain untouched.
export type AutomaticCollectionDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], 'create_automatic_collection'> & {
      create_automatic_collection: {
        Args: Omit<AutomaticArguments, 'p_target_id'> & { p_target_id: number | string }
        Returns: Database['public']['Functions']['create_automatic_collection']['Returns']
      }
    }
  }
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
  targetId: string | null
  targetName: string | null
  targetPrimaryType: PokemonType | null
  targetSecondaryType: PokemonType | null
  ownedCount: number
  totalCount: number
}

export interface CollectionOverview extends DashboardCollection {
  ownerId: string
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
