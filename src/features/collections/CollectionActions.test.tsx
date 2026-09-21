import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CollectionsError, deleteCollection, getCollectionOverview, listDashboardCollections, renameCollection } from '../../services/collections'
import type { DashboardCollection, CollectionMutationResult } from '../../types/collections'
import { DashboardPage } from '../dashboard/DashboardPage'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { CollectionPage } from './CollectionPage'
import { collectionOverviewKey } from './collection-query'

vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' }, isAuthorized: true }) }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(),
  renameCollection: vi.fn(), deleteCollection: vi.fn(), getCollectionOverview: vi.fn(), listDashboardCollections: vi.fn(),
}))
const rename = vi.mocked(renameCollection), remove = vi.mocked(deleteCollection), get = vi.mocked(getCollectionOverview)
const id = 'c1200000-0000-0000-0000-000000000001'
const base: DashboardCollection = { collectionId: id, name: 'Mes favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 0 }
let row: DashboardCollection | null
const detail = collectionOverviewKey('owner', id), dashboard = dashboardCollectionsKey('owner')
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  row = { ...base }
  get.mockReset().mockImplementation(() => row ? Promise.resolve(row) : Promise.reject(new CollectionsError('collection_unavailable')))
  vi.mocked(listDashboardCollections).mockReset().mockImplementation(() => Promise.resolve(row ? [row] : []))
  rename.mockReset().mockImplementation((_id, name) => { row = { ...row!, name }; return Promise.resolve({ collectionId: id }) })
  remove.mockReset().mockImplementation(() => { row = null; return Promise.resolve({ collectionId: id }) })
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  client.setQueryData(dashboard, [base])
  client.setQueryData(collectionOverviewKey('someone-else', id), base)
  client.setQueryData(dashboardCollectionsKey('someone-else'), [base])
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/collections/${id}`]}><Routes>
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
    <Route path="/dashboard" element={<><DashboardPage /><Link to={`/collections/${id}`}>Revisiter l’ancienne URL</Link></>} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return { client, unmount: view.unmount }
}
async function open(action?: 'rename' | 'delete') {
  const trigger = await screen.findByRole('button', { name: 'Actions de la collection' })
  trigger.focus(); fireEvent.click(trigger)
  if (action) fireEvent.click(screen.getByRole('button', { name: action === 'rename' ? 'Renommer' : 'Supprimer la collection' }))
  return trigger
}
const changeName = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Nom de la collection' }), { target: { value } })
const submit = () => fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)

test('menu propriétaire compact : ouverture, focus, Échap, extérieur et absence de Partager', async () => {
  setup(); const trigger = await open()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Renommer' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Supprimer la collection' })).toBeVisible()
  expect(screen.queryByText('Partager')).not.toBeInTheDocument()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(trigger); fireEvent.pointerDown(document.body)
  expect(trigger).toHaveFocus(); expect(screen.queryByRole('group')).not.toBeInTheDocument()
  fireEvent.click(trigger); screen.getByRole('link', { name: 'Retour au Dashboard' }).focus()
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
})

test('shared reste sans action propriétaire', async () => {
  row = { ...base, access: 'shared' }; setup()
  await screen.findByText('Partagée · Lecture seule')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test.each(['rename', 'delete'] as const)('dialog %s : ouverture, focus, tabulation, annulation et Échap', async action => {
  setup(); const trigger = await open(action)
  const modal = screen.getByRole('dialog')
  expect(modal).toHaveAccessibleName(action === 'rename' ? 'Renommer la collection' : 'Supprimer la collection')
  const first = action === 'rename' ? screen.getByRole('textbox') : screen.getByRole('button', { name: 'Annuler' })
  expect(first).toHaveFocus()
  if (action === 'rename') expect(first).toHaveValue(base.name)
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  const last = screen.getByRole('button', { name: action === 'rename' ? 'Enregistrer' : 'Supprimer la collection' })
  expect(last).toHaveFocus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(trigger).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await open(action); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(trigger).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(rename).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

test.each(['', '   ', ' ab '])('renommage invalide %j sans mutation', async name => {
  setup(); await open('rename'); changeName(name); submit()
  expect(screen.getByRole('alert')).toHaveTextContent('au moins 3 caractères')
  expect(screen.getByRole('textbox')).toHaveFocus(); expect(rename).not.toHaveBeenCalled()
})

test.each(['free', 'pokemon', 'set'] as const)('renommage %s confirmé, caches exacts, titre et Dashboard', async kind => {
  if (kind !== 'free') row = { ...base, collectionType: 'automatic', targetType: kind, targetName: 'Cible' }
  const { client } = setup(); const trigger = await open('rename')
  const newName = '  Mes nouvelles cartes  '
  changeName(newName); submit()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(rename).toHaveBeenCalledExactlyOnceWith(id, newName)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(newName.trim())
  expect(document.title).toBe(`${newName.trim()} — MY.`)
  expect(trigger).toHaveFocus()
  expect(client.getQueryData<DashboardCollection>(detail)?.name).toBe(newName)
  expect(client.getQueryData<DashboardCollection[]>(dashboard)?.[0]?.name).toBe(newName)
  expect(client.getQueryState(dashboard)?.isInvalidated).toBe(true)
  expect(client.getQueryState(dashboardCollectionsKey('someone-else'))?.isInvalidated).toBe(false)
  expect(client.getQueryData(collectionOverviewKey('someone-else', id))).toEqual(base)
  fireEvent.click(screen.getByRole('link', { name: 'Retour au Dashboard' }))
  expect(await screen.findByRole('link', { name: newName.trim() })).toBeVisible()
})

test.each(['rename', 'delete'] as const)('%s pending : contrôles verrouillés, Échap ignoré, un seul envoi', async action => {
  let finish!: (value: CollectionMutationResult) => void
  const mock = action === 'rename' ? rename : remove
  mock.mockReturnValue(new Promise(resolve => { finish = resolve }))
  setup(); await open(action); if (action === 'rename') changeName('Nouveau nom')
  submit(); submit()
  await screen.findByRole('status')
  const modal = screen.getByRole('dialog')
  for (const button of within(modal).getAllByRole('button')) expect(button).toBeDisabled()
  expect(within(modal).getByRole('heading')).toHaveFocus()
  fireEvent(modal, new Event('cancel', { cancelable: true })); expect(modal).toBeVisible()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); expect(within(modal).getByRole('heading')).toHaveFocus()
  expect(mock).toHaveBeenCalledOnce()
  await act(async () => { finish({ collectionId: id }); await Promise.resolve() })
})

test('invalid_name serveur près du champ, sans détails bruts', async () => {
  rename.mockRejectedValue(new CollectionsError('invalid_name'))
  setup(); await open('rename'); changeName('Nom valide'); submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('au moins 3 caractères')
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByText('invalid_name')).not.toBeInTheDocument()
})

test.each(['rename', 'delete'] as const)('%s indisponible : fermeture, cache retiré, état sûr et focus', async action => {
  (action === 'rename' ? rename : remove).mockRejectedValue(new CollectionsError('collection_unavailable'))
  const { client } = setup(); await open(action); submit()
  const heading = await screen.findByRole('heading', { name: 'Collection indisponible' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(heading).toHaveFocus()
  expect(screen.getByRole('alert')).toHaveTextContent('Cette collection n’existe pas ou vous n’y avez plus accès.')
  expect(client.getQueryData(detail)).toBeUndefined()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test.each([
  ['rename', 'not_authorized'], ['rename', 'unexpected'], ['delete', 'not_authorized'], ['delete', 'unexpected'],
] as const)('%s erreur %s assainie sans retry automatique', async (action, code) => {
  const mock = action === 'rename' ? rename : remove
  mock.mockRejectedValue(code === 'unexpected' ? new Error('Supabase private payload') : new CollectionsError(code))
  setup(); await open(action); submit()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(code === 'not_authorized' ? 'Votre session ou vos droits' : action === 'rename' ? 'Le renommage n’a pas pu être confirmé' : 'La suppression n’a pas pu être confirmée. Vérifiez vos collections avant de réessayer.')
  expect(screen.queryByText(/Supabase|private payload|not_authorized/)).not.toBeInTheDocument()
  expect(mock).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled()
})

test('suppression confirmée : conséquences, cache supprimé, Dashboard relu, ancienne URL indisponible', async () => {
  const { client } = setup(); await open('delete')
  const modal = screen.getByRole('dialog')
  expect(modal).toHaveAccessibleDescription(/collection, ses éléments et ses partages seront supprimés/)
  expect(modal).toHaveAccessibleDescription(/destinataires perdront leur accès/)
  expect(modal).toHaveAccessibleDescription(/exemplaires physiques du propriétaire seront conservés/)
  submit()
  await screen.findByRole('heading', { name: 'Dashboard' })
  expect(remove).toHaveBeenCalledExactlyOnceWith(id)
  expect(client.getQueryData(detail)).toBeUndefined()
  expect(client.getQueryData(collectionOverviewKey('someone-else', id))).toEqual(base)
  await screen.findByText('Vous n’avez pas encore de collection.')
  expect(vi.mocked(listDashboardCollections)).toHaveBeenCalled()
  // A direct return performs the existing server read, with no client tombstone.
  fireEvent.click(screen.getByRole('link', { name: 'Revisiter l’ancienne URL' }))
  expect(await screen.findByRole('heading', { name: 'Collection indisponible' })).toBeVisible()
})

test('une réponse tardive après démontage ne recrée pas le cache de la session quittée', async () => {
  let finish!: (value: CollectionMutationResult) => void
  rename.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { client, unmount } = setup(); await open('rename'); changeName('Nouveau nom'); submit()
  unmount(); client.clear()
  await act(async () => { finish({ collectionId: id }); await Promise.resolve() })
  expect(client.getQueryData(detail)).toBeUndefined(); expect(client.getQueryData(dashboard)).toBeUndefined()
})

test('une collection supprimée disparaît du cache Dashboard même si sa relecture reste en attente', async () => {
  vi.mocked(listDashboardCollections).mockReturnValue(new Promise(() => {}))
  const { client } = setup(); await open('delete'); submit()
  await screen.findByRole('heading', { name: 'Dashboard' })
  expect(client.getQueryData(detail)).toBeUndefined()
  expect(client.getQueryData(dashboard)).toEqual([])
  expect(screen.queryByRole('link', { name: base.name })).not.toBeInTheDocument()
})
