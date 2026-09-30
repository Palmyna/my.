import type { Session, User } from '@supabase/supabase-js'
import type { AuthService, MfaState, Profile } from '../../services/auth'
import { AccountDeletionError, type AccountDeletionInput } from '../../services/account-deletion'
import type { EmailCallback, RecoveryContext } from './auth-callback'

export type AuthStatus = 'initializing' | 'unconfigured' | 'signed_out'
  | 'email_confirmation_required' | 'mfa_enrollment_required' | 'mfa_challenge_required'
  | 'password_reset_required' | 'authorized' | 'error'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  mfa: MfaState | null
  profile: Profile | null
  pendingEmail: string | null
  passwordRecovery: boolean
  error: Error | null
  emailConfirmed: boolean
  passwordChanged: boolean
  accountPasswordChange: 'idle' | 'pending' | 'success'
  emailChangeResult: 'pending' | 'confirmed' | null
  accountDeleted: boolean
}

const initialState: AuthState = {
  status: 'initializing', session: null, user: null, mfa: null, profile: null,
  pendingEmail: null, passwordRecovery: false, error: null, emailConfirmed: false, passwordChanged: false,
  accountPasswordChange: 'idle',
  emailChangeResult: null,
  accountDeleted: false,
}

// One external store per provider; Supabase remains the owner of persisted sessions.
export function createAuthStore(getService: () => AuthService | null, clearData: () => void,
  readCallback: () => EmailCallback = () => null,
  recoveryContext?: RecoveryContext) {
  let state = initialState
  let service: AuthService | null = null
  let revision = 0
  let active = false
  let currentUserId: string | null = null
  let identityRevision = 0
  let deletionRunning = false
  let deferredDeletionSession: { session: Session | null; recovery: boolean } | null = null
  let deletedUserId: string | null = null
  let dismissedToken: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  let callbackRead = false
  let callbackPending = false
  let callbackResult: Promise<{ kind: 'signup' | 'recovery' | 'email_change' | 'email_change_pending'; session: Session | null }> | null = null
  const emit = (next: AuthState) => {
    state = next
    listeners.forEach(listener => listener())
  }
  const invalidate = () => {
    revision += 1
    clearTimeout(timer)
    clearData()
    return revision
  }
  const fail = (error: unknown) => {
    emit({ ...initialState, status: 'error', error: error instanceof Error ? error : new Error('Échec de résolution Auth.') })
  }
  const requireService = () => {
    if (!service) throw new Error('Supabase Auth non configuré.')
    return service
  }

  async function resolve(session: Session, ticket: number) {
    const current = () => active && ticket === revision
    try {
      const auth = requireService()
      const mfa = await auth.getMfaState(session)
      if (!current()) return
      const base = { ...initialState, session, user: mfa.user, mfa, passwordRecovery: state.passwordRecovery, passwordChanged: state.passwordChanged, emailChangeResult: state.emailChangeResult }
      if (!mfa.user.email_confirmed_at) {
        emit({ ...base, status: 'email_confirmation_required' })
      } else if (mfa.requirement !== 'satisfied') {
        emit({ ...base, status: mfa.requirement === 'enrollment_required' ? 'mfa_enrollment_required' : 'mfa_challenge_required' })
      } else if (base.passwordRecovery) {
        emit({ ...base, status: 'password_reset_required' })
      } else {
        const profile = await auth.getProfile()
        if (current()) emit({ ...base, status: 'authorized', profile, accountPasswordChange: state.accountPasswordChange })
      }
    } catch (error) {
      if (current()) fail(error)
    }
  }

  function accept(session: Session | null, recovery = false) {
    deferredDeletionSession = null
    if (session && (session.user.id === deletedUserId || session.access_token === dismissedToken)) session = null
    const ticket = invalidate()
    const sameUser = session !== null && session.user.id === currentUserId
    if (!sameUser) identityRevision += 1
    const accountPasswordChange = sameUser ? state.accountPasswordChange : 'idle'
    currentUserId = session?.user.id ?? null
    if (!session) {
      recoveryContext?.clear()
      emit({ ...initialState, status: 'signed_out', emailConfirmed: state.emailConfirmed, emailChangeResult: state.emailChangeResult, accountDeleted: state.accountDeleted })
      return
    }
    if (recovery) recoveryContext?.save(session)
    emit({ ...initialState, passwordRecovery: recovery || (recoveryContext?.has(session) ?? false), passwordChanged: state.passwordChanged, accountPasswordChange, emailChangeResult: state.emailChangeResult })
    // Never await another Supabase Auth call inside onAuthStateChange's lock.
    timer = setTimeout(() => { void resolve(session, ticket) }, 0)
  }

  async function restore() {
    if (deletionRunning) return
    const ticket = invalidate()
    const recovery = state.passwordRecovery
    emit({ ...initialState, passwordRecovery: recovery, passwordChanged: state.passwordChanged, accountPasswordChange: state.accountPasswordChange, emailChangeResult: state.emailChangeResult, accountDeleted: state.accountDeleted })
    try {
      if (callbackResult) {
        const result = await callbackResult
        if (!active || ticket !== revision) return
        callbackResult = null
        callbackPending = false
        if (result.kind === 'signup') {
          recoveryContext?.clear()
          emit({ ...initialState, status: 'signed_out', emailConfirmed: true })
        } else if (result.kind === 'email_change') {
          recoveryContext?.clear()
          emit({ ...initialState, status: 'signed_out', emailChangeResult: 'confirmed' })
        } else if (result.kind === 'email_change_pending') {
          emit({ ...state, emailChangeResult: 'pending' })
          accept(result.session, recovery)
        } else accept(result.session, true)
        return
      }
      const session = await requireService().getSession()
      if (active && ticket === revision) accept(session, recovery)
    } catch (error) {
      if (active && ticket === revision) fail(error)
    }
  }

  function leaveDeletedAccount(deleted: boolean) {
    identityRevision += 1
    dismissedToken = state.session?.access_token ?? null
    if (deleted) deletedUserId = currentUserId
    currentUserId = null
    callbackResult = null
    callbackPending = false
    deferredDeletionSession = null
    // Invalidate in-flight reads and purge the existing cache even if secondary cleanup fails.
    try { invalidate() } catch { /* Confirmed deletion must remain terminal. */ }
    try { recoveryContext?.clear() } catch { /* Browser storage may be unavailable. */ }
    emit({ ...initialState, status: 'signed_out', accountDeleted: deleted })
    void requireService().signOut('local').catch(() => { /* Auth is already invalidated in memory. */ })
  }

  return {
    getSnapshot: () => state,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() {
      active = true
      let unsubscribe: (() => void) | undefined
      try {
        // Strip callback credentials even when the service is unconfigured.
        const callback = callbackRead ? null : readCallback()
        callbackRead = true
        service = getService()
        if (service) {
          if (callback) {
            callbackPending = true
            callbackResult = 'error' in callback
              ? Promise.reject(new Error('Lien email invalide ou expiré. Demandez un nouvel email.'))
              : callback.kind === 'email_change_pending'
                ? service.getSession().then(session => ({ kind: callback.kind, session }))
                : service.completeEmailCallback(callback.tokens, callback.kind).then(session => ({ kind: callback.kind, session }))
          }
          unsubscribe = service.subscribe((event, session) => {
            if (!active || callbackPending) return
            const recovery = event === 'PASSWORD_RECOVERY'
              || (state.passwordRecovery && session !== null && session.user.id === currentUserId)
            // Revocation/refresh must not unmount the inert modal before its result arrives.
            // On refusal, resume this event when the user closes the result; retries recheck Auth.
            if (deletionRunning) { deferredDeletionSession = { session, recovery }; return }
            accept(session, recovery)
          })
          void restore()
        } else emit({ ...initialState, status: 'unconfigured' })
      } catch (error) { fail(error) }
      return () => {
        active = false
        identityRevision += 1
        state = { ...state, accountPasswordChange: 'idle' }
        invalidate()
        unsubscribe?.()
      }
    },
    actions: {
      async deleteAccount(input: AccountDeletionInput) {
        if (state.status !== 'authorized') throw new AccountDeletionError('authorized_account_required')
        if (deferredDeletionSession && deferredDeletionSession.session?.user.id !== currentUserId) throw new AccountDeletionError('authentication_required')
        if (deletionRunning) throw new AccountDeletionError('service_unavailable')
        const ticket = identityRevision
        deletionRunning = true
        try {
          const result = await requireService().deleteAccount(input)
          if (result.deleted !== true) throw new AccountDeletionError('uncertain')
          if (active && ticket === identityRevision) {
            // Do not locally sign out an account switched in another tab during the request.
            if (deferredDeletionSession?.session && deferredDeletionSession.session.user.id !== currentUserId) {
              const next = deferredDeletionSession
              deletedUserId = currentUserId
              deferredDeletionSession = null
              deletionRunning = false
              accept(next.session, next.recovery)
            } else leaveDeletedAccount(true)
          }
          return result
        } finally { deletionRunning = false }
      },
      reconnectAfterDeletion() { leaveDeletedAccount(false) },
      resumeAuthAfterDeletion() {
        if (deletionRunning || !deferredDeletionSession) return
        const next = deferredDeletionSession
        deferredDeletionSession = null
        accept(next.session, next.recovery)
      },
      async signUp(email: string, password: string, redirectTo?: string) {
        const auth = requireService()
        const ticket = revision
        const result = await auth.signUp(email, password, redirectTo)
        if (active && revision === ticket && result.confirmationRequired) {
          invalidate()
          emit({ ...initialState, status: 'email_confirmation_required', pendingEmail: email })
        }
        return result
      },
      signIn: (email: string, password: string) => requireService().signIn(email, password),
      async signOut() {
        identityRevision += 1
        invalidate()
        callbackResult = null
        callbackPending = false
        recoveryContext?.clear()
        emit(initialState)
        try {
          await requireService().signOut()
          if (active) accept(null)
        } catch (error) {
          if (active) fail(error)
          throw error
        }
      },
      enrollTotp: (name?: string) => requireService().enrollTotp(name),
      challengeTotp: (factorId: string) => requireService().challengeTotp(factorId),
      verifyTotp: (factorId: string, challengeId: string, code: string) => requireService().verifyTotp(factorId, challengeId, code),
      resendConfirmation: (email: string, redirectTo?: string) => requireService().resendConfirmation(email, redirectTo),
      requestPasswordReset: (email: string, redirectTo?: string) => requireService().requestPasswordReset(email, redirectTo),
      async requestEmailChange(email: string, redirectTo: string) {
        if (state.status !== 'authorized') throw new Error('Connectez-vous et terminez la vérification MFA avant de continuer.')
        // USER_UPDATED re-resolves user.email/new_email through Auth; no optimistic email copy.
        return requireService().requestEmailChange(email, redirectTo)
      },
      clearPasswordChangeFeedback() {
        if (state.accountPasswordChange !== 'pending') emit({ ...state, accountPasswordChange: 'idle' })
      },
      async changePassword(currentPassword: string, password: string) {
        if (state.status !== 'authorized') throw new Error('Connectez-vous et terminez la vérification MFA avant de continuer.')
        if (state.accountPasswordChange === 'pending') throw new Error('Changement de mot de passe en cours.')
        const ticket = identityRevision
        emit({ ...state, accountPasswordChange: 'pending' })
        try {
          const result = await requireService().changePassword(currentPassword, password)
          // Presentation only: survive USER_UPDATED/remount without storing either password.
          // A late response must never publish feedback in a different account/session lifecycle.
          if (active && ticket === identityRevision) emit({ ...state, accountPasswordChange: 'success' })
          return result
        } catch (error) {
          if (active && ticket === identityRevision) emit({ ...state, accountPasswordChange: 'idle' })
          throw error
        }
      },
      async updatePassword(password: string) {
        if (state.status !== 'password_reset_required') throw new Error('Validez le MFA du parcours de récupération avant de continuer.')
        const result = await requireService().updatePassword(password)
        if (active) {
          recoveryContext?.clear()
          emit({ ...state, passwordRecovery: false, passwordChanged: true })
          await restore()
        }
        return result
      },
      refresh: restore,
    },
  }
}

export type AuthStore = ReturnType<typeof createAuthStore>
