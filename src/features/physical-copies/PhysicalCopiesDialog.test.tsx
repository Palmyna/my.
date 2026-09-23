import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, PhysicalCopiesError, updatePhysicalCopyName, type PhysicalCopy } from '../../services/physical-copies'
import { PhysicalCopiesDialog } from './PhysicalCopiesDialog'
import { physicalCopiesKey } from './physical-copies-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionOverviewKey } from '../collections/collection-query'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(),
  listPhysicalCopies: vi.fn(), createPhysicalCopy: vi.fn(), updatePhysicalCopyName: vi.fn(), deletePhysicalCopy: vi.fn(),
}))
const list = vi.mocked(listPhysicalCopies), create = vi.mocked(createPhysicalCopy)
const update = vi.mocked(updatePhysicalCopyName), remove = vi.mocked(deletePhysicalCopy)
let rows: PhysicalCopy[]
const fixture = (id: string, name: string | null = null): PhysicalCopy => ({ id, name, created_at: '2026-09-23T00:00:00Z' })
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.user.id = 'owner'; auth.isAuthorized = true
  rows = [fixture('a'), fixture('b', 'Cadeau'), fixture('c')]
  list.mockReset().mockImplementation(() => Promise.resolve([...rows]))
  create.mockReset().mockImplementation((_variant, name) => { rows = [...rows, fixture(`new-${rows.length}`, name.trim() || null)]; return Promise.resolve() })
  update.mockReset().mockImplementation((id, name) => { rows = rows.map(row => row.id === id ? { ...row, name: name.trim() || null } : row); return Promise.resolve() })
  remove.mockReset().mockImplementation(id => { rows = rows.filter(row => row.id !== id); return Promise.resolve() })
})

function Harness({ ownerId = 'owner', variantId = 42 }: { ownerId?: string; variantId?: number }) {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Gérer les exemplaires</button>
    {open && <PhysicalCopiesDialog ownerId={ownerId} variantId={variantId} variantName="Pikachu · Holo" onClose={() => setOpen(false)} />}</>
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  const opener = screen.getByRole('button', { name: 'Gérer les exemplaires' })
  opener.focus(); fireEvent.click(opener)
  return { client, opener, ...view }
}
async function menu(label: string, action?: 'Éditer' | 'Supprimer') {
  const button = await screen.findByRole('button', { name: `Actions de ${label}` })
  button.focus(); fireEvent.click(button)
  if (action) fireEvent.click(screen.getByRole('button', { name: action }))
  return button
}
const submit = () => fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
const editName = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } })
async function add() { fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un exemplaire' })) }

test('listing, custom name priority, native modal and initial focus', async () => {
  setup()
  const dialog = screen.getByRole('dialog', { name: 'Exemplaires physiques' })
  expect(dialog).toHaveAttribute('open')
  expect(dialog).toHaveAccessibleDescription('Pikachu · Holo')
  expect(screen.getByRole('heading')).toHaveFocus()
  expect(await screen.findByText('Exemplaire 1')).toBeVisible()
  expect(screen.getByText('Cadeau')).toBeVisible()
  expect(screen.getByText('Exemplaire 3')).toBeVisible()
  expect(screen.queryByText('Exemplaire 2')).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledExactlyOnceWith('owner', 42)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('add creates one unnamed copy, returns to refreshed list, requires another click', async () => {
  const { client } = setup()
  client.setQueryData(dashboardCollectionsKey('owner'), { cached: true })
  client.setQueryData(collectionOverviewKey('owner', 'collection-one'), { cached: true })
  client.setQueryData(collectionOverviewKey('owner', 'collection-two'), { cached: true })
  await screen.findByText('Cadeau')
  await add()
  expect(screen.getByRole('textbox')).toHaveFocus()
  expect(create).not.toHaveBeenCalled()
  submit()
  await screen.findByText('Exemplaire 4')
  expect(create).toHaveBeenCalledExactlyOnceWith(42, '')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toHaveFocus()
  expect(client.getQueryState(dashboardCollectionsKey('owner'))?.isInvalidated).toBe(true)
  for (const id of ['collection-one', 'collection-two']) expect(client.getQueryState(collectionOverviewKey('owner', id))?.isInvalidated).toBe(true)
  expect(list).toHaveBeenCalledTimes(2)
  await add(); editName('Mon deuxième ajout'); submit()
  await screen.findByText('Mon deuxième ajout')
  expect(create).toHaveBeenCalledTimes(2)
})

test('pending blocks double submit, dismiss and Escape until listing is refreshed', async () => {
  let resolveWrite!: () => void
  create.mockImplementation(() => new Promise<void>(resolve => { resolveWrite = () => { rows.push(fixture('d')); resolve() } }))
  const { client } = setup()
  await screen.findByText('Cadeau'); await add()
  submit(); submit()
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('heading')).toHaveFocus()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: 'Ajouter un exemplaire' })).toBeVisible()
  let resolveList!: (value: PhysicalCopy[]) => void
  list.mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve }))
  await act(() => { resolveWrite(); return Promise.resolve() })
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Créer l’exemplaire' })).toBeDisabled()
  submit(); expect(create).toHaveBeenCalledTimes(1)
  await act(() => { resolveList([...rows]); return Promise.resolve() })
  await screen.findByText('Exemplaire 4')
  expect(client.getQueryData(physicalCopiesKey('owner', 'owner', 42))).toHaveLength(4)
})

