import type { AuthChangeEvent, Factor, Session, SupabaseClient, User } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Database } from '../types/database.generated'

export const totpFactor: Factor = {
  id: 'totp-id', factor_type: 'totp', status: 'verified',
  created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z',
}
export const confirmedUser: User = {
  id: 'user-id', aud: 'authenticated', email: 'user@example.test',
  email_confirmed_at: '2026-09-09T00:00:00Z', created_at: '2026-09-09T00:00:00Z',
  app_metadata: {}, user_metadata: {}, factors: [totpFactor],
}
export const session: Session = {
  access_token: 'test-access-token', refresh_token: 'test-refresh-token',
  expires_in: 3600, token_type: 'bearer', user: confirmedUser,
}
export const profile = {
  id: confirmedUser.id, public_id: 'MY-ABCDE-FGHJK-MNPQR-STUVW',
  created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z',
}

export function mockAuthClient() {
  const callbacks = new Set<(event: AuthChangeEvent, value: Session | null) => void>()
  const unsubscribe = vi.fn()
  const mfa = {
    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null }),
    listFactors: vi.fn().mockResolvedValue({ data: { all: [totpFactor], totp: [totpFactor], phone: [], webauthn: [] }, error: null }),
    enroll: vi.fn().mockResolvedValue({ data: { id: 'new-factor', type: 'totp', totp: { qr_code: 'qr-image', secret: 'test-secret', uri: 'otpauth://test' } }, error: null }),
    challenge: vi.fn().mockResolvedValue({ data: { id: 'challenge-id', type: 'totp', expires_at: 1 }, error: null }),
    verify: vi.fn().mockResolvedValue({ data: session, error: null }),
  }
  const auth = {
    signUp: vi.fn().mockResolvedValue({ data: { user: confirmedUser, session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: confirmedUser, session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: confirmedUser }, error: null }),
    onAuthStateChange: vi.fn((callback: (event: AuthChangeEvent, value: Session | null) => void) => {
      callbacks.add(callback)
      return { data: { subscription: { unsubscribe: () => { callbacks.delete(callback); unsubscribe() } } } }
    }),
    resend: vi.fn().mockResolvedValue({ data: {}, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: confirmedUser }, error: null }),
    mfa,
  }
  const single = vi.fn().mockResolvedValue({ data: profile, error: null })
  const eq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return {
    client: { auth, from } as unknown as SupabaseClient<Database>,
    auth, mfa, from, select, eq, single, unsubscribe,
    emit: (event: AuthChangeEvent, value: Session | null) => callbacks.forEach(callback => callback(event, value)),
    listenerCount: () => callbacks.size,
    authorize: () => mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null }),
  }
}
