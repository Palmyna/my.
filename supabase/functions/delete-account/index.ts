import { createClient } from '@supabase/supabase-js'
import { createDeleteAccountHandler } from './handler.ts'

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(createDeleteAccountHandler({
  userClient: token => createClient(url, anonKey, {
    ...options, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  }),
  adminClient: () => createClient(url, serviceKey, options),
}))
