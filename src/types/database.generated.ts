export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      automatic_target_states: {
        Row: {
          content_hash: string
          generation_version: number
          id: number
          pokemon_id: number | null
          set_id: number | null
          target_type: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          generation_version: number
          id?: never
          pokemon_id?: number | null
          set_id?: number | null
          target_type: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          generation_version?: number
          id?: never
          pokemon_id?: number | null
          set_id?: number | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automatic_target_states_pokemon_id_fkey"
            columns: ["pokemon_id"]
            isOneToOne: true
            referencedRelation: "pokemon"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automatic_target_states_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: true
            referencedRelation: "tcg_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      card_pokemon: {
        Row: {
          card_id: number
          pokemon_id: number
        }
        Insert: {
          card_id: number
          pokemon_id: number
        }
        Update: {
          card_id?: number
          pokemon_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_pokemon_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "source_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_pokemon_pokemon_id_fkey"
            columns: ["pokemon_id"]
            isOneToOne: false
            referencedRelation: "pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_variants: {
        Row: {
          created_at: string
          foil: string | null
          french_availability: string
          id: number
          image_url: string | null
          is_active: boolean
          label: string | null
          origin: string
          size: string | null
          sort_order: number | null
          source_card_id: number
          source_present: boolean
          source_variant_id: string | null
          stamp: string[]
          subtype: string | null
          updated_at: string
          variant_key: string
          variant_type: string | null
        }
        Insert: {
          created_at?: string
          foil?: string | null
          french_availability?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          label?: string | null
          origin: string
          size?: string | null
          sort_order?: number | null
          source_card_id: number
          source_present: boolean
          source_variant_id?: string | null
          stamp?: string[]
          subtype?: string | null
          updated_at?: string
          variant_key: string
          variant_type?: string | null
        }
        Update: {
          created_at?: string
          foil?: string | null
          french_availability?: string
          id?: never
          image_url?: string | null
          is_active?: boolean
          label?: string | null
          origin?: string
          size?: string | null
          sort_order?: number | null
          source_card_id?: number
          source_present?: boolean
          source_variant_id?: string | null
          stamp?: string[]
          subtype?: string | null
          updated_at?: string
          variant_key?: string
          variant_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_variants_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "source_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          automatic_rank: number | null
          collection_id: string
          created_at: string
          id: string
          origin: string
          sort_position: number
          updated_at: string
          variant_id: number
        }
        Insert: {
          automatic_rank?: number | null
          collection_id: string
          created_at?: string
          id?: string
          origin: string
          sort_position: number
          updated_at?: string
          variant_id: number
        }
        Update: {
          automatic_rank?: number | null
          collection_id?: string
          created_at?: string
          id?: string
          origin?: string
          sort_position?: number
          updated_at?: string
          variant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "catalog_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_shares: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          recipient_user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          recipient_user_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_shares_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_shares_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          applied_target_version: number | null
          automatic_target_type: string | null
          collection_type: string
          created_at: string
          id: string
          name: string
          owner_id: string
          target_pokemon_id: number | null
          target_set_id: number | null
          updated_at: string
        }
        Insert: {
          applied_target_version?: number | null
          automatic_target_type?: string | null
          collection_type: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          target_pokemon_id?: number | null
          target_set_id?: number | null
          updated_at?: string
        }
        Update: {
          applied_target_version?: number | null
          automatic_target_type?: string | null
          collection_type?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          target_pokemon_id?: number | null
          target_set_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_target_pokemon_id_fkey"
            columns: ["target_pokemon_id"]
            isOneToOne: false
            referencedRelation: "pokemon"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_target_set_id_fkey"
            columns: ["target_set_id"]
            isOneToOne: false
            referencedRelation: "tcg_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_copies: {
        Row: {
          condition: string | null
          created_at: string
          grading_company: string | null
          grading_score: string | null
          id: string
          is_graded: boolean
          note: string | null
          updated_at: string
          user_id: string
          variant_id: number
        }
        Insert: {
          condition?: string | null
          created_at?: string
          grading_company?: string | null
          grading_score?: string | null
          id?: string
          is_graded?: boolean
          note?: string | null
          updated_at?: string
          user_id?: string
          variant_id: number
        }
        Update: {
          condition?: string | null
          created_at?: string
          grading_company?: string | null
          grading_score?: string | null
          id?: string
          is_graded?: boolean
          note?: string | null
          updated_at?: string
          user_id?: string
          variant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "physical_copies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_copies_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "catalog_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pokemon: {
        Row: {
          created_at: string
          dex_number: number
          id: number
          is_active: boolean
          name_fr: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dex_number: number
          id?: never
          is_active?: boolean
          name_fr?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dex_number?: number
          id?: never
          is_active?: boolean
          name_fr?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          public_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          public_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          public_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_cards: {
        Row: {
          category: string | null
          created_at: string
          effective_release_date: string | null
          id: number
          image_url: string | null
          is_active: boolean
          local_id: string | null
          name_fr: string | null
          normalized_number: number | null
          origin: string
          rarity: string | null
          set_id: number
          source_present: boolean
          source_updated_at: string | null
          tcgdex_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          effective_release_date?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          local_id?: string | null
          name_fr?: string | null
          normalized_number?: number | null
          origin: string
          rarity?: string | null
          set_id: number
          source_present: boolean
          source_updated_at?: string | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          effective_release_date?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          local_id?: string | null
          name_fr?: string | null
          normalized_number?: number | null
          origin?: string
          rarity?: string | null
          set_id?: number
          source_present?: boolean
          source_updated_at?: string | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "tcg_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      tcg_series: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name_fr: string | null
          name_source: string | null
          sort_order: number | null
          tcgdex_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          name_fr?: string | null
          name_source?: string | null
          sort_order?: number | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          name_fr?: string | null
          name_source?: string | null
          sort_order?: number | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tcg_sets: {
        Row: {
          abbreviation: string | null
          abbreviation_fr: string | null
          created_at: string
          id: number
          is_active: boolean
          logo_url: string | null
          name_fr: string | null
          name_source: string | null
          official_card_count: number | null
          release_date: string | null
          series_id: number
          sort_order: number | null
          symbol_url: string | null
          tcgdex_id: string | null
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          abbreviation_fr?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          logo_url?: string | null
          name_fr?: string | null
          name_source?: string | null
          official_card_count?: number | null
          release_date?: string | null
          series_id: number
          sort_order?: number | null
          symbol_url?: string | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          abbreviation_fr?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          logo_url?: string | null
          name_fr?: string | null
          name_source?: string | null
          official_card_count?: number | null
          release_date?: string | null
          series_id?: number
          sort_order?: number | null
          symbol_url?: string | null
          tcgdex_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tcg_sets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tcg_series"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
