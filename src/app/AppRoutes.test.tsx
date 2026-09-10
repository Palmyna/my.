import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { expect, test, vi } from 'vitest'
import { createAuthService } from '../services/auth'
import { confirmedUser, mockAuthClient, profile, session } from '../test/auth-fixtures'
import { AuthContext } from '../features/auth/auth-context'
import { createAuthStore, type AuthStore } from '../features/auth/auth-store'
import type { EmailCallback } from '../features/auth/auth-callback'
import { AppRoutes } from './AppRoutes'

function Harness({ store, path }: { store: AuthStore; path: string }) {
  useEffect(() => store.start(), [store])
  return <AuthContext value={store}><MemoryRouter initialEntries={[path]}><AppRoutes /><Path /></MemoryRouter></AuthContext>
}
function Path() { return <span data-testid="path">{useLocation().pathname}</span> }
function setup(path = '/', mode: 'out' | 'aal1' | 'aal2' | 'enroll' = 'out', callback: EmailCallback = null) {
  const mock = mockAuthClient()
  if (mode === 'out') mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  if (mode === 'aal2') mock.authorize()
  if (mode === 'enroll') {
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: [] } }, error: null })
    mock.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null })
  }
  const clearData = vi.fn()
  const store = createAuthStore(() => createAuthService(mock.client), clearData, () => callback)
  render(<Harness store={store} path={path} />)
  return { mock, store, clearData }
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
async function heading(name: string) { expect(await screen.findByRole('heading', { name })).toBeVisible() }
const tokenCallback = (kind: 'signup' | 'recovery'): EmailCallback => ({ kind, tokens: { access_token: 'test', refresh_token: 'test' } })

test.each([
  ['/', 'out', 'Vos cartes. Votre collection.', '/'],
  ['/dashboard', 'out', 'Heureux de vous retrouver.', '/login'],
  ['/dashboard', 'aal1', 'Confirmez que c’est vous.', '/auth/mfa/challenge'],
  ['/login', 'enroll', 'Sécurisez votre compte.', '/auth/mfa/enroll'],
  ['/signup', 'aal2', 'Authentification réussie.', '/dashboard'],
  ['/inconnue', 'out', 'Cette page n’existe pas.', '/inconnue'],
  ['/reset-password', 'out', 'Demandez un nouveau lien.', '/reset-password'],
] as const)('restauration %s (%s) sans flash privé', async (path, mode, title, finalPath) => {
  const { mock } = setup(path, mode)
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
  await heading(title)
  expect(screen.getByTestId('path')).toHaveTextContent(finalPath)
  if (mode !== 'aal2') expect(mock.from).not.toHaveBeenCalled()
})

