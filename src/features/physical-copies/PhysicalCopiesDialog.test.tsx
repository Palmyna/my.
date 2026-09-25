import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, PhysicalCopiesError, updatePhysicalCopy, type PhysicalCopy } from '../../services/physical-copies'
import { PhysicalCopiesDialog } from './PhysicalCopiesDialog'
import { physicalCopiesKey } from './physical-copies-query'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from '../collections/collection-query'

const auth = vi.hoisted(() => ({ user: { id: 'owner' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(),
  listPhysicalCopies: vi.fn(), createPhysicalCopy: vi.fn(), updatePhysicalCopy: vi.fn(), deletePhysicalCopy: vi.fn(),
}))
const list = vi.mocked(listPhysicalCopies), create = vi.mocked(createPhysicalCopy)
const update = vi.mocked(updatePhysicalCopy), remove = vi.mocked(deletePhysicalCopy)
let rows: PhysicalCopy[]
const fixture = (id: string, name: string | null = null, note: string | null = null): PhysicalCopy => ({ id, name, note, created_at: '2026-09-23T00:00:00Z' })
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.user.id = 'owner'; auth.isAuthorized = true
  rows = [fixture('a'), fixture('b', 'Cadeau'), fixture('c')]
  list.mockReset().mockImplementation(() => Promise.resolve([...rows]))
  create.mockReset().mockImplementation((_variant, name, note = '') => { rows = [...rows, fixture(`new-${rows.length}`, name.trim() || null, note.trim() ? note : null)]; return Promise.resolve() })
  update.mockReset().mockImplementation((id, name, note) => { rows = rows.map(row => row.id === id ? { ...row, name: name.trim() || null, note: note.trim() ? note : null } : row); return Promise.resolve() })
  remove.mockReset().mockImplementation(id => { rows = rows.filter(row => row.id !== id); return Promise.resolve() })
})

