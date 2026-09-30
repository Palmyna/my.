export type ItemDestination = { placement: 'start' | 'end' }
  | { placement: 'before' | 'after'; anchorId: string }
export type ItemMove = { itemId: string; destination: ItemDestination }
export type ReorderAvailability = { enabled: true } | { enabled: false; reason: string }
import type { Database } from './database.generated'

export type ManualItemPlacement = 'start' | 'end'
// PostgREST accepts a decimal string for BIGINT. Generated numeric input loses
// precision above MAX_SAFE_INTEGER; override only this transport boundary.
type AddFunction = Database['public']['Functions']['add_manual_collection_item']
export type ManualCollectionItemsDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], 'add_manual_collection_item'> & {
      add_manual_collection_item: Omit<AddFunction, 'Args'> & {
        Args: Omit<AddFunction['Args'], 'p_variant_id'> & { p_variant_id: string }
      }
    }
  }
}
