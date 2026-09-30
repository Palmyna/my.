import type { Database } from './database.generated'

type Copies = Database['public']['Tables']['physical_copies']
// PostgREST accepts decimal strings for BIGINT writes. Generated types describe
// numbers; replace only the input field, without modifying the generated schema.
export type PhysicalCopiesDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Omit<Database['public']['Tables'], 'physical_copies'> & {
      physical_copies: Omit<Copies, 'Insert' | 'Row'> & {
        Row: Omit<Copies['Row'], 'variant_id'> & { variant_id: string }
        Insert: Omit<Copies['Insert'], 'variant_id'> & { variant_id: string }
      }
    }
  }
}