test('signup valide, attente email et renvoi générique', async () => {
  const { mock } = setup('/signup')
  await heading('Bienvenue chez MY.')
  change('Adresse email', 'new@example.test'); change('Nouveau mot de passe', 'password'); change('Confirmer le mot de passe', 'password')
  press('Créer un compte')
  await heading('Consultez votre boîte email.')
  expect(mock.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.test', options: { emailRedirectTo: `${window.location.origin}/auth/confirm-email` } }))
  press('Renvoyer l’email')
  expect(await screen.findByRole('status')).toHaveTextContent('Si cette adresse attend une confirmation')
  expect(mock.auth.resend).toHaveBeenCalledOnce()
  expect(mock.from).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: 'Revenir à la connexion' }))
  await heading('Heureux de vous retrouver.')
})
test('signup refuse les mots de passe différents et montre une erreur serveur sans détail sensible', async () => {
  const { mock } = setup('/signup')
  await heading('Bienvenue chez MY.')
  change('Adresse email', 'new@example.test'); change('Nouveau mot de passe', 'password'); change('Confirmer le mot de passe', 'different')
  press('Créer un compte')
  expect(screen.getByRole('alert')).toHaveTextContent('ne correspondent pas')
  expect(mock.auth.signUp).not.toHaveBeenCalled()
  change('Confirmer le mot de passe', 'password')
  mock.auth.signUp.mockResolvedValue({ data: null, error: new Error('sensitive server payload') })
  press('Créer un compte')
  expect(await screen.findByText(/Impossible de terminer cette action/)).toBeVisible()
  expect(screen.queryByText(/sensitive server/)).not.toBeInTheDocument()
})
test('confirmation termine la session du lien et reste sans MFA ni profil', async () => {
  const { mock } = setup('/auth/confirm-email', 'aal2', tokenCallback('signup'))
  await heading('Adresse email confirmée')
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(mock.from).not.toHaveBeenCalled()
  expect(mock.auth.getUser).not.toHaveBeenCalled()
  act(() => mock.emit('INITIAL_SESSION', null))
  await heading('Adresse email confirmée')
  fireEvent.click(screen.getByRole('link', { name: 'Se connecter' }))
  await heading('Heureux de vous retrouver.')
})
test.each([true, false])('callback expiré ou erreur de session reste récupérable : %s', async invalid => {
  const mock = mockAuthClient()
  mock.auth.setSession.mockResolvedValue({ data: null, error: new Error('Expired') })
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => invalid ? { error: true } : tokenCallback('signup'))
  render(<Harness store={store} path="/auth/confirm-email" />)
  await heading('Impossible de continuer.')
  expect(mock.from).not.toHaveBeenCalled()
  press('Se déconnecter')
  await heading('Consultez votre boîte email.')
})
test.each(['enroll', 'aal1', 'aal2'] as const)('login email/password mène à %s', async mode => {
  const { mock } = setup('/login')
  await heading('Heureux de vous retrouver.')
  mock.auth.signInWithPassword.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('bad credentials'), { code: 'invalid_credentials' }) })
  change('Adresse email', confirmedUser.email!); change('Mot de passe', 'password'); press('Se connecter')
  expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect')
  mock.auth.signInWithPassword.mockImplementation(() => {
    if (mode === 'aal2') mock.authorize()
    if (mode === 'enroll') mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: [] } }, error: null })
    mock.auth.getSession.mockResolvedValue({ data: { session }, error: null }); mock.emit('SIGNED_IN', session)
    return Promise.resolve({ data: { session, user: confirmedUser }, error: null })
  })
  press('Se connecter')
  await heading(mode === 'aal2' ? 'Authentification réussie.' : mode === 'enroll' ? 'Sécurisez votre compte.' : 'Confirmez que c’est vous.')
})
test.each(['enroll', 'aal1'] as const)('TOTP %s : erreur, nouvel essai puis aal2 uniquement', async mode => {
  const { mock, store } = setup('/dashboard', mode)
  await heading(mode === 'enroll' ? 'Sécurisez votre compte.' : 'Confirmez que c’est vous.')
  const persist = vi.spyOn(Storage.prototype, 'setItem')
  if (mode === 'enroll') {
    press('Configurer mon Authenticator')
    expect(await screen.findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'qr-image')
    expect(screen.getByText('test-secret')).toBeInTheDocument()
    expect(JSON.stringify(store.getSnapshot())).not.toContain('test-secret')
    expect(persist).not.toHaveBeenCalled()
  }
  mock.mfa.verify.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Invalid code'), { code: 'mfa_verification_failed' }) })
  change('Code à 6 chiffres', '000000'); press(mode === 'enroll' ? 'Valider mon Authenticator' : 'Vérifier le code')
  expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect ou expiré')
  expect(mock.from).not.toHaveBeenCalled()
  mock.mfa.verify.mockImplementation(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user: confirmedUser }, error: null }); mock.authorize(); mock.emit('MFA_CHALLENGE_VERIFIED', session)
    return Promise.resolve({ data: session, error: null })
  })
  change('Code à 6 chiffres', '123456'); press(mode === 'enroll' ? 'Valider mon Authenticator' : 'Vérifier le code')
  await heading('Authentification réussie.')
  expect(mock.mfa.challenge).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('test-secret')).not.toBeInTheDocument()
})
test('forgot password donne une réponse générique et le callback exact', async () => {
  const { mock } = setup('/forgot-password')
  await heading('Mot de passe oublié ?')
  change('Adresse email', 'unknown@example.test'); press('Envoyer le lien')
  expect(await screen.findByRole('status')).toHaveTextContent('Si un compte correspond à cette adresse')
  expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledWith('unknown@example.test', { redirectTo: `${window.location.origin}/reset-password` })
})
test.each(['enroll', 'aal1'] as const)('recovery %s impose MFA avant reset et conserve la session après succès', async mode => {
  const { mock, store } = setup('/reset-password', mode, tokenCallback('recovery'))
  await heading(mode === 'enroll' ? 'Sécurisez votre compte.' : 'Confirmez que c’est vous.')
  expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument()
  expect(mock.from).not.toHaveBeenCalled()
  await expect(store.actions.updatePassword('premature')).rejects.toThrow('MFA')
  act(() => { mock.auth.getUser.mockResolvedValue({ data: { user: confirmedUser }, error: null }); mock.authorize(); mock.emit('MFA_CHALLENGE_VERIFIED', session) })
  await heading('Un nouveau départ.')
  expect(mock.from).not.toHaveBeenCalled()
  change('Nouveau mot de passe', 'new-password'); change('Confirmer le mot de passe', 'new-password'); press('Enregistrer le mot de passe')
  await heading('Authentification réussie.')
  expect(screen.getByRole('status')).toHaveTextContent('Vous restez connecté')
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(mock.auth.updateUser).toHaveBeenCalledOnce()
})
test('logout purge immédiatement le profil et le cache avant retour public', async () => {
  const { mock, clearData } = setup('/dashboard', 'aal2')
  await heading('Authentification réussie.')
  expect(screen.getByText(profile.public_id)).toBeVisible()
  clearData.mockClear(); press('Se déconnecter')
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
  await heading('Heureux de vous retrouver.')
  expect(clearData).toHaveBeenCalled()
  expect(mock.auth.signOut).toHaveBeenCalledOnce()
})
test('une restauration lente ne rend jamais de contenu privé', async () => {
  const mock = mockAuthClient()
  let finish!: (result: { data: { session: typeof session }; error: null }) => void
  mock.auth.getSession.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn())
  render(<Harness store={store} path="/dashboard" />)
  expect(screen.getByRole('status')).toHaveTextContent('Chargement')
  expect(mock.from).not.toHaveBeenCalled()
  act(() => finish({ data: { session }, error: null }))
  await waitFor(() => expect(store.getSnapshot().status).toBe('mfa_challenge_required'))
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
})