test('edit then clear name restores dynamic fallback', async () => {
  setup(); await menu('Cadeau', 'Éditer')
  expect(screen.getByRole('textbox')).toHaveValue('Cadeau')
  editName('Nouvelle étiquette'); submit()
  await screen.findByText('Nouvelle étiquette')
  expect(update).toHaveBeenLastCalledWith('b', 'Nouvelle étiquette')
  expect(screen.getByRole('button', { name: 'Actions de Nouvelle étiquette' })).toHaveFocus()
  await menu('Nouvelle étiquette', 'Éditer'); editName(''); submit()
  await screen.findByText('Exemplaire 2')
  expect(update).toHaveBeenLastCalledWith('b', '')
})

test('deletion requires confirmation, supports cancellation, and renumbers remaining copies', async () => {
  setup(); await menu('Exemplaire 1', 'Supprimer')
  expect(remove).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
  expect(screen.getByText(/Les variantes de vos collections seront conservées/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.getByText('Exemplaire 1')).toBeVisible()
  expect(remove).not.toHaveBeenCalled()
  await menu('Exemplaire 1', 'Supprimer'); submit()
  await waitFor(() => expect(screen.queryByText('Exemplaire 3')).not.toBeInTheDocument())
  expect(await screen.findByText('Exemplaire 2')).toBeVisible()
  expect(screen.getByText('Cadeau')).toBeVisible()
  expect(remove).toHaveBeenCalledExactlyOnceWith('a')
  expect(rows.map(row => row.id)).toEqual(['b', 'c'])
})

test('delete final copy returns empty list without automatic recreation', async () => {
  rows = [fixture('a')]
  setup(); await menu('Exemplaire 1', 'Supprimer'); submit()
  expect(await screen.findByText('Aucun exemplaire.')).toBeVisible()
  expect(create).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toBeEnabled()
})

test('recipient can read owner copies but has no write controls', async () => {
  auth.user.id = 'recipient'
  const { client } = setup()
  await screen.findByText('Cadeau')
  expect(screen.getByText('Lecture seule')).toBeVisible()
  expect(within(screen.getByRole('dialog')).getAllByRole('button')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Ajouter un exemplaire' })).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledExactlyOnceWith('owner', 42)
  expect(client.getQueryData(physicalCopiesKey('recipient', 'owner', 42))).toHaveLength(3)
  expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

test('menu keyboard, outside close, Tab wrap, Escape and focus restoration', async () => {
  const { opener } = setup()
  let button = await menu('Cadeau')
  expect(screen.getByRole('button', { name: 'Éditer' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(button).toHaveFocus(); expect(button).toHaveAttribute('aria-expanded', 'false')
  button = await menu('Cadeau'); fireEvent.pointerDown(screen.getByRole('heading'))
  expect(button).toHaveFocus(); expect(button).toHaveAttribute('aria-expanded', 'false')
  const addButton = screen.getByRole('button', { name: 'Ajouter un exemplaire' })
  addButton.focus(); fireEvent.keyDown(addButton, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Actions de Exemplaire 1' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true }); expect(addButton).toHaveFocus()
  await add()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(addButton.isConnected).toBe(false) // old listing node is replaced
  expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toHaveFocus()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
})

test('safe mutation error, focus and refresh on Escape back to listing', async () => {
  create.mockRejectedValueOnce(new Error('PostgreSQL secret raw error'))
  setup(); await screen.findByText('Cadeau'); await add(); submit()
  const error = await screen.findByRole('alert')
  expect(error).toHaveFocus()
  expect(error).toHaveTextContent('L’opération n’a pas pu être confirmée')
  expect(screen.queryByText(/PostgreSQL/)).not.toBeInTheDocument()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(create).toHaveBeenCalledTimes(1)
})

test('failed refetch hides stale private rows, including revoked shares', async () => {
  const { client } = setup(); await screen.findByText('Cadeau')
  list.mockRejectedValue(new PhysicalCopiesError('not_authorized'))
  await act(async () => { await client.invalidateQueries({ queryKey: physicalCopiesKey('owner', 'owner', 42) }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger')
  expect(screen.queryByText('Cadeau')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toBeDisabled()
})

test('failed refresh after confirmed create closes form and prevents accidental duplicate', async () => {
  setup(); await screen.findByText('Cadeau'); await add()
  list.mockRejectedValueOnce(new Error('read failed'))
  submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(create).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(await screen.findByText('Exemplaire 4')).toBeVisible()
  expect(create).toHaveBeenCalledTimes(1)
})

test('unauthorized session does not open or read private copies', () => {
  auth.isAuthorized = false
  setup()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(list).not.toHaveBeenCalled()
})
