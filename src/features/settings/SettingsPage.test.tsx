import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getUserPreferences, saveUserPreferences, getCollectionViewOverride, saveCollectionViewOverride, deleteCollectionViewOverride } from '../../services/view-preferences'
import type { UserPreferences } from '../../types/view-preferences'
import { binderFormatKey, useBinderFormat } from '../collections/useBinderFormat'
import { useCollectionView } from '../collections/useCollectionView'
import { userPreferencesKey } from '../view-preferences/view-preferences-query'
import { SettingsPage } from './SettingsPage'

const auth = vi.hoisted<{ user: { id: string } | null; isAuthorized: boolean }>(() => ({ user: { id: 'viewer' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), saveUserPreferences: vi.fn(),
  getCollectionViewOverride: vi.fn(), saveCollectionViewOverride: vi.fn(), deleteCollectionViewOverride: vi.fn() }))
const read = vi.mocked(getUserPreferences), save = vi.mocked(saveUserPreferences)
const initial: UserPreferences = { ...DEFAULT_USER_PREFERENCES, catalogDefaultView: 'cards', collectionDefaultView: 'binder',
  lastCatalogView: 'list', lastCollectionView: 'cards', binderDefaultFormat: '2x2' }

beforeEach(() => {
  auth.user = { id: 'viewer' }; auth.isAuthorized = true
  read.mockReset().mockResolvedValue(initial)
  save.mockReset().mockImplementation((_id, patch) => Promise.resolve({ ...initial, ...patch }))
  vi.mocked(getCollectionViewOverride).mockReset().mockResolvedValue(null)
  vi.mocked(saveCollectionViewOverride).mockReset()
  vi.mocked(deleteCollectionViewOverride).mockReset()
})
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const tree = () => <QueryClientProvider client={client}><SettingsPage /></QueryClientProvider>
  return { client, tree, ...render(tree()) }
}
const group = (name: string) => screen.getByRole('group', { name })
const radio = (groupName: string, name: string) => within(group(groupName)).getByRole('radio', { name })
const catalog = 'Vue catalogue par défaut', collection = 'Vue collection par défaut', binder = 'Format Classeur par défaut'
async function ready() { await waitFor(() => expect(radio(catalog, 'Cartes')).toBeChecked()) }

test('loading retains three labelled groups, disables every choice and never selects fictitious defaults', async () => {
  const pending = deferred<UserPreferences>(); read.mockReturnValue(pending.promise)
  const { client } = setup()
  expect(screen.getByRole('region', { name: 'Affichage' })).toBeVisible()
  expect(screen.getByText('Chargement des préférences…')).toHaveAttribute('role', 'status')
  expect(screen.getAllByRole('group')).toHaveLength(3)
  for (const choice of screen.getAllByRole('radio')) { expect(choice).toBeDisabled(); expect(choice).not.toBeChecked() }
  await act(async () => { pending.resolve(initial); await pending.promise })
  await ready()
  expect(radio(collection, 'Classeur')).toBeChecked()
  expect(radio(binder, '2×2')).toBeChecked()
  expect(read).toHaveBeenCalledExactlyOnceWith('viewer')
  expect(save).not.toHaveBeenCalled()
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual(initial)
})

test.each([
  [catalog, 'Liste', { catalogDefaultView: 'list' }],
  [catalog, 'Dernier choix utilisé', { catalogDefaultView: 'last_used' }],
  [collection, 'Liste', { collectionDefaultView: 'list' }],
  [collection, 'Cartes', { collectionDefaultView: 'cards' }],
  [collection, 'Dernier choix utilisé', { collectionDefaultView: 'last_used' }],
  [binder, '3×3', { binderDefaultFormat: '3x3' }],
  [binder, '4×3', { binderDefaultFormat: '4x3' }],
] as const)('%s saves %s alone, preserves last choices and updates shared cache without refetch', async (name, choice, patch) => {
  const { client } = setup(); await ready()
  fireEvent.click(radio(name, choice))
  await waitFor(() => expect(radio(name, choice)).toBeChecked())
  expect(save).toHaveBeenCalledExactlyOnceWith('viewer', patch)
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual({ ...initial, ...patch })
  expect(read).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: /Enregistrer/ })).not.toBeInTheDocument()
})

