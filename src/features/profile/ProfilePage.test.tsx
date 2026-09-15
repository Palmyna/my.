import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { createAuthService } from '../../services/auth'
import { confirmedUser, mockAuthClient, profile, session } from '../../test/auth-fixtures'
import { AuthContext } from '../auth/auth-context'
import { createAuthStore, type AuthStore } from '../auth/auth-store'
import { ProfilePage } from './ProfilePage'

function Harness({ store }: { store: AuthStore }) {
  useEffect(() => store.start(), [store])
  return <AuthContext value={store}><ProfilePage /></AuthContext>
}

async function setup(user: User = confirmedUser) {
  const mock = mockAuthClient()
  mock.authorize()
  mock.auth.getUser.mockResolvedValue({ data: { user }, error: null })
  mock.single.mockResolvedValue({ data: { ...profile, created_at: '2026-09-14T12:00:00Z' }, error: null })
  const store = createAuthStore(() => createAuthService(mock.client), vi.fn(), () => null)
  render(<Harness store={store} />)
  await screen.findByLabelText('MY.ID')
  return { mock, store }
}

const changeEmail = (value = 'next@example.test') => fireEvent.change(screen.getByRole('textbox', { name: 'Nouvelle adresse email' }), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Demander le changement' }))
const copyButton = () => screen.getByRole('button', { name: 'Copier l’identifiant MY.' })
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function clipboard(value: unknown) { Object.defineProperty(navigator, 'clipboard', { configurable: true, value }) }
afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

test('présente les vraies sources, la date Auth française et un identifiant immuable', async () => {
  await setup({ ...confirmedUser, created_at: '2020-02-03T12:00:00Z' })
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Profil')
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  expect(screen.getByLabelText('MY.ID')).toHaveValue(profile.public_id)
  expect(screen.getByLabelText('MY.ID')).toHaveAttribute('readonly')
  expect(screen.getByLabelText('MY.ID')).toHaveAttribute('type', 'text')
  expect(screen.getByText('3 février 2020')).toHaveAttribute('datetime', '2020-02-03T12:00:00Z')
  expect(screen.queryByText(/14 septembre 2026/)).not.toBeInTheDocument()
  expect(screen.getByText('Authenticator configuré')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Nouvelle adresse email' })).toHaveAttribute('autocomplete', 'email')
})

test('copie la valeur entière, annonce brièvement le succès et conserve le focus', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  clipboard({ writeText })
  await setup()
  vi.useFakeTimers()
  try {
    copyButton().focus()
    await act(async () => {
      fireEvent.click(copyButton())
      await Promise.resolve()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Identifiant MY. copié !')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(profile.public_id)
    expect(copyButton()).toHaveFocus()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(copyButton()).toBeEnabled()
    expect(copyButton()).toHaveFocus()
  } finally {
    vi.useRealTimers()
  }
})

test.each(['absent', 'refusé'])('la copie %s laisse le champ sélectionnable et explique le repli manuel', async mode => {
  clipboard(mode === 'absent' ? undefined : { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) })
  await setup()
  fireEvent.click(copyButton())
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copie automatique impossible'))
  expect(screen.getByText(/Copie automatique impossible/, { selector: 'p' })).toBeVisible()
  expect(screen.queryByText('Identifiant MY. copié !')).not.toBeInTheDocument()
  const field = screen.getByLabelText<HTMLInputElement>('MY.ID')
  field.focus()
  field.select()
  expect(field).toHaveFocus()
  expect(field.selectionStart).toBe(0)
  expect(field.selectionEnd).toBe(profile.public_id.length)
})

test('demande le changement via Auth et le callback existant, sans anticiper l’email courant', async () => {
  const { mock } = await setup()
  changeEmail()
  submit()
  expect(await screen.findByText(/Demande envoyée/)).toHaveAttribute('role', 'status')
  expect(mock.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ email: 'next@example.test' }, { emailRedirectTo: `${window.location.origin}/auth/confirm-email-change` })
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  expect(screen.queryByText('Adresse email modifiée')).not.toBeInTheDocument()
  expect(screen.queryByText('Changement en attente')).not.toBeInTheDocument()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
})

test('affiche une demande Auth déjà en attente sans inventer la confirmation manquante', async () => {
  await setup({ ...confirmedUser, new_email: 'pending@example.test' })
  const pending = screen.getByText('Changement en attente').closest('[role="status"]')!
  expect(pending).toHaveTextContent('Nouvelle adresse demandée : pending@example.test')
  expect(pending).toHaveTextContent('Elle n’est pas encore votre adresse actuelle')
  expect(pending).toHaveTextContent('l’ancienne et la nouvelle adresse')
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  expect(screen.queryByText('Adresse email modifiée')).not.toBeInTheDocument()
})

test('désactive le formulaire en cours et bloque une seconde soumission', async () => {
  const { mock } = await setup()
  let finish!: (value: Awaited<ReturnType<typeof mock.auth.updateUser>>) => void
  mock.auth.updateUser.mockReturnValue(new Promise(resolve => { finish = resolve }))
  changeEmail()
  submit()
  const field = screen.getByRole('textbox', { name: 'Nouvelle adresse email' })
  expect(field).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Un instant…' })).toBeDisabled()
  expect(field.closest('form')).toHaveAttribute('aria-busy', 'true')
  fireEvent.submit(field.closest('form')!)
  await waitFor(() => expect(mock.auth.updateUser).toHaveBeenCalledOnce())
  act(() => { finish({ data: { user: confirmedUser }, error: null }) })
  expect(await screen.findByText(/Demande envoyée/)).toBeVisible()
  expect(field).toBeEnabled()
})

test.each(['', 'adresse-invalide'])('la validation native refuse une adresse invalide : %s', async value => {
  const { mock } = await setup()
  changeEmail(value)
  submit()
  expect(screen.getByRole('textbox', { name: 'Nouvelle adresse email' })).toBeInvalid()
  expect(mock.auth.updateUser).not.toHaveBeenCalled()
})

test('refuse l’adresse courante sans casse et sans appel Auth', async () => {
  const { mock } = await setup()
  changeEmail(confirmedUser.email!.toUpperCase())
  submit()
  expect(screen.getByRole('alert')).toHaveTextContent('différente de votre adresse actuelle')
  expect(mock.auth.updateUser).not.toHaveBeenCalled()
})

test.each([
  ['email_exists', 'Cette adresse email ne peut pas être utilisée'],
  ['over_email_send_rate_limit', 'Trop de tentatives'],
  ['unknown', 'Impossible de terminer cette action'],
])('affiche une erreur %s propre puis permet de réessayer', async (code, message) => {
  const { mock } = await setup()
  mock.auth.updateUser.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('sensitive payload'), { code }) })
  changeEmail()
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByText(/sensitive payload/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Demande envoyée/)).not.toBeInTheDocument()
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Nouvelle adresse email' })).toBeEnabled()
  submit()
  expect(await screen.findByText(/Demande envoyée/)).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('reflète USER_UPDATED et n’adopte la nouvelle adresse qu’après finalisation Auth', async () => {
  const { mock } = await setup()
  const pending = { ...confirmedUser, new_email: 'next@example.test' }
  act(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user: pending }, error: null })
    mock.emit('USER_UPDATED', { ...session, user: pending })
  })
  await screen.findByText('Changement en attente')
  expect(screen.getByText(confirmedUser.email!)).toBeVisible()
  const finalized = { ...confirmedUser, email: pending.new_email, new_email: '' }
  act(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user: finalized }, error: null })
    mock.emit('USER_UPDATED', { ...session, user: finalized })
  })
  expect(await screen.findByText('next@example.test')).toBeVisible()
  expect(screen.queryByText(confirmedUser.email!)).not.toBeInTheDocument()
  expect(screen.queryByText('Changement en attente')).not.toBeInTheDocument()
})

