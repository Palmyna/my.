import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeAll, expect, test, vi } from 'vitest'
import { AppRoutes } from '../../app/AppRoutes'
import { getSupabaseClient } from '../../services/supabase'
import { mockAuthClient, session } from '../../test/auth-fixtures'
import { AuthProvider } from '../auth/AuthProvider'

vi.mock('../../services/supabase', () => ({ getSupabaseClient: vi.fn() }))

beforeAll(() => {
  // jsdom has no native dialog implementation; focus trap/backdrop are verified in Edge.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

async function setup() {
  const mock = mockAuthClient(); mock.authorize()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  const queryClient = new QueryClient()
  const router = createMemoryRouter([{ path: '*', element: <AppRoutes /> }], { initialEntries: ['/dashboard', '/profile'] })
  render(<StrictMode><QueryClientProvider client={queryClient}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider></StrictMode>)
  const opener = await screen.findByRole('button', { name: 'Supprimer mon compte' })
  opener.focus(); fireEvent.click(opener)
  return { mock, queryClient, router, opener }
}
const modal = () => within(screen.getByRole('dialog'))
function consequences() {
  fireEvent.click(modal().getByRole('checkbox'))
  fireEvent.click(modal().getByRole('button', { name: 'Continuer' }))
}
function identity(password = 'private-password', code = '123456') {
  fireEvent.change(modal().getByLabelText('Mot de passe actuel'), { target: { value: password } })
  fireEvent.change(modal().getByLabelText('Code Authenticator'), { target: { value: code } })
  fireEvent.click(modal().getByRole('button', { name: 'Continuer' }))
}
function confirm() { fireEvent.click(modal().getByRole('button', { name: 'Supprimer définitivement mon compte' })) }

test('trois étapes séparées, conséquences obligatoires, aucun appel avant le clic final', async () => {
  const { mock } = await setup()
  expect(modal().getByRole('button', { name: 'Continuer' })).toBeDisabled()
  expect(modal().getByRole('heading')).toHaveFocus()
  modal().getByRole('button', { name: 'Annuler' }).focus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
  expect(modal().getByRole('checkbox')).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
  expect(modal().getByRole('button', { name: 'Annuler' })).toHaveFocus()
  expect(modal().getByText(/catalogue Pokémon global/)).toBeVisible()
  consequences()
  const password = modal().getByLabelText('Mot de passe actuel')
  expect(password).toHaveFocus()
  expect(password).toHaveAttribute('autocomplete', 'current-password')
  const totp = modal().getByLabelText('Code Authenticator')
  expect(totp).toHaveAttribute('inputmode', 'numeric')
  expect(totp).toHaveAttribute('maxlength', '6')
  identity('', '123')
  expect(password).toBeInTheDocument()
  identity()
  expect(modal().getByRole('heading')).toHaveTextContent('Confirmer la suppression')
  expect(mock.functions.invoke).not.toHaveBeenCalled()
  expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  expect(mock.mfa.verify).not.toHaveBeenCalled()
})

test('annulation/Escape nettoient les secrets et restaurent le focus', async () => {
  const { opener, mock } = await setup()
  consequences(); identity()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
  fireEvent.click(opener); consequences()
  expect(modal().getByLabelText('Mot de passe actuel')).toHaveValue('')
  expect(modal().getByLabelText('Code Authenticator')).toHaveValue('')
  fireEvent.click(modal().getByRole('button', { name: 'Annuler' }))
  expect(mock.functions.invoke).not.toHaveBeenCalled()
})

test('appel unique, navigation verrouillée puis succès/purge malgré un échec de nettoyage SDK', async () => {
  const { mock, queryClient, router } = await setup()
  let finish!: (result: unknown) => void
  mock.functions.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  mock.auth.signOut.mockResolvedValue({ error: new Error('cleanup unavailable') })
  queryClient.setQueryData(['private-collection'], { private: true })
  queryClient.getMutationCache().build(queryClient, { mutationKey: ['private-mutation'] })
  consequences(); identity(); confirm()
  await waitFor(() => expect(mock.functions.invoke).toHaveBeenCalledTimes(1))
  expect(modal().getByRole('heading')).toHaveFocus()
  expect(mock.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {
    currentPassword: 'private-password', totpCode: '123456', confirmConsequences: true, confirmDeletion: true,
  }, timeout: 60_000 })
  for (const button of modal().getAllByRole('button')) expect(button).toBeDisabled()
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: true }))
  await act(async () => { await router.navigate('/settings') })
  expect(router.state.location.pathname).toBe('/profile')
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  act(() => mock.emit('TOKEN_REFRESHED', session))
  expect(screen.getByRole('dialog')).toBeVisible()
  act(() => mock.emit('SIGNED_OUT', null))
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
  act(() => finish({ data: { deleted: true }, error: null }))
  await screen.findByText('Votre compte a été définitivement supprimé.')
  expect(router.state.location.pathname).toBe('/')
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  expect(mock.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  act(() => mock.emit('TOKEN_REFRESHED', session))
  await act(async () => { await router.navigate('/profile') })
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(screen.queryByLabelText('MY.ID')).not.toBeInTheDocument()
})