test('independent concurrent saves disable only their own row and merge out-of-order confirmed fields', async () => {
  const a = deferred<UserPreferences>(), b = deferred<UserPreferences>(), c = deferred<UserPreferences>()
  save.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise)
  const { client } = setup(); await ready()
  fireEvent.click(radio(catalog, 'Liste'))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(radio(catalog, 'Liste')).toBeDisabled()
  expect(radio(catalog, 'Cartes')).toBeChecked()
  expect(radio(collection, 'Liste')).toBeEnabled()
  expect(radio(binder, '3×3')).toBeEnabled()
  fireEvent.click(radio(collection, 'Cartes')); fireEvent.click(radio(binder, '4×3'))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(3))
  await act(async () => { c.resolve({ ...initial, binderDefaultFormat: '4x3' }); await c.promise })
  await act(async () => { b.resolve({ ...initial, collectionDefaultView: 'cards' }); await b.promise })
  await act(async () => { a.resolve({ ...initial, catalogDefaultView: 'list' }); await a.promise })
  await waitFor(() => expect(radio(catalog, 'Liste')).toBeEnabled())
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual({ ...initial, catalogDefaultView: 'list',
    collectionDefaultView: 'cards', binderDefaultFormat: '4x3' })
  expect(radio(collection, 'Cartes')).toBeChecked(); expect(radio(binder, '4×3')).toBeChecked()
  expect(read).toHaveBeenCalledOnce()
})