test('gère les données absentes sans inventer de valeur ou d’action', () => {
  const store = createAuthStore(() => null, vi.fn(), () => null)
  render(<AuthContext value={store}><ProfilePage /></AuthContext>)
  expect(screen.getByText('Identifiant MY. indisponible.')).toBeVisible()
  expect(screen.getByText('Adresse email indisponible.')).toBeVisible()
  expect(screen.getByText('Date d’inscription indisponible.')).toBeVisible()
  expect(screen.getByText('Statut Authenticator indisponible.')).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('n’utilise pas la date du profil si la date Auth est invalide', async () => {
  await setup({ ...confirmedUser, created_at: 'invalid' })
  expect(screen.getByText('Date d’inscription indisponible.')).toBeVisible()
  expect(screen.queryByText(/14 septembre 2026/)).not.toBeInTheDocument()
})

test('ne présente pas un facteur non vérifié comme configuré', async () => {
  const { mock } = await setup()
  act(() => {
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: [{ ...confirmedUser.factors![0], status: 'unverified' }] } }, error: null })
    mock.emit('USER_UPDATED', session)
  })
  expect(await screen.findByText('Aucun Authenticator vérifié.')).toBeVisible()
  expect(screen.queryByText('Authenticator configuré')).not.toBeInTheDocument()
})

test('reste dans 4C : aucun Paramètres, mot de passe, TOTP automatique ni suppression', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { mock } = await setup()
  const page = screen.getByRole('region', { name: 'Profil' })
  expect(within(page).queryByRole('link')).not.toBeInTheDocument()
  expect(within(page).queryByLabelText(/mot de passe|code/i)).not.toBeInTheDocument()
  expect(within(page).queryByRole('button', { name: /modifier|supprimer|configurer/i })).not.toBeInTheDocument()
  changeEmail()
  submit()
  await screen.findByText(/Demande envoyée/)
  expect(mock.auth.updateUser.mock.calls.every(([attributes]) => !('password' in attributes))).toBe(true)
  expect(mock.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  expect(mock.mfa.enroll).not.toHaveBeenCalled()
  expect(mock.mfa.unenroll).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
