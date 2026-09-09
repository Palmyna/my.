import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createAuthService } from '../../services/auth'
import { confirmedUser, mockAuthClient, profile, session } from '../../test/auth-fixtures'
import { createAuthStore } from './auth-store'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function setup() {
  const mock = mockAuthClient()
  const clearData = vi.fn()
  const store = createAuthStore(() => createAuthService(mock.client), clearData)
  const stop = store.start()
  return { mock, store, stop, clearData }
}

async function settle() { await vi.runAllTimersAsync() }

test('restaure une session sans accès anticipé, puis attend le challenge', async () => {
  const { mock, store, stop } = setup()
  expect(store.getSnapshot()).toMatchObject({ status: 'initializing', session: null, profile: null })
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'mfa_challenge_required', user: confirmedUser, profile: null })
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('distingue absence de session, confirmation et enrollment', async () => {
  const { mock, store, stop } = setup()
  mock.emit('SIGNED_OUT', null)
  await settle()
  expect(store.getSnapshot().status).toBe('signed_out')
  await store.actions.signUp('new@example.test', 'password')
  expect(store.getSnapshot()).toMatchObject({ status: 'email_confirmation_required', pendingEmail: 'new@example.test', user: null, session: null })
  mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined } }, error: null })
  mock.emit('SIGNED_IN', session)
  await settle()
  expect(store.getSnapshot().status).toBe('email_confirmation_required')
  mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: [] } }, error: null })
  mock.emit('USER_UPDATED', session)
  await settle()
  expect(store.getSnapshot().status).toBe('mfa_enrollment_required')
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('MFA_CHALLENGE_VERIFIED ouvre le profil, TOKEN_REFRESHED réévalue les droits', async () => {
  const { mock, store, stop, clearData } = setup()
  await settle()
  mock.authorize()
  mock.emit('MFA_CHALLENGE_VERIFIED', session)
  expect(store.getSnapshot().status).toBe('initializing')
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'authorized', profile })
  const previousClears = clearData.mock.calls.length
  mock.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
  mock.emit('TOKEN_REFRESHED', session)
  expect(store.getSnapshot()).toMatchObject({ status: 'initializing', profile: null })
  await settle()
  expect(store.getSnapshot().status).toBe('mfa_challenge_required')
  expect(clearData.mock.calls.length).toBeGreaterThan(previousClears)
  stop()
})

test('logout invalide une lecture profil en cours et purge les données privées', async () => {
  const { mock, store, stop, clearData } = setup()
  mock.authorize()
  let finishProfile!: (value: { data: typeof profile; error: null }) => void
  mock.single.mockReturnValue(new Promise(resolve => { finishProfile = resolve }))
  await settle()
  expect(mock.single).toHaveBeenCalledOnce()
  await store.actions.signOut()
  finishProfile({ data: profile, error: null })
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'signed_out', profile: null, session: null })
  expect(clearData).toHaveBeenCalled()
  stop()
})

test('une restauration lente ne remplace jamais un événement Auth plus récent', async () => {
  const mock = mockAuthClient()
  let finishRestore!: (value: { data: { session: typeof session }; error: null }) => void
  mock.auth.getSession.mockReturnValue(new Promise(resolve => { finishRestore = resolve }))
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn())
  const stop = store.start()
  mock.emit('SIGNED_OUT', null)
  finishRestore({ data: { session }, error: null })
  await settle()
  expect(store.getSnapshot().status).toBe('signed_out')
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('le callback Auth reste synchrone et les listeners sont nettoyés au remontage', async () => {
  const { mock, store, stop } = setup()
  await settle()
  mock.auth.getUser.mockClear()
  mock.emit('SIGNED_IN', session)
  expect(mock.auth.getUser).not.toHaveBeenCalled()
  stop()
  await settle()
  expect(mock.auth.getUser).not.toHaveBeenCalled()
  expect(mock.listenerCount()).toBe(0)
  const stopAgain = store.start()
  expect(mock.listenerCount()).toBe(1)
  await settle()
  stopAgain()
  expect(mock.unsubscribe).toHaveBeenCalledTimes(2)
})

test('password recovery ne dispense pas de MFA et survit au refresh / challenge', async () => {
  const { mock, store, stop } = setup()
  mock.emit('PASSWORD_RECOVERY', session)
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'mfa_challenge_required', passwordRecovery: true })
  mock.emit('TOKEN_REFRESHED', session)
  await settle()
  expect(store.getSnapshot().passwordRecovery).toBe(true)
  // Supabase can emit SIGNED_IN again on focus, without a new login.
  mock.emit('SIGNED_IN', session)
  await settle()
  expect(store.getSnapshot().passwordRecovery).toBe(true)
  await store.actions.updatePassword('new-password')
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'mfa_challenge_required', passwordRecovery: false })
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('erreur Auth ou profil manquant ferment les accès', async () => {
  const { mock, store, stop } = setup()
  mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Revoked') })
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'error', profile: null, session: null })
  mock.auth.getUser.mockResolvedValue({ data: { user: confirmedUser }, error: null })
  mock.authorize()
  mock.single.mockResolvedValue({ data: null, error: new Error('Missing profile') })
  mock.emit('SIGNED_IN', session)
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'error', profile: null })
  stop()
})

test('Supabase absent garde le bootstrap utilisable sans état autorisé', async () => {
  const store = createAuthStore(() => null, vi.fn())
  const stop = store.start()
  expect(store.getSnapshot().status).toBe('unconfigured')
  await expect(store.actions.signUp('a@example.test', 'password')).rejects.toThrow('non configuré')
  stop()
})

test('une réponse MFA ancienne ne déclenche aucune lecture après changement de compte', async () => {
  const { mock, store, stop } = setup()
  let finishUser!: (value: { data: { user: typeof confirmedUser }; error: null }) => void
  mock.authorize()
  mock.auth.getUser.mockReturnValueOnce(new Promise(resolve => { finishUser = resolve }))
  await settle()
  const otherUser = { ...confirmedUser, id: 'other-user', factors: [] }
  mock.auth.getUser.mockResolvedValue({ data: { user: otherUser }, error: null })
  mock.emit('SIGNED_IN', { ...session, user: otherUser })
  await settle()
  finishUser({ data: { user: confirmedUser }, error: null })
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'mfa_enrollment_required', user: otherUser, profile: null })
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})
