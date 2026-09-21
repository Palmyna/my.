import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { createAuthService } from '../services/auth'
import { confirmedUser, mockAuthClient, profile, session } from '../test/auth-fixtures'
import { AuthContext } from '../features/auth/auth-context'
import { createAuthStore, type AuthStore } from '../features/auth/auth-store'
import type { EmailCallback } from '../features/auth/auth-callback'
import { AppRoutes } from './AppRoutes'
import { CollectionsError, getCollectionOverview, listDashboardCollections } from '../services/collections'
import type { DashboardCollection } from '../types/collections'

vi.mock('../services/collections', async importOriginal => ({
  ...await importOriginal<typeof import('../services/collections')>(),
  listDashboardCollections: vi.fn(), getCollectionOverview: vi.fn(),
}))
const collection: DashboardCollection = {
  collectionId: 'c1200000-0000-0000-0000-000000000001', name: 'Collection de test', collectionType: 'free', access: 'owned',
  targetType: null, targetName: null, ownedCount: 0, totalCount: 0,
}
const collectionPath = `/collections/${collection.collectionId}`
beforeEach(() => {
  vi.mocked(listDashboardCollections).mockReset().mockResolvedValue([])
  vi.mocked(getCollectionOverview).mockReset().mockResolvedValue(collection)
})

function Harness({ store, path }: { store: AuthStore; path: string }) {
  const [queryClient] = useState(() => new QueryClient())
  useEffect(() => store.start(), [store])
  return <QueryClientProvider client={queryClient}><AuthContext value={store}><MemoryRouter initialEntries={[path]}><AppRoutes /><Path /></MemoryRouter></AuthContext></QueryClientProvider>
}
function Path() { return <span data-testid="path">{useLocation().pathname}</span> }
function setup(path = '/', mode: 'out' | 'aal1' | 'aal2' | 'enroll' | 'email' = 'out', callback: EmailCallback = null) {
  const mock = mockAuthClient()
  if (mode === 'out') mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  if (mode === 'aal2') mock.authorize()
  if (mode === 'email') mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined } }, error: null })
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
async function heading(name: string | RegExp) { expect(await screen.findByRole('heading', { name })).toBeVisible() }
const tokenCallback = (kind: 'signup' | 'recovery'): EmailCallback => ({ kind, tokens: { access_token: 'test', refresh_token: 'test' } })
const protectedPages = [['/dashboard', 'Dashboard'], ['/profile', 'Profil'], ['/settings', 'Paramètres'], [collectionPath, collection.name]] as const

test.each(['owned', 'shared'] as const)('le lien tuile %s ouvre la bonne route et permet le retour', async access => {
  vi.mocked(listDashboardCollections).mockResolvedValue([{ ...collection, access }])
  vi.mocked(getCollectionOverview).mockResolvedValue({ ...collection, access })
  setup('/dashboard', 'aal2')
  const tile = await screen.findByRole('link', { name: collection.name })
  expect(tile).toHaveAttribute('href', collectionPath)
  fireEvent.click(tile)
  await heading(collection.name)
  expect(screen.getByTestId('path')).toHaveTextContent(collectionPath)
  expect(getCollectionOverview).toHaveBeenCalledExactlyOnceWith(collection.collectionId)
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  expect(document.title).toBe(`${collection.name} — MY.`)
  fireEvent.click(screen.getByRole('link', { name: 'Retour au Dashboard' }))
  await heading('Dashboard')
})

test('chargement asynchrone : h1 focalisé une fois, titre mis à jour sans refocus', async () => {
  let finish!: (value: DashboardCollection) => void
  vi.mocked(getCollectionOverview).mockReturnValue(new Promise(resolve => { finish = resolve }))
  setup(collectionPath, 'aal2')
  await heading('Collection')
  const title = screen.getByRole('heading', { level: 1 })
  expect(title).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Chargement de la collection')
  const back = screen.getByRole('link', { name: 'Retour au Dashboard' })
  back.focus()
  await act(async () => { finish(collection); await Promise.resolve() })
  await heading(collection.name)
  expect(screen.getByRole('heading', { level: 1 })).toBe(title)
  expect(back).toHaveFocus()
  expect(document.title).toBe(`${collection.name} — MY.`)
})

