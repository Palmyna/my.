import { beforeEach, expect, test, vi } from 'vitest'
import { readSupabaseConfig } from './env'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
})

test('accepte une configuration absente ou vide pour le bootstrap', () => {
  expect(readSupabaseConfig()).toBeNull()
  vi.stubEnv('VITE_SUPABASE_URL', undefined)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined)
  expect(readSupabaseConfig()).toBeNull()
})

test('valide une URL locale et une clé publishable fictive', () => {
  vi.stubEnv('VITE_SUPABASE_URL', ' http://127.0.0.1:54321 ')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', ' sb_publishable_test_only ')

  expect(readSupabaseConfig()).toEqual({
    url: 'http://127.0.0.1:54321',
    publishableKey: 'sb_publishable_test_only',
  })
})

test.each([
  ['http://127.0.0.1:54321', ''],
  ['', 'sb_publishable_test_only'],
  ['pas-une-url', 'sb_publishable_test_only'],
  ['ftp://localhost', 'sb_publishable_test_only'],
  ['http://127.0.0.1:54321', 'cle-non-publique-fictive'],
  ['http://127.0.0.1:54321', 'sb_publishable_'],
])('refuse une configuration incomplète ou invalide (cas %#), sans exposer ses valeurs', (url, key) => {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)

  expect(readSupabaseConfig).toThrow(
    /^Configuration Supabase invalide : renseigner VITE_SUPABASE_URL \(HTTP\/HTTPS\) et VITE_SUPABASE_PUBLISHABLE_KEY \(clé publishable\) dans \.env\.local\.$/,
  )
})