test.each([
  ['password_verification_failed', 'Mot de passe actuel', 'incorrect'],
  ['password_required', 'Mot de passe actuel', 'Renseignez'],
  ['totp_required', 'Code Authenticator', '6 chiffres'],
  ['totp_challenge_failed', 'Code Authenticator', 'démarrer'],
  ['totp_verification_failed', 'Code Authenticator', 'incorrect ou expiré'],
  ['service_unavailable', 'Code Authenticator', 'indisponible'],
  ['rate_limited', 'Code Authenticator', 'Trop de tentatives'],
])('erreur %s : reprise identité et focus logique, puis nouvel essai explicite', async (code, label, message) => {
  const { mock } = await setup()
  mock.functions.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status: code === 'rate_limited' ? 429 : 400 })) })
  consequences(); identity(); confirm()
  await waitFor(() => expect(modal().getByRole('alert')).toHaveTextContent(message))
  expect(modal().getByLabelText(label)).toHaveFocus()
  expect(modal().getByLabelText('Code Authenticator')).toHaveValue('')
  fireEvent.click(modal().getByRole('button', { name: 'Retour' }))
  expect(modal().getByRole('checkbox')).toBeChecked()
  fireEvent.click(modal().getByRole('button', { name: 'Continuer' }))
  identity('retry-password', '654321'); confirm()
  await screen.findByText('Votre compte a été définitivement supprimé.')
  expect(mock.functions.invoke).toHaveBeenCalledTimes(2)
})

test.each([
  ['authentication_required', 'expiré'], ['authorized_account_required', 'email confirmé'],
  ['verified_totp_required', 'Authenticator vérifié'], ['identity_mismatch', 'identité'],
  ['session_revocation_failed', 'n’a pas été supprimé'], ['deletion_failed', 'n’a pas été supprimé'],
  ['uncertain', 'peut-être eu lieu'],
])('erreur %s : résultat explicite et reconnexion sans relance destructive', async (code, message) => {
  const { mock, router } = await setup()
  mock.functions.invoke.mockResolvedValue({ data: null, error: code === 'uncertain' ? new Error('secret') : new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status: 503 })) })
  consequences(); identity(); confirm()
  await waitFor(() => expect(modal().getByRole('alert')).toHaveTextContent(message))
  expect(modal().getByRole('alert')).toHaveFocus()
  expect(modal().queryByRole('button', { name: 'Supprimer définitivement mon compte' })).not.toBeInTheDocument()
  expect(mock.auth.signOut).not.toHaveBeenCalled()
  fireEvent.click(modal().getByRole('button', { name: 'Revenir à la connexion' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Votre compte a été définitivement supprimé.')).not.toBeInTheDocument()
})

test('confirmation finale refusée : le retry conserve un payload complet', async () => {
  const { mock } = await setup()
  mock.functions.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response('{"error":"final_confirmation_required"}', { status: 400 })) })
  consequences(); identity(); confirm()
  await screen.findByRole('alert')
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
  confirm()
  await screen.findByText('Votre compte a été définitivement supprimé.')
  expect(mock.functions.invoke).toHaveBeenLastCalledWith('delete-account', { body: {
    currentPassword: 'private-password', totpCode: '123456', confirmConsequences: true, confirmDeletion: true,
  }, timeout: 60_000 })
})
