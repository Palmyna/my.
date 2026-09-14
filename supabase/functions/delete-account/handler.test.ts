import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDeleteAccountHandler } from './handler.ts'

const user = { id: 'owner', email: 'owner@example.test', email_confirmed_at: '2026-09-14', factors: [{ id: 'factor', factor_type: 'totp', status: 'verified' }] }
const ok = <T>(data: T) => ({ data, error: null })
const failure = { data: null, error: { status: 403 } }
const input = { currentPassword: 'fixture-password', totpCode: '123456', confirmConsequences: true, confirmDeletion: true }

function setup() {
  const caller = {
    auth: {
      getUser: vi.fn().mockResolvedValue(ok({ user })),
      getClaims: vi.fn().mockResolvedValue(ok({ claims: { sub: 'owner', aal: 'aal2', session_id: 'initial' } })),
    },
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ single: () => Promise.resolve(ok({ id: 'owner' })) }) }) }),
  }
  const reauth = { auth: {
    signInWithPassword: vi.fn().mockResolvedValue(ok({ user, session: { access_token: 'fresh' } })),
    getClaims: vi.fn()
      .mockResolvedValueOnce(ok({ claims: { sub: 'owner', aal: 'aal1', session_id: 'fresh' } }))
      .mockResolvedValue(ok({ claims: { sub: 'owner', aal: 'aal2', session_id: 'fresh' } })),
    mfa: {
      challenge: vi.fn().mockResolvedValue(ok({ id: 'new-challenge' })),
      verify: vi.fn().mockResolvedValue(ok({ access_token: 'verified', user })),
    },
    signOut: vi.fn().mockResolvedValue({ error: null }),
  } }
  const admin = { auth: { admin: {
    signOut: vi.fn().mockResolvedValue({ error: null }),
    deleteUser: vi.fn().mockResolvedValue(ok({})),
  } } }
  const handler = createDeleteAccountHandler({
    userClient: token => (token ? caller : reauth) as unknown as SupabaseClient,
    adminClient: () => admin as unknown as SupabaseClient,
  })
  const invoke = (body: unknown = input, token = 'initial') => handler(new Request('http://local/delete-account', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }))
  return { caller, reauth, admin: admin.auth.admin, handler, invoke }
}

test.each([
  [{ ...input, currentPassword: '' }, 400],
  [{ ...input, totpCode: '' }, 400],
  [{ ...input, confirmConsequences: false }, 400],
  [{ ...input, user_id: 'another-user' }, 400],
  [{ ...input, factorId: 'foreign-factor' }, 400],
  [{ ...input, challengeId: 'old-challenge' }, 400],
  [{ ...input, access_token: 'foreign-token' }, 400],
  [null, 400],
])('refuse une requête incomplète ou une identité/preuve fournie par le client : %j', async (body, status) => {
  const s = setup()
  expect((await s.invoke(body)).status).toBe(status)
  expect(s.reauth.auth.signInWithPassword).not.toHaveBeenCalled()
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test('exige un vrai contexte utilisateur aal2 confirmé', async () => {
  const s = setup()
  expect((await s.invoke(input, '')).status).toBe(401)
  s.caller.auth.getClaims.mockResolvedValue(ok({ claims: { sub: 'owner', aal: 'aal1', session_id: 'initial' } }))
  expect((await s.invoke()).status).toBe(403)
  s.caller.auth.getUser.mockResolvedValue(failure)
  expect((await s.invoke()).status).toBe(401)
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test('ne prend pas un email non confirmé ou un facteur manquant pour un compte autorisé', async () => {
  const s = setup()
  s.caller.auth.getUser.mockResolvedValue(ok({ user: { ...user, email_confirmed_at: null } }))
  expect((await s.invoke()).status).toBe(403)
  s.caller.auth.getUser.mockResolvedValue(ok({ user: { ...user, factors: [] } }))
  expect((await s.invoke()).status).toBe(403)
  expect(s.reauth.auth.signInWithPassword).not.toHaveBeenCalled()
})
test('mot de passe incorrect : aucun challenge ni suppression', async () => {
  const s = setup()
  s.reauth.auth.signInWithPassword.mockResolvedValue(failure)
  expect((await s.invoke()).status).toBe(403)
  expect(s.reauth.auth.mfa.challenge).not.toHaveBeenCalled()
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
  expect(s.reauth.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
test.each(['identity', 'factor', 'session'])('refuse le mismatch après authentification : %s', async kind => {
  const s = setup()
  if (kind === 'identity') s.reauth.auth.signInWithPassword.mockResolvedValue(ok({ user: { ...user, id: 'other' }, session: { access_token: 'fresh' } }))
  if (kind === 'factor') s.reauth.auth.signInWithPassword.mockResolvedValue(ok({ user: { ...user, factors: [{ ...user.factors[0], id: 'foreign' }] }, session: { access_token: 'fresh' } }))
  if (kind === 'session') s.reauth.auth.getClaims.mockReset().mockResolvedValue(ok({ claims: { sub: 'owner', aal: 'aal1', session_id: 'initial' } }))
  expect((await s.invoke()).status).toBe(403)
  expect(s.reauth.auth.mfa.challenge).not.toHaveBeenCalled()
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test.each(['challenge', 'verify'])('échec MFA (invalide/expiré) : fermeture sans suppression, %s', async step => {
  const s = setup()
  s.reauth.auth.mfa[step as 'challenge' | 'verify'].mockResolvedValue(failure)
  expect((await s.invoke()).status).toBe(403)
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test('ne mélange pas les identités ou sessions après MFA', async () => {
  const s = setup()
  s.reauth.auth.mfa.verify.mockResolvedValue(ok({ access_token: 'foreign', user: { ...user, id: 'other' } }))
  expect((await s.invoke()).status).toBe(403)
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test('deux facteurs corrects sans validation finale : refus et session technique terminée', async () => {
  const s = setup()
  expect((await s.invoke({ ...input, confirmDeletion: false })).status).toBe(400)
  expect(s.reauth.auth.mfa.verify).toHaveBeenCalled()
  expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
test('vérifie dans le bon ordre et ne supprime que l’identité Auth originale', async () => {
  const s = setup()
  const response = await s.invoke()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ deleted: true })
  expect(s.reauth.auth.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: input.currentPassword })
  expect(s.reauth.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'factor', challengeId: 'new-challenge', code: input.totpCode })
  expect(s.reauth.auth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(s.reauth.auth.mfa.challenge.mock.invocationCallOrder[0]!)
  expect(s.reauth.auth.mfa.verify.mock.invocationCallOrder[0]).toBeLessThan(s.admin.signOut.mock.invocationCallOrder[0]!)
  expect(s.admin.signOut).toHaveBeenCalledWith('verified', 'global')
  expect(s.admin.signOut.mock.invocationCallOrder[0]).toBeLessThan(s.admin.deleteUser.mock.invocationCallOrder[0]!)
  expect(s.admin.deleteUser).toHaveBeenCalledWith('owner', false)
})
test.each(['signOut', 'deleteUser'])('échec privilégié non masqué et aucune fuite de détails : %s', async step => {
  const s = setup()
  s.admin[step as 'signOut' | 'deleteUser'].mockResolvedValue({ data: null, error: new Error('private SQL / token detail') })
  const response = await s.invoke()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private')
  if (step === 'signOut') expect(s.admin.deleteUser).not.toHaveBeenCalled()
})
