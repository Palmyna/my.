import type { Session } from '@supabase/supabase-js'
import { z } from 'zod'

export type EmailCallback = { kind: 'signup' | 'recovery' | 'email_change'; tokens: { access_token: string; refresh_token: string } }
  | { kind: 'email_change_pending' } | { error: true } | null

// Capture once at store startup, before creating Supabase. Tokens never enter React state.
export function readEmailCallback(): EmailCallback {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.slice(1))
  const authKeys = ['access_token', 'refresh_token', 'type', 'error', 'error_code', 'error_description', 'code', 'token_hash', 'message', 'sb']
  const hasCallback = authKeys.some(key => params.has(key) || url.searchParams.has(key))
  if (!hasCallback) return null
  const hasError = ['error', 'error_code'].some(key => params.has(key) || url.searchParams.has(key))
  url.hash = ''
  authKeys.forEach(key => url.searchParams.delete(key))
  window.history.replaceState(window.history.state, '', url.pathname + url.search)
  const kind = params.get('type')
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (hasError) return { error: true }
  // Native Secure Email Change returns a message without tokens after the first link.
  // This is only a navigation notice, never proof of a completed email change.
  if (url.pathname === '/auth/confirm-email-change' && params.has('message')
    && !access_token && !refresh_token && !kind) return { kind: 'email_change_pending' }
  const paths = { signup: '/auth/confirm-email', recovery: '/reset-password', email_change: '/auth/confirm-email-change' }
  if (!access_token || !refresh_token || (kind !== 'signup' && kind !== 'recovery' && kind !== 'email_change')
    || url.pathname !== paths[kind]) return { error: true }
  return { kind, tokens: { access_token, refresh_token } }
}

export const authRedirectUrl = (path: '/auth/confirm-email' | '/reset-password' | '/auth/confirm-email-change') => new URL(path, window.location.origin).href

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