test('load error retains structure, hides fallback selections, and retries', async () => {
  read.mockRejectedValueOnce(new Error('private URL'))
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger vos préférences.')
  expect(screen.getAllByRole('group')).toHaveLength(3)
  for (const choice of screen.getAllByRole('radio')) { expect(choice).toBeDisabled(); expect(choice).not.toBeChecked() }
  expect(screen.queryByText('private URL')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' })); await ready()
  expect(read).toHaveBeenCalledTimes(2)
})

test('save error keeps confirmed selection, describes affected group and radios, and allows another attempt', async () => {
  save.mockRejectedValueOnce(new Error('private payload'))
  const { client } = setup(); await ready()
  fireEvent.click(radio(catalog, 'Liste'))
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('Modification non confirmée. Réessayez.')
  expect(group(catalog).getAttribute('aria-describedby')).toContain(error.id)
  expect(radio(catalog, 'Liste').getAttribute('aria-describedby')).toContain(error.id)
  expect(radio(catalog, 'Cartes')).toBeChecked()
  expect(radio(catalog, 'Liste')).toBeEnabled()
  expect(client.getQueryData(userPreferencesKey('viewer'))).toEqual(initial)
  expect(within(group(collection)).queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(radio(catalog, 'Liste'))
  await waitFor(() => expect(radio(catalog, 'Liste')).toBeChecked())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('native single-choice groups expose descriptions and selected state; selecting current value does not write', async () => {
  setup(); await ready()
  for (const name of [catalog, collection, binder]) {
    expect(group(name)).toHaveAccessibleName(name)
    expect(group(name)).toHaveAccessibleDescription()
    expect(within(group(name)).getAllByRole('radio').filter(choice => (choice as HTMLInputElement).checked)).toHaveLength(1)
    for (const choice of within(group(name)).getAllByRole('radio')) {
      expect(choice).toHaveAccessibleName(); expect(choice).toHaveAccessibleDescription()
    }
  }
  radio(catalog, 'Cartes').focus(); expect(radio(catalog, 'Cartes')).toHaveFocus()
  fireEvent.click(radio(catalog, 'Cartes')); expect(save).not.toHaveBeenCalled()
})

test('departed viewer response cannot repopulate purged cache or leak selection into another session', async () => {
  const pending = deferred<UserPreferences>(); save.mockReturnValueOnce(pending.promise)
  const { client, tree, rerender } = setup(); await ready()
  fireEvent.click(radio(catalog, 'Liste'))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  auth.user = { id: 'other' }; rerender(tree()); await ready()
  client.removeQueries({ queryKey: userPreferencesKey('viewer'), exact: true })
  await act(async () => { pending.resolve({ ...initial, catalogDefaultView: 'list' }); await pending.promise })
  expect(client.getQueryData(userPreferencesKey('viewer'))).toBeUndefined()
  expect(radio(catalog, 'Cartes')).toBeChecked()
  auth.isAuthorized = false; rerender(tree())
  for (const choice of screen.getAllByRole('radio')) { expect(choice).not.toBeChecked(); expect(choice).toBeDisabled() }
})

test.each(['success', 'error', 'moved'] as const)('saving restores lost native focus without stealing another control: %s', async outcome => {
  const pending = deferred<UserPreferences>(); save.mockReturnValueOnce(pending.promise)
  setup(); await ready()
  const target = radio(catalog, 'Liste')
  target.focus(); fireEvent.click(target)
  await waitFor(() => expect(target).toBeDisabled())
  // jsdom does not emulate the browser blur caused by a disabled fieldset.
  target.blur()
  if (outcome === 'moved') radio(binder, '4×3').focus()
  await act(async () => {
    if (outcome === 'error') pending.reject(new Error('failed'))
    else pending.resolve({ ...initial, catalogDefaultView: 'list' })
    await pending.promise.catch(() => undefined)
  })
  await waitFor(() => expect(target).toBeEnabled())
  if (outcome === 'moved') expect(radio(binder, '4×3')).toHaveFocus()
  else expect(target).toHaveFocus()
})

function Consumers() {
  const view = useCollectionView('open')
  const inherited = useBinderFormat('viewer', 'inherited', true, () => {})
  const overridden = useBinderFormat('viewer', 'overridden', true, () => {})
  return <><output aria-label="Vue ouverte">{view.currentView}</output>
    <output aria-label="Format hérité">{inherited.ready ? inherited.format : 'loading'}</output>
    <output aria-label="Format spécifique">{overridden.ready ? overridden.format : 'loading'}</output></>
}
test('settings updates live inheritance, preserves override and open view, and applies default on next opening', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  vi.mocked(getCollectionViewOverride).mockImplementation((_viewer, id) => Promise.resolve(id === 'overridden' ? '3x3' : null))
  const tree = (consumers: boolean) => <QueryClientProvider client={client}><SettingsPage />{consumers && <Consumers />}</QueryClientProvider>
  const { rerender } = render(tree(true)); await ready()
  await waitFor(() => expect(screen.getByLabelText('Format spécifique')).toHaveTextContent('3x3'))
  expect(screen.getByLabelText('Vue ouverte')).toHaveTextContent('binder')
  fireEvent.click(radio(collection, 'Liste'))
  await waitFor(() => expect(radio(collection, 'Liste')).toBeChecked())
  expect(screen.getByLabelText('Vue ouverte')).toHaveTextContent('binder')
  fireEvent.click(radio(binder, '4×3'))
  await waitFor(() => expect(screen.getByLabelText('Format hérité')).toHaveTextContent('4x3'))
  expect(screen.getByLabelText('Format spécifique')).toHaveTextContent('3x3')
  expect(client.getQueryData(binderFormatKey('viewer', 'overridden'))).toBe('3x3')
  expect(saveCollectionViewOverride).not.toHaveBeenCalled(); expect(deleteCollectionViewOverride).not.toHaveBeenCalled()
  expect(read).toHaveBeenCalledOnce()
  rerender(tree(false)); rerender(tree(true))
  await waitFor(() => expect(screen.getByLabelText('Vue ouverte')).toHaveTextContent('list'))
})