test.each(['missing', 'private', 'revoked', 'malformed'])('route indisponible uniforme : %s', async reason => {
  vi.mocked(getCollectionOverview).mockRejectedValue(new CollectionsError('collection_unavailable'))
  setup(reason === 'malformed' ? '/collections/not-an-id' : collectionPath, 'aal2')
  await heading('Collection indisponible')
  expect(screen.getByRole('alert')).toHaveTextContent('Cette collection n’existe pas ou vous n’y avez plus accès.')
  expect(screen.getByRole('link', { name: 'Retour au Dashboard' })).toBeVisible()
  expect(document.title).toBe('Collection indisponible — MY.')
})

test('naviguer entre deux collections ne réutilise pas la donnée de la première', async () => {
  const second = { ...collection, collectionId: 'c1200000-0000-0000-0000-000000000002', name: 'Deuxième collection' }
  vi.mocked(listDashboardCollections).mockResolvedValue([collection, second])
  vi.mocked(getCollectionOverview).mockResolvedValueOnce(collection).mockReturnValueOnce(new Promise(() => {}))
  setup('/dashboard', 'aal2')
  fireEvent.click(await screen.findByRole('link', { name: collection.name }))
  await heading(collection.name)
  fireEvent.click(screen.getByRole('link', { name: 'Retour au Dashboard' }))
  fireEvent.click(await screen.findByRole('link', { name: second.name }))
  await screen.findByText('Chargement de la collection…')
  expect(screen.queryByText(collection.name)).not.toBeInTheDocument()
  expect(getCollectionOverview).toHaveBeenLastCalledWith(second.collectionId)
})

test.each([
  ['/', 'out', /Bienvenue sur MY\./, '/'],
  ['/dashboard', 'out', 'Heureux de vous retrouver.', '/login'],
  ['/dashboard', 'aal1', 'Confirmez que c’est vous.', '/auth/mfa/challenge'],
  ['/login', 'enroll', 'Sécurisez votre compte.', '/auth/mfa/enroll'],
  ['/signup', 'aal2', 'Dashboard', '/dashboard'],
  ['/inconnue', 'out', 'Cette page n’existe pas.', '/inconnue'],
  ['/reset-password', 'out', 'Demandez un nouveau lien.', '/reset-password'],
] as const)('restauration %s (%s) sans flash privé', async (path, mode, title, finalPath) => {
  const { mock } = setup(path, mode)
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
  await heading(title)
  expect(screen.getByTestId('path')).toHaveTextContent(finalPath)
  if (finalPath === '/') expect(screen.getByRole('link', { name: 'Connexion' })).toBeVisible()
  else expect(screen.queryByRole('link', { name: 'Connexion' })).not.toBeInTheDocument()
  if (mode !== 'aal2') expect(mock.from).not.toHaveBeenCalled()
})

