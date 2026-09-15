import { AuthError, AuthSessionMissingError, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'
import { AccountDeletionError, invokeAccountDeletion, type AccountDeletionInput } from './account-deletion'

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
    async signOut(scope?: 'local') {
      const { error } = await (scope ? auth.signOut({ scope }) : auth.signOut())
      if (error) throw error
    },
    async deleteAccount(input: AccountDeletionInput) {
      try {
        const session = await getSession()
        if (!session) throw new AccountDeletionError('authentication_required')
        const mfa = await getMfaState(session)
        if (mfa.user.id !== session.user.id) throw new AccountDeletionError('identity_mismatch')
        if (!mfa.user.email_confirmed_at || mfa.requirement !== 'satisfied') throw new AccountDeletionError('authorized_account_required')
        if (mfa.verifiedFactors.length !== 1) throw new AccountDeletionError('verified_totp_required')
      } catch (error) {
        throw error instanceof AccountDeletionError ? error : new AccountDeletionError('service_unavailable')
      }
      return invokeAccountDeletion(client, input)
    },
    async completeEmailCallback(tokens: { access_token: string; refresh_token: string }, kind: 'signup' | 'recovery' | 'email_change') {
      const data = unwrap(await auth.setSession(tokens))
      if (!data.session || !data.user?.email_confirmed_at) throw new Error('Lien email invalide ou expiré.')
      if (kind === 'email_change') {
        const { user } = unwrap(await auth.getUser(data.session.access_token))
        if (!user?.email_confirmed_at || user.new_email || user.id !== data.user.id) {
          throw new Error('Le changement d’adresse email n’est pas confirmé.')
        }
      }
      if (kind !== 'recovery') {
        // End only the technical callback session, without logging out other devices.
        const { error } = await auth.signOut({ scope: 'local' })
        if (error) throw error
        return null
      }
      return data.session
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
      const { all } = unwrap(await auth.mfa.listFactors())
      if (all.some(factor => factor.status === 'verified')) throw new Error('Un Authenticator est déjà configuré. Reprenez la connexion.')
      // An abandoned setup has no retrievable secret. Replace only unverified TOTP.
      for (const factor of all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')) {
        unwrap(await auth.mfa.unenroll({ factorId: factor.id }))
      }
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
    async requestEmailChange(email: string, emailRedirectTo: string) {
      const session = await getSession()
      if (!session) throw new Error('Session requise pour modifier l’adresse email.')
      const mfa = await getMfaState(session)
      if (!mfa.user.email_confirmed_at || mfa.requirement !== 'satisfied') {
        throw new Error('Email confirmé et MFA TOTP aal2 requis pour modifier l’adresse email.')
      }
      // Auth owns email/new_email and enforces Secure Email Change on both addresses.
      // No frontend password or fresh-TOTP check can protect the native update endpoint.
      return unwrap(await auth.updateUser({ email }, { emailRedirectTo }))
    },
    async changePassword(currentPassword: string, password: string) {
      const session = await getSession()
      if (!session) throw new AuthSessionMissingError()
      const mfa = await getMfaState(session)
      if (!mfa.user.email_confirmed_at) throw new AuthError('Email confirmé requis.', 403, 'email_not_confirmed')
      if (mfa.requirement !== 'satisfied') throw new AuthError('MFA TOTP aal2 requis.', 403, 'insufficient_aal')
      // Auth alone verifies current_password; server enforcement is validated in Phase 4D.3.
      return unwrap(await auth.updateUser({ password, current_password: currentPassword }))
    },
    async updatePassword(password: string) {
      const session = await getSession()
      if (!session) throw new Error('Session requise pour modifier le mot de passe.')
      const mfa = await getMfaState(session)
      if (!mfa.user.email_confirmed_at || mfa.requirement !== 'satisfied') {
        throw new Error('MFA TOTP aal2 requis avant de modifier le mot de passe.')
      }
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
