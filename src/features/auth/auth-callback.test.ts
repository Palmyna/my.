import { beforeEach, expect, test, vi } from 'vitest'
import { session } from '../../test/auth-fixtures'
import { browserRecoveryContext, readEmailCallback, authRedirectUrl } from './auth-callback'

beforeEach(() => { sessionStorage.clear() })
test.each([
  ['/auth/confirm-email', 'signup'], ['/reset-password', 'recovery'],
])('consomme et nettoie le callback %s sans persister les tokens', (path, kind) => {
  window.history.replaceState(null, '', `${path}#access_token=test-token&refresh_token=test-refresh&type=${kind}`)
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  expect(readEmailCallback()).toEqual({ kind, tokens: { access_token: 'test-token', refresh_token: 'test-refresh' } })
  expect(window.location.hash).toBe('')
  expect(readEmailCallback()).toBeNull()
  expect(storage).not.toHaveBeenCalled()
})
test.each([
  '/auth/confirm-email#error=access_denied&error_code=otp_expired',
  '/auth/confirm-email#access_token=secret&type=signup',
  '/dashboard#access_token=secret&refresh_token=secret&type=signup',
  '/reset-password?code=secret',
])('refuse le lien invalide, expiré ou hors route et efface ses données : %s', url => {
  window.history.replaceState(null, '', url)
  expect(readEmailCallback()).toEqual({ error: true })
  expect(window.location.hash + window.location.search).toBe('')
})
test('retours email basés sur l’origine courante', () => {
  expect(authRedirectUrl('/reset-password')).toBe(`${window.location.origin}/reset-password`)
  expect(authRedirectUrl('/auth/confirm-email')).toBe(`${window.location.origin}/auth/confirm-email`)
})
test('le contexte recovery survit au refresh, lié au session_id et jamais au token', () => {
  const token = (id: string) => `header.${btoa(JSON.stringify({ session_id: id }))}.signature`
  const recovery = { ...session, access_token: token('recovery-session') }
  browserRecoveryContext.save(recovery)
  expect(browserRecoveryContext.has(recovery)).toBe(true)
  expect(browserRecoveryContext.has({ ...session, access_token: token('new-session') })).toBe(false)
  expect(sessionStorage.getItem('my.auth.password-recovery')).toBe('recovery-session')
  browserRecoveryContext.clear()
  expect(browserRecoveryContext.has(recovery)).toBe(false)
})