test('le succès password reste visible sur /profile après le démontage USER_UPDATED', async () => {
  const { mock, store } = setup('/profile', 'aal2')
  await heading('Profil')
  let finish!: (value: Awaited<ReturnType<typeof mock.auth.updateUser>>) => void
  mock.auth.updateUser.mockImplementation(() => {
    mock.emit('USER_UPDATED', session)
    return new Promise(resolve => { finish = resolve })
  })
  change('Mot de passe actuel', 'current-password')
  change('Nouveau mot de passe', 'new-password')
  change('Confirmer le nouveau mot de passe', 'new-password')
  press('Modifier le mot de passe')
  await waitFor(() => expect(mock.auth.updateUser).toHaveBeenCalledOnce())
  await heading('Profil')
  expect(screen.queryByText('Mot de passe modifié.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Mot de passe actuel')).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Mot de passe actuel').closest('form')!)
  expect(mock.auth.updateUser).toHaveBeenCalledOnce()
  await act(async () => {
    finish({ data: { user: confirmedUser }, error: null })
    await Promise.resolve()
  })
  expect(await screen.findByText('Mot de passe modifié.')).toHaveAttribute('role', 'status')
  expect(screen.getByTestId('path')).toHaveTextContent('/profile')
  expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('')
  expect(screen.getByLabelText('Nouveau mot de passe', { exact: true })).toHaveValue('')
  expect(screen.getByLabelText('Confirmer le nouveau mot de passe')).toHaveValue('')
  expect(store.getSnapshot()).toMatchObject({ status: 'authorized', passwordRecovery: false, passwordChanged: false })
  expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(mock.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
})

test.each(protectedPages)('restaure directement %s en aal2 dans le shell authentifié', async (path, title) => {
  setup(path, 'aal2')
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  await heading(title)
  expect(screen.getByTestId('path')).toHaveTextContent(path)
  expect(screen.getByRole('link', { name: 'MY. — Dashboard' })).toHaveAttribute('href', '/dashboard')
  expect(screen.queryByRole('link', { name: 'MY. — Accueil' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mon compte' })).toHaveAttribute('aria-haspopup', 'menu')
  expect(within(screen.getByRole('main')).queryByRole('navigation')).not.toBeInTheDocument()
  if (path === '/settings') expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument()
  if (path === '/dashboard') expect(within(screen.getByRole('main')).getByRole('button', { name: 'Créer une collection personnalisée' })).toBeVisible()
  const page = screen.getByRole('region', { name: title })
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(page).toContainElement(screen.getByRole('heading', { level: 1, name: title }))
  expect(screen.getByRole('main')).toContainElement(page)
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Conditions d’utilisation')
  if (path === '/dashboard') {
    expect(within(page).getByRole('heading', { name: 'Mes collections' })).toBeVisible()
    expect(within(page).getByRole('heading', { name: 'Collections partagées avec moi' })).toBeVisible()
    expect(within(page).queryByText(profile.public_id)).not.toBeInTheDocument()
  } else if (path === '/profile') {
    expect(within(page).getByLabelText('MY.ID')).toHaveValue(profile.public_id)
    expect(within(page).getByRole('textbox', { name: 'Nouvelle adresse email' })).toBeVisible()
  } else {
    expect(within(page).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(page).queryByText(profile.public_id)).not.toBeInTheDocument()
  }
  expect(screen.getByRole('heading', { name: title })).toHaveFocus()
  expect(document.title).toBe(`${title} — MY.`)
})

test.each(protectedPages.flatMap(([path]) => [
  [path, 'out', 'Heureux de vous retrouver.', '/login'],
  [path, 'aal1', 'Confirmez que c’est vous.', '/auth/mfa/challenge'],
  [path, 'enroll', 'Sécurisez votre compte.', '/auth/mfa/enroll'],
  [path, 'email', 'Consultez votre boîte email.', '/auth/confirm-email'],
] as const))('protège %s pour une session %s', async (path, mode, title, target) => {
  const { mock } = setup(path, mode)
  await heading(title)
  expect(screen.getByTestId('path')).toHaveTextContent(target)
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  expect(mock.from).not.toHaveBeenCalled()
  expect(getCollectionOverview).not.toHaveBeenCalled()
})

test('le formulaire Profil retrouve la demande en attente après le rechargement USER_UPDATED', async () => {
  const { mock } = setup('/profile', 'aal2')
  await heading('Profil')
  const pendingUser = { ...confirmedUser, new_email: 'next@example.test' }
  mock.auth.updateUser.mockImplementation(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user: pendingUser }, error: null })
    mock.emit('USER_UPDATED', { ...session, user: pendingUser })
    return Promise.resolve({ data: { user: pendingUser }, error: null })
  })
  change('Nouvelle adresse email', pendingUser.new_email)
  press('Demander le changement')
  expect(await screen.findByText('Changement en attente')).toBeVisible()
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  expect(screen.getByText(/Nouvelle adresse demandée/)).toHaveTextContent(pendingUser.new_email)
  expect(screen.getByTestId('path')).toHaveTextContent('/profile')
  expect(screen.getByRole('heading', { name: 'Profil' })).toHaveFocus()
  expect(screen.getByLabelText('MY.ID')).toHaveValue(profile.public_id)
  expect(mock.auth.updateUser).toHaveBeenCalledOnce()
  expect(mock.auth.onAuthStateChange).toHaveBeenCalledOnce()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
})

test.each(['/', '/login', '/signup', '/forgot-password', '/auth/confirm-email', '/auth/mfa/enroll', '/auth/mfa/challenge', '/reset-password'])('redirige la route publique/Auth %s vers le Dashboard en aal2', async path => {
  setup(path, 'aal2')
  await heading('Dashboard')
  expect(screen.getByTestId('path')).toHaveTextContent('/dashboard')
  expect(screen.getByRole('button', { name: 'Mon compte' })).toBeVisible()
})

test('navigue entre les trois pages sans remonter le shell ni recréer l’abonnement Auth', async () => {
  const { mock } = setup('/dashboard', 'aal2')
  await heading('Dashboard')
  const header = screen.getByRole('banner')
  for (const [path, title] of [protectedPages[1], protectedPages[2], protectedPages[0]]) {
    if (path === '/dashboard') fireEvent.click(screen.getByRole('link', { name: 'MY. — Dashboard' }))
    else {
      press('Mon compte')
      fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: title }))
    }
    await heading(title)
    expect(screen.getByTestId('path')).toHaveTextContent(path)
    expect(screen.getByRole('banner')).toBe(header)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon compte' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: title })).toHaveFocus()
    expect(document.title).toBe(`${title} — MY.`)
  }
  expect(mock.auth.onAuthStateChange).toHaveBeenCalledOnce()
  expect(mock.listenerCount()).toBe(1)
})

