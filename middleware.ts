import { next } from '@vercel/functions'
import { createClient } from '@vercel/global-config'
// Use the emitted extension: Vercel packages this local TypeScript module as .js.
import { maintenanceResponse } from './vercel/maintenance-page.js'

// This deadline closes the request; it never changes the persistent maintenance state.
const READ_DEADLINE_MS = 3_000

async function readWithDeadline(read: Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('maintenance_read_timeout')), READ_DEADLINE_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export default async function middleware(request: Request): Promise<Response> {
  const environment = process.env.VERCEL_ENV
  const connection = process.env.GLOBAL_CONFIG

  // Unconnected Previews remain usable without Production config or Supabase.
  // Vite itself never invokes this platform middleware.
  if (environment === 'development' || (environment === 'preview' && !connection)) return next()

  if (environment !== 'production' && environment !== 'preview') {
    console.error('[MY. maintenance] environment_invalid')
    return maintenanceResponse(request)
  }

  try {
    // Initialize inside the guard: a missing/invalid connection must also return 503.
    const client = createClient(connection, {
      staleIfError: false,
      cache: 'no-store',
      disableDevelopmentCache: true,
    })
    const key = environment === 'production' ? 'maintenance_production' : 'maintenance_preview'
    // Explicit origin read prevents a stale false from silently opening on read failure.
    const state = await readWithDeadline(client.get(key, { consistentRead: true }))
    if (state === false) return next()
    if (state !== true) console.error('[MY. maintenance] state_invalid')
  } catch {
    // SDK errors can contain URLs/tokens. Log only this fixed diagnostic.
    console.error('[MY. maintenance] config_unavailable')
  }

  return maintenanceResponse(request)
}
