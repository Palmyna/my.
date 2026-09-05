import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../lib/env'

let client: SupabaseClient | undefined

// Préparation uniquement : aucun appel de cette fonction depuis l'application Phase 0.
export function getSupabaseClient() {
  if (client) return client

  const config = readSupabaseConfig()
  if (!config) return null

  client = createClient(config.url, config.publishableKey, {
    // Les comportements de session seront définis avec l'authentification.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return client
}
