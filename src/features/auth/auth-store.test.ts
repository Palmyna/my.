import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createAuthService } from '../../services/auth'
import { confirmedUser, mockAuthClient, profile, session } from '../../test/auth-fixtures'
import { createAuthStore } from './auth-store'
import { AccountDeletionError, type AccountDeletionInput } from '../../services/account-deletion'

const deletionInput: AccountDeletionInput = { currentPassword: 'secret-only-local', totpCode: '654321', confirmConsequences: true, confirmDeletion: true }

test('suppression refuse un store non autorisé sans appeler le service', async () => {
  const { store, mock, stop } = setup()
  await settle()
  await expect(store.actions.deleteAccount(deletionInput)).rejects.toMatchObject({ code: 'authorized_account_required' })
  expect(mock.functions.invoke).not.toHaveBeenCalled()
  stop()
})

test('suppression protège les doubles appels et ne conserve aucun secret dans le snapshot', async () => {
  const { store, mock, stop, clearData } = setup()
  mock.authorize(); await settle()
  let finish!: (value: unknown) => void
  mock.functions.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = store.actions.deleteAccount(deletionInput)
  await settle()
  expect(JSON.stringify(store.getSnapshot())).not.toContain(deletionInput.currentPassword)
  expect(JSON.stringify(store.getSnapshot())).not.toContain(deletionInput.totpCode)
  await expect(store.actions.deleteAccount(deletionInput)).rejects.toBeInstanceOf(AccountDeletionError)
  clearData.mockClear()
  finish({ data: { deleted: true }, error: null }); await pending
  expect(clearData).toHaveBeenCalledTimes(1)
  expect(store.getSnapshot()).toMatchObject({ status: 'signed_out', session: null, user: null, profile: null, mfa: null, accountDeleted: true })
  await store.actions.refresh(); await settle()
  expect(store.getSnapshot().status).toBe('signed_out')
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
  stop()
})

test('un refus après SIGNED_OUT reste visible puis reprend Auth à la fermeture', async () => {
  const { store, mock, stop } = setup()
  mock.authorize(); await settle()
  let failRequest!: (value: unknown) => void
  mock.functions.invoke.mockImplementation(() => new Promise((_resolve, reject) => { failRequest = reject }))
  const pending = store.actions.deleteAccount(deletionInput)
  const refused = expect(pending).rejects.toMatchObject({ code: 'uncertain' })
  await settle()
  mock.emit('SIGNED_OUT', null)
  failRequest(new Error('network')); await refused
  expect(store.getSnapshot().status).toBe('authorized')
  await expect(store.actions.deleteAccount(deletionInput)).rejects.toMatchObject({ code: 'authentication_required' })
  store.actions.resumeAuthAfterDeletion()
  expect(store.getSnapshot()).toMatchObject({ status: 'signed_out', accountDeleted: false })
  stop()
})

test('une réponse tardive ne déconnecte pas un autre compte arrivé pendant la suppression', async () => {
  const { store, mock, stop } = setup()
  mock.authorize(); await settle()
  let finish!: (value: unknown) => void
  mock.functions.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = store.actions.deleteAccount(deletionInput); await settle()
  const other = { ...confirmedUser, id: 'other-user' }
  mock.auth.getUser.mockResolvedValue({ data: { user: other }, error: null })
  mock.emit('SIGNED_IN', { ...session, user: other })
  finish({ data: { deleted: true }, error: null }); await pending; await settle()
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(store.getSnapshot().user?.id).toBe(other.id)
  expect(store.getSnapshot().accountDeleted).toBe(false)
  stop()
})

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
  await expect(store.actions.updatePassword('new-password')).rejects.toThrow('MFA')
  expect(mock.auth.updateUser).not.toHaveBeenCalled()
  mock.authorize()
  mock.emit('MFA_CHALLENGE_VERIFIED', session)
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'password_reset_required', profile: null })
  expect(mock.from).not.toHaveBeenCalled()
  await store.actions.updatePassword('new-password')
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'authorized', passwordRecovery: false, passwordChanged: true })
  expect(mock.auth.signOut).not.toHaveBeenCalled()
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

test('callback confirmation joué une fois sous remontage et événements tardifs ignorés', async () => {
  const mock = mockAuthClient()
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => ({ kind: 'signup', tokens: { access_token: 'test', refresh_token: 'test' } }))
  const stop = store.start()
  stop()
  const stopAgain = store.start()
  await settle()
  mock.emit('INITIAL_SESSION', null)
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'signed_out', emailConfirmed: true, profile: null })
  expect(mock.auth.setSession).toHaveBeenCalledOnce()
  expect(mock.auth.signOut).toHaveBeenCalledOnce()
  expect(mock.from).not.toHaveBeenCalled()
  stopAgain()
})

