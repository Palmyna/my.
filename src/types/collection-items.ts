export type ItemDestination = { placement: 'start' | 'end' }
  | { placement: 'before' | 'after'; anchorId: string }
export type ItemMove = { itemId: string; destination: ItemDestination }
export type ReorderAvailability = { enabled: true } | { enabled: false; reason: string }
import type { Database } from './database.generated'
import type { PersonalRevision } from './collection-content'

export interface CollectionMutationResult {
  operationId: string
  outcome: 'changed' | 'noop'
  personalRevision: PersonalRevision
  collectionItemId: string | null
}
export type CollectionOperation = { orderContractVersion: 1 }
  | { orderContractVersion: 2; expectedRevision: PersonalRevision; operationId: string }

export type ManualItemPlacement = 'start' | 'end'
// PostgREST accepts a decimal string for BIGINT. Generated numeric input loses
// precision above MAX_SAFE_INTEGER; override only this transport boundary.
type AddFunction = Database['public']['Functions']['add_manual_collection_item']
type Functions = Database['public']['Functions']
type V2Name = 'reorder_collection_item_v2' | 'add_manual_collection_item_v2' | 'remove_manual_collection_item_v2'
type V2Functions = { [Name in V2Name]: Omit<Functions[Name], 'Args'> & {
  Args: Omit<Functions[Name]['Args'], 'p_expected_revision' | 'p_variant_id' | 'p_anchor_id'> & {
    p_expected_revision: string
  } & (Name extends 'add_manual_collection_item_v2' ? { p_variant_id: string }
    : Name extends 'reorder_collection_item_v2' ? { p_anchor_id: string | null } : object)
} }
export type ManualCollectionItemsDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], 'add_manual_collection_item' | V2Name> & V2Functions & {
      add_manual_collection_item: Omit<AddFunction, 'Args'> & {
        Args: Omit<AddFunction['Args'], 'p_variant_id'> & { p_variant_id: string }
      }
    }
  }
}
