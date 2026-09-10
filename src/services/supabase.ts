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
      // The Auth store consumes email callbacks before resolving any MY. access.
      detectSessionInUrl: false,
    },
  })

  return client
}