test('recovery persistée est restaurée sans profil même après aal2', async () => {
  const mock = mockAuthClient()
  mock.authorize()
  const context = { has: vi.fn(() => true), save: vi.fn(), clear: vi.fn() }
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => null, context)
  const stop = store.start()
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'password_reset_required', passwordRecovery: true, profile: null })
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('demande email uniquement depuis le compte autorisé et relecture des événements Auth', async () => {
  const { mock, store, stop } = setup()
  await settle()
  await expect(store.actions.requestEmailChange('new@example.test', 'http://localhost:5173/auth/confirm-email-change')).rejects.toThrow('MFA')
  mock.authorize()
  mock.emit('MFA_CHALLENGE_VERIFIED', session)
  await settle()
  const user = { ...confirmedUser, new_email: 'new@example.test' }
  mock.auth.updateUser.mockImplementation(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user }, error: null })
    mock.emit('USER_UPDATED', { ...session, user })
    return Promise.resolve({ data: { user }, error: null })
  })
  await store.actions.requestEmailChange('new@example.test', 'http://localhost:5173/auth/confirm-email-change')
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'authorized', user, emailChangeResult: null })
  expect(store.getSnapshot().user?.email).toBe(confirmedUser.email)
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  stop()
})

test('le changement volontaire exige authorized et reste distinct du recovery', async () => {
  const { mock, store, stop } = setup()
  await settle()
  await expect(store.actions.changePassword('current-password', 'new-password')).rejects.toThrow('MFA')
  mock.authorize()
  mock.emit('PASSWORD_RECOVERY', session)
  await settle()
  expect(store.getSnapshot().status).toBe('password_reset_required')
  await expect(store.actions.changePassword('current-password', 'new-password')).rejects.toThrow('MFA')
  expect(mock.auth.updateUser).not.toHaveBeenCalled()
  stop()
})

test('un succès volontaire survit à USER_UPDATED sans changer le contexte recovery ni autoriser un autre compte', async () => {
  const { mock, store, stop } = setup()
  mock.authorize()
  await settle()
  mock.auth.updateUser.mockImplementation(() => {
    mock.emit('USER_UPDATED', session)
    return Promise.resolve({ data: { user: confirmedUser }, error: null })
  })
  await store.actions.changePassword('current-password', 'new-password')
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'authorized', accountPasswordChange: 'success', passwordRecovery: false, passwordChanged: false, session })
  mock.emit('TOKEN_REFRESHED', session)
  await settle()
  expect(store.getSnapshot().accountPasswordChange).toBe('success')
  store.actions.clearPasswordChangeFeedback()
  expect(store.getSnapshot().accountPasswordChange).toBe('idle')
  await expect(store.actions.updatePassword('recovery-password')).rejects.toThrow('récupération')
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  stop()
})

test.each(['logout', 'autre compte', 'arrêt'])('une réponse password tardive après %s ne publie aucun succès', async mode => {
  const { mock, store, stop } = setup()
  mock.authorize()
  await settle()
  let finish!: (value: Awaited<ReturnType<typeof mock.auth.updateUser>>) => void
  mock.auth.updateUser.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const task = store.actions.changePassword('current-password', 'new-password')
  await settle()
  if (mode === 'logout') {
    mock.emit('SIGNED_OUT', null)
    mock.emit('SIGNED_IN', session)
  } else if (mode === 'autre compte') {
    const other = { ...confirmedUser, id: 'other-user' }
    mock.auth.getUser.mockResolvedValue({ data: { user: other }, error: null })
    mock.emit('SIGNED_IN', { ...session, user: other })
  } else stop()
  await settle()
  finish({ data: { user: confirmedUser }, error: null })
  await task
  expect(store.getSnapshot().accountPasswordChange).toBe('idle')
  stop()
})

test.each([false, true])('un avis de confirmation partielle ne crée pas de session ni de droits : session existante %s', async present => {
  const mock = mockAuthClient()
  if (!present) mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => ({ kind: 'email_change_pending' }))
  const stop = store.start()
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: present ? 'mfa_challenge_required' : 'signed_out', emailChangeResult: 'pending', emailConfirmed: false, profile: null })
  expect(mock.auth.setSession).not.toHaveBeenCalled()
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(mock.from).not.toHaveBeenCalled()
  stop()
})

test('confirmation de changement distincte du signup, consommée une fois après remontage', async () => {
  const mock = mockAuthClient()
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => ({ kind: 'email_change', tokens: session }))
  const stop = store.start()
  stop()
  const stopAgain = store.start()
  await settle()
  mock.emit('INITIAL_SESSION', null)
  await settle()
  expect(store.getSnapshot()).toMatchObject({ status: 'signed_out', emailChangeResult: 'confirmed', emailConfirmed: false, profile: null })
  expect(mock.auth.setSession).toHaveBeenCalledOnce()
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(mock.from).not.toHaveBeenCalled()
  stopAgain()
})
