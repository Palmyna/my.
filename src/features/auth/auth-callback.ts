import type { Session } from '@supabase/supabase-js'
import { z } from 'zod'

export type EmailCallback = { kind: 'signup' | 'recovery'; tokens: { access_token: string; refresh_token: string } } | { error: true } | null

// Capture once at store startup, before creating Supabase. Tokens never enter React state.
export function readEmailCallback(): EmailCallback {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.slice(1))
  const authKeys = ['access_token', 'refresh_token', 'type', 'error', 'error_code', 'error_description', 'code', 'token_hash']
  const hasCallback = authKeys.some(key => params.has(key) || url.searchParams.has(key))
  if (!hasCallback) return null
  url.hash = ''
  authKeys.forEach(key => url.searchParams.delete(key))
  window.history.replaceState(window.history.state, '', url.pathname + url.search)
  const kind = params.get('type')
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (params.has('error') || !access_token || !refresh_token
    || (kind !== 'signup' && kind !== 'recovery')
    || url.pathname !== (kind === 'signup' ? '/auth/confirm-email' : '/reset-password')) return { error: true }
  return { kind, tokens: { access_token, refresh_token } }
}

export const authRedirectUrl = (path: '/auth/confirm-email' | '/reset-password') => new URL(path, window.location.origin).href

export interface RecoveryContext {
  has: (session: Session) => boolean
  save: (session: Session) => void
  clear: () => void
}

const sessionClaim = z.object({ session_id: z.string().min(1) })
function sessionId(session: Session) {
  try {
    const payload = session.access_token.split('.')[1]
    if (!payload) return null
    return sessionClaim.parse(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))).session_id
  } catch { return null }
}

// A navigation hint bound to the Auth session, never an authorization claim or token copy.
// Supabase remains the only session persistence owner; MFA is independently checked remotely.
const recoveryKey = 'my.auth.password-recovery'
export const browserRecoveryContext: RecoveryContext = {
  has(session) {
    try { const id = sessionId(session); return id !== null && sessionStorage.getItem(recoveryKey) === id } catch { return false }
  },
  save(session) {
    const id = sessionId(session)
    if (id) sessionStorage.setItem(recoveryKey, id)
  },
  clear() { sessionStorage.removeItem(recoveryKey) },
}
