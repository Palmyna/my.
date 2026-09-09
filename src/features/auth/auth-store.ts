import type { Session, User } from '@supabase/supabase-js'
import type { AuthService, MfaState, Profile } from '../../services/auth'

export type AuthStatus = 'initializing' | 'unconfigured' | 'signed_out'
  | 'email_confirmation_required' | 'mfa_enrollment_required' | 'mfa_challenge_required'
  | 'authorized' | 'error'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  mfa: MfaState | null
  profile: Profile | null
  pendingEmail: string | null
  passwordRecovery: boolean
  error: Error | null
}

const initialState: AuthState = {
  status: 'initializing', session: null, user: null, mfa: null, profile: null,
  pendingEmail: null, passwordRecovery: false, error: null,
}

// One external store per provider; Supabase remains the owner of persisted sessions.
export function createAuthStore(getService: () => AuthService | null, clearData: () => void) {
  let state = initialState
  let service: AuthService | null = null
  let revision = 0
  let active = false
  let currentUserId: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
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
      const base = { ...initialState, session, user: mfa.user, mfa, passwordRecovery: state.passwordRecovery }
      if (!mfa.user.email_confirmed_at) {
        emit({ ...base, status: 'email_confirmation_required' })
      } else if (mfa.requirement !== 'satisfied') {
        emit({ ...base, status: mfa.requirement === 'enrollment_required' ? 'mfa_enrollment_required' : 'mfa_challenge_required' })
      } else {
        const profile = await auth.getProfile()
        if (current()) emit({ ...base, status: 'authorized', profile })
      }
    } catch (error) {
      if (current()) fail(error)
    }
  }

  function accept(session: Session | null, recovery = false) {
    const ticket = invalidate()
    currentUserId = session?.user.id ?? null
    if (!session) {
      emit({ ...initialState, status: 'signed_out' })
      return
    }
    emit({ ...initialState, passwordRecovery: recovery })
    // Never await another Supabase Auth call inside onAuthStateChange's lock.
    timer = setTimeout(() => { void resolve(session, ticket) }, 0)
  }

  async function restore() {
    const ticket = invalidate()
    const recovery = state.passwordRecovery
    emit({ ...initialState, passwordRecovery: recovery })
    try {
      const session = await requireService().getSession()
      if (active && ticket === revision) accept(session, recovery)
    } catch (error) {
      if (active && ticket === revision) fail(error)
    }
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
        service = getService()
        if (service) {
          unsubscribe = service.subscribe((event, session) => {
            if (!active) return
            const recovery = event === 'PASSWORD_RECOVERY'
              || (state.passwordRecovery && session !== null && session.user.id === currentUserId)
            accept(session, recovery)
          })
          void restore()
        } else emit({ ...initialState, status: 'unconfigured' })
      } catch (error) { fail(error) }
      return () => {
        active = false
        invalidate()
        unsubscribe?.()
      }
    },
    actions: {
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
        invalidate()
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
      async updatePassword(password: string) {
        const result = await requireService().updatePassword(password)
        if (active) {
          emit({ ...state, passwordRecovery: false })
          await restore()
        }
        return result
      },
      refresh: restore,
    },
  }
}

export type AuthStore = ReturnType<typeof createAuthStore>
