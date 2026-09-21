import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { CollectionsError, createFree, listDashboardCollections } from '../../services/collections'
import type { DashboardCollection } from '../../types/collections'
import { DashboardPage } from './DashboardPage'
import { dashboardCollectionsKey } from './dashboard-query'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true, passwordChanged: false }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/collections')>(),
  createFree: vi.fn(), listDashboardCollections: vi.fn(),
}))
const create = vi.mocked(createFree)
const load = vi.mocked(listDashboardCollections)
const collection: DashboardCollection = { collectionId: 'server-id', name: 'Nom relu du serveur', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 0 }

beforeAll(() => {
  // jsdom: native modal/inert behavior is checked separately in the browser.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.user = { id: 'owner' }
  create.mockReset().mockResolvedValue({ collectionId: 'server-id' })
  load.mockReset().mockResolvedValue([])
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}
function open() {
  const trigger = screen.getByRole('button', { name: 'Créer une collection personnalisée' })
  trigger.focus(); fireEvent.click(trigger)
  return trigger
}
const nameInput = () => screen.getByRole('textbox', { name: 'Nom de la collection' })
const name = (value: string) => fireEvent.change(nameInput(), { target: { value } })
const submit = () => fireEvent.submit(nameInput().closest('form')!)

test.each([{ entries: [] }, { entries: [collection] }])('CTA unique avec ou sans collection et formulaire personnalisé accessible : $entries', async ({ entries }) => {
  load.mockResolvedValue(entries)
  setup()
  await waitFor(() => expect(screen.queryByText('Chargement des collections…')).not.toBeInTheDocument())
  expect(screen.getAllByRole('button', { name: 'Créer une collection personnalisée' })).toHaveLength(1)
  open()
  const modal = screen.getByRole('dialog', { name: 'Collection personnalisée' })
  expect(modal).toHaveAttribute('open')
  expect(modal).toHaveAccessibleDescription('Créez une collection personnalisée et ajoutez-y les cartes de votre choix.')
  expect(nameInput()).toHaveFocus()
  expect(within(modal).queryByText(/automatique|bientôt/i)).not.toBeInTheDocument()
})

test('boucle clavier, Annuler et Échap restituent le focus et réinitialisent le formulaire', () => {
  setup()
  const trigger = open()
  name('Brouillon')
  fireEvent.keyDown(nameInput(), { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: 'Créer la collection' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
  expect(nameInput()).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  open()
  expect(nameInput()).toHaveValue('')
  submit()
  expect(screen.getByRole('alert')).toBeVisible()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(trigger).toHaveFocus()
  open()
  expect(nameInput()).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled()
})

test.each(['', '   ', ' ab ', '😀😀'])('validation locale %j sans mutation ni modification du champ', value => {
  setup(); open(); name(value); submit()
  expect(nameInput()).toHaveValue(value)
  expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
  expect(nameInput()).toHaveFocus()
  expect(nameInput()).toHaveAccessibleDescription(/au moins 3 caractères/i)
  expect(screen.getByRole('alert')).toBeVisible()
  expect(create).not.toHaveBeenCalled()
})

test('pending empêche double soumission et fermeture ; succès ferme puis refetch exact sans tuile fabriquée', async () => {
  let finish!: (result: { collectionId: string }) => void
  let finishRead!: (result: DashboardCollection[]) => void
  create.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { client } = setup()
  await screen.findByText('Vous n’avez pas encore de collection.')
  client.setQueryData(dashboardCollectionsKey('other-owner'), ['untouched'])
  client.setQueryData(['unrelated'], ['untouched'])
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const trigger = open()
  name(' \tMa collection 😀  '); submit(); submit()
  await waitFor(() => expect(create).toHaveBeenCalledOnce())
  expect(create.mock.calls[0]?.[0]).toEqual({ name: ' \tMa collection 😀  ' })
  expect(nameInput()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Création en cours')
  expect(screen.getByRole('heading', { name: 'Collection personnalisée' })).toHaveFocus()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  load.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve }))
  await act(async () => { finish({ collectionId: 'server-id' }); await Promise.resolve() })
  expect(await screen.findByText('Collection créée.')).toHaveAttribute('role', 'status')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: dashboardCollectionsKey('owner'), exact: true })
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(client.getQueryState(dashboardCollectionsKey('other-owner'))?.isInvalidated).toBe(false)
  expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false)
  await act(async () => { finishRead([collection]); await Promise.resolve() })
  expect(await screen.findByRole('article', { name: 'Nom relu du serveur' })).toBeVisible()
  open()
  expect(nameInput()).toHaveValue('')
  expect(screen.queryByText('Collection créée.')).not.toBeInTheDocument()
})

test.each([
  ['invalid_name', /au moins 3 caractères/i],
  ['not_authorized', /Reconnectez-vous/],
  ['unexpected', /Vérifiez vos collections/],
] as const)('erreur %s maintient le dialog et propose un message sûr', async (code, message) => {
  create.mockRejectedValue(new CollectionsError(code))
  const { client } = setup()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  open(); name('Nom intact'); submit()
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent(message)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(nameInput()).toHaveValue('Nom intact')
  expect(screen.queryByText(code)).not.toBeInTheDocument()
  expect(invalidate).not.toHaveBeenCalled()
  if (code === 'invalid_name') {
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).toHaveFocus()
  } else expect(error).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Créer la collection' })).toBeEnabled()
  expect(create).toHaveBeenCalledOnce()
})

test('ne montre jamais une erreur brute et permet de corriger puis soumettre', async () => {
  create.mockRejectedValueOnce(new Error('PostgREST secret payload')).mockResolvedValueOnce({ collectionId: 'server-id' })
  setup(); open(); name('Mon nom'); submit()
  await screen.findByRole('alert')
  expect(screen.queryByText(/PostgREST|secret payload/)).not.toBeInTheDocument()
  name('Autre nom'); submit()
  expect(await screen.findByText('Collection créée.')).toBeVisible()
  expect(create).toHaveBeenCalledTimes(2)
})

test('un changement de compte ferme le formulaire et ne transfère pas son brouillon', () => {
  const { rerender } = setup()
  open(); name('Ancien compte')
  auth.user = { id: 'other-owner' }; rerender()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  open()
  expect(nameInput()).toHaveValue('')
})
