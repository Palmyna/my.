import { z } from 'zod'

const supabaseConfigSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  publishableKey: z.string().startsWith('sb_publishable_').min(16),
})

// Aucune configuration n'est requise tant que le client n'est pas utilisé.
export function readSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url && !publishableKey) {
    return null
  }

  const result = supabaseConfigSchema.safeParse({ url, publishableKey })

  if (!result.success) {
    // Ne pas inclure les valeurs reçues dans les erreurs ou les logs.
    throw new Error(
      'Configuration Supabase invalide : renseigner VITE_SUPABASE_URL (HTTP/HTTPS) et VITE_SUPABASE_PUBLISHABLE_KEY (clé publishable) dans .env.local.',
    )
  }

  return result.data
}
