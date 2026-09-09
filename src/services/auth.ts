import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type AuthService = ReturnType<typeof createAuthService>
export type MfaState = Awaited<ReturnType<AuthService['getMfaState']>>

function unwrap<T extends { data: unknown; error: unknown }>(result: T): NonNullable<T['data']> {
  if (result.error) {
    throw result.error instanceof Error ? result.error : new Error('Échec Supabase Auth/données.', { cause: result.error })
  }
  if (result.data == null) throw new Error('Réponse Supabase absente.')
  return result.data
}

export function createAuthService(client: SupabaseClient<Database>) {
  const auth = client.auth

  async function getSession() {
    return unwrap(await auth.getSession()).session
  }

  async function getAssuranceLevel(jwt?: string) {
    return unwrap(await auth.mfa.getAuthenticatorAssuranceLevel(jwt))
  }

  async function getMfaState(session: Session) {
    // Validate this exact session against Auth. Metadata is never an authority.
    const [userResult, assurance] = await Promise.all([
      auth.getUser(session.access_token), getAssuranceLevel(session.access_token),
    ])
    const user = unwrap(userResult).user
    if (!user) throw new Error('Utilisateur Supabase absent.')
    const factors = (user.factors ?? []).filter(factor => factor.factor_type === 'totp')
    const verifiedFactors = factors.filter(factor => factor.status === 'verified')
    const requirement = verifiedFactors.length === 0
      ? 'enrollment_required'
      : assurance.currentLevel === 'aal2' ? 'satisfied' : 'challenge_required'
    return { user, ...assurance, factors, verifiedFactors, requirement } as const
  }

  return {
    async signUp(email: string, password: string, emailRedirectTo?: string) {
      const data = unwrap(await auth.signUp({ email, password, options: emailRedirectTo ? { emailRedirectTo } : {} }))
      // With confirmation enabled Supabase can deliberately obscure an existing account.
      // A null session means "check your email", never proof of account existence.
      return { ...data, confirmationRequired: data.session === null }
    },
    async signIn(email: string, password: string) {
      return unwrap(await auth.signInWithPassword({ email, password }))
    },
    async signOut() {
      const { error } = await auth.signOut()
      if (error) throw error
    },
    getSession,
    subscribe(callback: (event: AuthChangeEvent, session: Session | null) => void) {
      const { data } = auth.onAuthStateChange(callback)
      return () => data.subscription.unsubscribe()
    },
    getAssuranceLevel,
    getMfaState,
    async listFactors() {
      return unwrap(await auth.mfa.listFactors())
    },
    async enrollTotp(friendlyName?: string) {
      // QR/secret are returned to the caller only, never cached in shared Auth state.
      return unwrap(await auth.mfa.enroll({ factorType: 'totp', issuer: 'MY.', ...(friendlyName ? { friendlyName } : {}) }))
    },
    async challengeTotp(factorId: string) {
      return unwrap(await auth.mfa.challenge({ factorId }))
    },
    async verifyTotp(factorId: string, challengeId: string, code: string) {
      return unwrap(await auth.mfa.verify({ factorId, challengeId, code }))
    },
    async resendConfirmation(email: string, emailRedirectTo?: string) {
      return unwrap(await auth.resend({ type: 'signup', email, options: emailRedirectTo ? { emailRedirectTo } : {} }))
    },
    async requestPasswordReset(email: string, redirectTo?: string) {
      return unwrap(await auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : {}))
    },
    async updatePassword(password: string) {
      // Auth's recovery session can update a password; RLS still requires aal2 for MY. data.
      return unwrap(await auth.updateUser({ password }))
    },
    async getProfile() {
      const session = await getSession()
      if (!session) throw new Error('Session requise pour lire le profil MY.')
      const mfa = await getMfaState(session)
      if (!mfa.user.email_confirmed_at || mfa.requirement !== 'satisfied') {
        throw new Error('Email confirmé et MFA TOTP aal2 requis pour lire le profil MY.')
      }
      return unwrap(await client.from('profiles').select('*').eq('id', mfa.user.id).single())
    },
  }
}