function Harness({ ownerId = 'owner', variantId = 42 }: { ownerId?: string; variantId?: string | number }) {
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
const editName = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Nom personnalisé (facultatif)' }), { target: { value } })
async function add() { fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un exemplaire' })) }

const noteField = () => screen.getByRole('textbox', { name: 'État / note (facultatif)' })
const noteButton = (label: string, open = false) => screen.getByRole('button', { name: `${open ? 'Masquer' : 'Afficher'} l’état / note de ${label}` })

test('optional creation textarea counts and saves exact multiline text, then resets for next creation', async () => {
  setup(); await screen.findByText('Cadeau'); await add()
  const textarea = noteField()
  expect(textarea.tagName).toBe('TEXTAREA')
  expect(textarea).not.toBeRequired()
  expect(textarea).toHaveAccessibleDescription('0 / 750')
  const note = '  Recto intact\n\nVerso : rayure  \n'
  fireEvent.change(textarea, { target: { value: note } })
  expect(textarea).toHaveAccessibleDescription(`${note.length} / 750`)
  submit()
  await screen.findByText('Exemplaire 4')
  expect(create).toHaveBeenCalledExactlyOnceWith('42', '', note)
  fireEvent.click(noteButton('Exemplaire 4'))
  const content = document.getElementById(noteButton('Exemplaire 4', true).getAttribute('aria-controls')!)!
  expect(content.textContent).toBe(note)
  expect(getComputedStyle(content).whiteSpace).toBe('pre-wrap')
  await add()
  expect(noteField()).toHaveValue('')
})

test('textarea accepts 750 Unicode characters and refuses 751 without truncation', async () => {
  setup(); await screen.findByText('Cadeau'); await add()
  const textarea = noteField()
  for (const character of ['x', '📝']) {
    fireEvent.change(textarea, { target: { value: character.repeat(750) } })
    expect(textarea).toHaveValue(character.repeat(750))
    expect(textarea).toHaveAccessibleDescription('750 / 750')
    fireEvent.change(textarea, { target: { value: character.repeat(751) } })
    expect(textarea).toHaveValue(character.repeat(750))
  }
})

test('inline note is absent without text; disclosure is distinct from actions and keeps focus', async () => {
  rows = [fixture('a'), fixture('b', 'Cadeau', 'Recto\nVerso'), fixture('c', null, ' \n ')]
  setup(); await screen.findByText('Cadeau')
  expect(screen.queryAllByRole('button', { name: /Afficher l’état/ })).toHaveLength(1)
  const trigger = noteButton('Cadeau')
  expect(trigger).toHaveAttribute('type', 'button')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Recto Verso')).not.toBeInTheDocument()
  trigger.focus(); fireEvent.click(trigger) // Native button activation also handles Enter/Space.
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const content = document.getElementById(trigger.getAttribute('aria-controls')!)!
  expect(content).toBeVisible()
  expect(content.closest('li')).toBe(trigger.closest('li'))
  expect(content.textContent).toBe('Recto\nVerso')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(trigger)
  expect(content).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('recipient can expand and collapse notes without edit or delete actions', async () => {
  auth.user.id = 'recipient'; rows = [fixture('a', null, 'Note privée partagée')]
  setup(); await screen.findByText('Exemplaire 1')
  fireEvent.click(noteButton('Exemplaire 1'))
  expect(screen.getByText('Note privée partagée')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Actions de/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ajouter un exemplaire' })).not.toBeInTheDocument()
  fireEvent.click(noteButton('Exemplaire 1', true))
  expect(screen.queryByText('Note privée partagée')).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

test('editing refreshes note, clearing removes disclosure, deleting removes expanded content', async () => {
  rows = [fixture('a', null, 'Ancienne note'), fixture('b', null, 'Autre note')]
  setup(); await screen.findByText('Exemplaire 1')
  fireEvent.click(noteButton('Exemplaire 1'))
  await menu('Exemplaire 1', 'Éditer')
  expect(noteField()).toHaveValue('Ancienne note')
  fireEvent.change(noteField(), { target: { value: ' Nouvelle\nnote ' } }); submit()
  await screen.findByText('Exemplaire 1')
  expect(update).toHaveBeenLastCalledWith('a', '', ' Nouvelle\nnote ')
  expect(noteButton('Exemplaire 1')).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(noteButton('Exemplaire 1'))
  expect(document.getElementById(noteButton('Exemplaire 1', true).getAttribute('aria-controls')!)?.textContent).toBe(' Nouvelle\nnote ')
  await menu('Exemplaire 1', 'Éditer')
  fireEvent.change(noteField(), { target: { value: ' \n ' } }); submit()
  await screen.findByText('Exemplaire 1')
  expect(screen.queryByRole('button', { name: /l’état \/ note de Exemplaire 1/ })).not.toBeInTheDocument()
  fireEvent.click(noteButton('Exemplaire 2'))
  await menu('Exemplaire 2', 'Supprimer'); submit()
  await waitFor(() => expect(screen.queryByText('Exemplaire 2')).not.toBeInTheDocument())
  expect(screen.queryByText('Autre note')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /l’état \/ note/ })).not.toBeInTheDocument()
})

test('Tab trap includes textarea and note disclosure', async () => {
  rows = [fixture('a', null, 'Note')]
  setup(); await screen.findByText('Exemplaire 1')
  const addButton = screen.getByRole('button', { name: 'Ajouter un exemplaire' })
  addButton.focus(); fireEvent.keyDown(addButton, { key: 'Tab' })
  expect(noteButton('Exemplaire 1')).toHaveFocus()
  await add()
  noteField().focus()
  // From a recognized middle control, allow native navigation; do not wrap to input.
  expect(fireEvent.keyDown(noteField(), { key: 'Tab' })).toBe(true)
  expect(noteField()).toHaveFocus()
  expect(fireEvent.keyDown(noteField(), { key: 'Tab', shiftKey: true })).toBe(true)
})

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
  expect(list).toHaveBeenCalledExactlyOnceWith('owner', '42')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('add creates one unnamed copy, returns to refreshed list, requires another click', async () => {
  const { client } = setup()
  client.setQueryData(dashboardCollectionsKey('owner'), { cached: true })
  client.setQueryData(collectionOverviewKey('owner', 'collection-one'), { cached: true })
  client.setQueryData(collectionOverviewKey('owner', 'collection-two'), { cached: true })
  await screen.findByText('Cadeau')
  await add()
  expect(screen.getByRole('textbox', { name: 'Nom personnalisé (facultatif)' })).toHaveFocus()
  expect(create).not.toHaveBeenCalled()
  submit()
  await screen.findByText('Exemplaire 4')
  expect(create).toHaveBeenCalledExactlyOnceWith('42', '', '')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toHaveFocus()
  expect(client.getQueryState(dashboardCollectionsKey('owner'))?.isInvalidated).toBe(true)
  for (const id of ['collection-one', 'collection-two']) expect(client.getQueryState(collectionOverviewKey('owner', id))?.isInvalidated).toBe(true)
  expect(list).toHaveBeenCalledTimes(2)
  await add(); editName('Mon deuxième ajout'); submit()
  await screen.findByText('Mon deuxième ajout')
  expect(create).toHaveBeenCalledTimes(2)
})

test.each(['create', 'delete', 'edit'] as const)('%s refreshes content possession only when it can change', async action => {
  const { client } = setup()
  const content = [{ collectionItemId: 'item', variantId: '42', origin: 'manual', cardNameFr: null,
    localId: null, setNameFr: null, imageUrl: null, variantLabel: null, owned: true }]
  const affected = collectionContentKey('owner', 'collection')
  client.setQueryData(affected, content)
  const untouched = [collectionContentKey('other-user', 'collection'), collectionItemOrderKey('owner', 'collection')]
  for (const key of untouched) client.setQueryData(key, content)
  const differentVariant = collectionContentKey('owner', 'different-variant')
  client.setQueryData(differentVariant, [{ ...content[0], variantId: '43' }])
  await screen.findByText('Cadeau')
  if (action === 'create') await add()
  else await menu('Cadeau', action === 'edit' ? 'Éditer' : 'Supprimer')
  submit()
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un exemplaire' })).toBeVisible())
  expect(client.getQueryState(affected)?.isInvalidated).toBe(action !== 'edit')
  for (const key of [...untouched, differentVariant]) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  expect(client.getQueryData(affected)).toEqual(content)
})

test('pending blocks double submit, dismiss and Escape until listing is refreshed', async () => {
  let resolveWrite!: () => void
  create.mockImplementation(() => new Promise<void>(resolve => { resolveWrite = () => { rows.push(fixture('d')); resolve() } }))
  const { client } = setup()
  await screen.findByText('Cadeau'); await add()
  submit(); submit()
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: 'Nom personnalisé (facultatif)' })).toBeDisabled()
  expect(noteField()).toBeDisabled()
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
  expect(screen.getByRole('textbox', { name: 'Nom personnalisé (facultatif)' })).toHaveValue('Cadeau')
  editName('Nouvelle étiquette'); submit()
  await screen.findByText('Nouvelle étiquette')
  expect(update).toHaveBeenLastCalledWith('b', 'Nouvelle étiquette', '')
  expect(screen.getByRole('button', { name: 'Actions de Nouvelle étiquette' })).toHaveFocus()
  await menu('Nouvelle étiquette', 'Éditer'); editName(''); submit()
  await screen.findByText('Exemplaire 2')
  expect(update).toHaveBeenLastCalledWith('b', '', '')
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
  expect(list).toHaveBeenCalledExactlyOnceWith('owner', '42')
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
