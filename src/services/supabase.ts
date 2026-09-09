import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../lib/env'
import type { Database } from '../types/database.generated'

let client: SupabaseClient<Database> | undefined

export function getSupabaseClient() {
  if (client) return client

  const config = readSupabaseConfig()
  if (!config) return null

  client = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}