test.each(protectedPages)('interdit %s pendant la récupération même en aal2', async path => {
  const { mock } = setup(path, 'aal2', tokenCallback('recovery'))
  await heading('Un nouveau départ.')
  expect(screen.getByTestId('path')).toHaveTextContent('/reset-password')
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  expect(mock.from).not.toHaveBeenCalled()
})

test.each(protectedPages)('retire immédiatement le shell de %s si le refresh revient en aal1', async (path, title) => {
  const { mock } = setup(path, 'aal2')
  await heading(title)
  mock.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] }, error: null })
  act(() => mock.emit('TOKEN_REFRESHED', session))
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  await heading('Confirmez que c’est vous.')
  expect(screen.getByTestId('path')).toHaveTextContent('/auth/mfa/challenge')
})

test('accueil puis connexion et inscription partagent la disposition publique', async () => {
  setup()
  await heading(/Bienvenue sur MY\./)
  expect(screen.getByRole('img', { name: 'MY.' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Connexion' })).toBeVisible()
  fireEvent.click(screen.getByRole('link', { name: 'Se connecter' }))
  await heading('Heureux de vous retrouver.')
  expect(screen.queryByRole('img', { name: 'MY.' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Adresse email')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Connexion' })).not.toBeInTheDocument()
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Conditions d’utilisation')
  fireEvent.click(screen.getByRole('link', { name: 'Inscrivez-vous dès maintenant !' }))
  await heading('Bienvenue chez MY.')
  expect(screen.getByLabelText('Confirmer le mot de passe')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Connexion' })).not.toBeInTheDocument()
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

test.each(['out', 'aal1', 'aal2'] as const)('callback email partiel en %s affiche une attente sans formulaire ni faux succès', async mode => {
  const { mock } = setup('/auth/confirm-email-change', mode, { kind: 'email_change_pending' })
  await heading('Confirmez les deux adresses email.')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByText('Adresse email modifiée')).not.toBeInTheDocument()
  expect(mock.auth.setSession).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
})

test('callback email final relit Auth et affiche un résultat distinct du signup', async () => {
  const { mock } = setup('/auth/confirm-email-change', 'aal2', { kind: 'email_change', tokens: session })
  await heading('Adresse email modifiée')
  expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login')
  expect(mock.from).not.toHaveBeenCalled()
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
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
  await heading(mode === 'aal2' ? 'Dashboard' : mode === 'enroll' ? 'Sécurisez votre compte.' : 'Confirmez que c’est vous.')
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
  await heading('Dashboard')
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
  await heading('Dashboard')
  expect(screen.getByText('Mot de passe modifié. Vous êtes connecté.')).toHaveAttribute('role', 'status')
  expect(screen.getByRole('heading', { name: 'Mes collections' })).toBeVisible()
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  expect(mock.auth.updateUser).toHaveBeenCalledOnce()
})
test.each(protectedPages)('logout depuis %s purge immédiatement le shell, le profil et le cache avant retour public', async (path, title) => {
  const { mock, clearData } = setup(path, 'aal2')
  await heading(title)
  expect(screen.getByRole('button', { name: 'Mon compte' })).toBeVisible()
  if (path === '/dashboard') expect(screen.getByRole('heading', { name: 'Mes collections' })).toBeVisible()
  clearData.mockClear(); press('Mon compte')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Déconnexion' }))
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  await heading('Heureux de vous retrouver.')
  expect(clearData).toHaveBeenCalled()
  expect(mock.auth.signOut).toHaveBeenCalledOnce()
})
test.each(protectedPages)('une restauration lente sur %s ne rend jamais de contenu privé', async path => {
  const mock = mockAuthClient()
  let finish!: (result: { data: { session: typeof session }; error: null }) => void
  mock.auth.getSession.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn())
  render(<Harness store={store} path={path} />)
  expect(screen.getByRole('status')).toHaveTextContent('Chargement')
  expect(screen.queryByRole('button', { name: 'Mon compte' })).not.toBeInTheDocument()
  expect(mock.from).not.toHaveBeenCalled()
  act(() => finish({ data: { session }, error: null }))
  await waitFor(() => expect(store.getSnapshot().status).toBe('mfa_challenge_required'))
  expect(screen.queryByText(profile.public_id)).not.toBeInTheDocument()
})
