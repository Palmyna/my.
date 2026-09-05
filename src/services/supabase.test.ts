import { expect, test, vi } from 'vitest'

test('prépare le client à la demande, sans requête, et réutilise la même instance', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  const fetchSpy = vi.fn(() => {
    throw new Error('Aucun appel réseau attendu pendant la préparation du client.')
  })
  vi.stubGlobal('fetch', fetchSpy)

  const { getSupabaseClient } = await import('./supabase')
  expect(getSupabaseClient()).toBeNull()

  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_only')
  const client = getSupabaseClient()

  expect(client).not.toBeNull()
  expect(getSupabaseClient()).toBe(client)
  expect(fetchSpy).not.toHaveBeenCalled()
})
