import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CatalogError, getCatalogPokemon } from '../../services/catalog'
import { CollectionsError, createAutomatic, findOwnedAutomaticCollection } from '../../services/collections'
import { getUserPreferences, saveUserPreferences } from '../../services/view-preferences'
import { getVariantDetail, VariantDetailError } from '../../services/variant-detail'
import { listPhysicalCopies } from '../../services/physical-copies'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { resolveCatalogIdentity } from '../../lib/catalog-identity'
import { catalogPokemon } from '../../test/catalog-fixtures'
import type { CatalogPokemon } from '../../types/catalog'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { ownedAutomaticCollectionKey } from './catalog-query'
import { CatalogPokemonPage } from './CatalogPokemonPage'

const viewer = 'c1200000-0000-0000-0000-000000000099', collectionId = 'c1200000-0000-0000-0000-000000000001'
const auth = vi.hoisted(() => ({ user: { id: 'c1200000-0000-0000-0000-000000000099' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/catalog', async original => ({ ...await original<typeof import('../../services/catalog')>(), getCatalogPokemon: vi.fn() }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(), createAutomatic: vi.fn(), findOwnedAutomaticCollection: vi.fn() }))
vi.mock('../../services/variant-detail', async original => ({ ...await original<typeof import('../../services/variant-detail')>(), getVariantDetail: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), saveUserPreferences: vi.fn() }))
const read = vi.mocked(getCatalogPokemon), find = vi.mocked(findOwnedAutomaticCollection), create = vi.mocked(createAutomatic)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.isAuthorized = true; auth.user.id = viewer
  read.mockReset().mockResolvedValue(catalogPokemon)
  find.mockReset().mockResolvedValue(null)
  create.mockReset().mockResolvedValue({ collectionId, created: true })
  vi.mocked(getUserPreferences).mockReset().mockResolvedValue(DEFAULT_USER_PREFERENCES)
  vi.mocked(saveUserPreferences).mockReset().mockImplementation((_id, patch) => Promise.resolve({ ...DEFAULT_USER_PREFERENCES, ...patch }))
  vi.mocked(getVariantDetail).mockReset().mockRejectedValue(new VariantDetailError('variant_unavailable'))
  vi.mocked(listPhysicalCopies).mockReset().mockResolvedValue([])
})
function Path() { return <span data-testid="path">{useLocation().pathname}</span> }
function setup(id = catalogPokemon.pokemonId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/catalog/pokemon/${id}`]}>
    <Routes><Route path="/catalog/pokemon/:pokemonId" element={<CatalogPokemonPage />} />
      <Route path="/collections/:collectionId" element={<h1>Collection ouverte</h1>} /></Routes><Path />
  </MemoryRouter></QueryClientProvider>)
  return { ...result, client }
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
async function loaded() { await screen.findByRole('heading', { name: 'Pikachu', level: 1 }) }
async function creation() { await screen.findByRole('button', { name: 'Créer ma collection' }); press('Créer ma collection'); return screen.getByRole('dialog') }

test('loading stable, no fake CTA; title update never steals focus', async () => {
  let resolve!: (value: CatalogPokemon) => void
  read.mockReturnValueOnce(new Promise(done => { resolve = done }))
  setup()
  expect(screen.getByText('Chargement du Pokémon…')).toHaveAttribute('role', 'status')
  expect(screen.queryByRole('button', { name: 'Créer ma collection' })).not.toBeInTheDocument()
  const target = document.createElement('button'); document.body.append(target); target.focus()
  await act(async () => { resolve(catalogPokemon); await Promise.resolve() })
  await loaded()
  expect(document.title).toBe('Pikachu — MY.'); expect(target).toHaveFocus(); target.remove()
  expect(read).toHaveBeenCalledExactlyOnceWith('800')
})
test('unauthorized page reads nothing', () => {
  auth.isAuthorized = false; setup()
  expect(read).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled()
})
test.each(['invalid', '800'])('unavailable ID %s is indistinguishable with safe navigation', async id => {
  read.mockRejectedValue(new CatalogError('catalog_unavailable')); setup(id)
  await screen.findByText('Ce Pokémon n’est pas disponible dans le catalogue.')
  expect(screen.getByRole('link', { name: 'Revenir aux collections' })).toHaveAttribute('href', '/dashboard')
  expect(find).not.toHaveBeenCalled()
})
test('technical error + retry does not display server text', async () => {
  read.mockRejectedValueOnce(new Error('42501 secret')).mockResolvedValue(catalogPokemon); setup()
  await screen.findByText('Impossible de charger ce Pokémon.')
  expect(screen.queryByText(/42501/)).not.toBeInTheDocument(); press('Réessayer'); await loaded()
  expect(read).toHaveBeenCalledTimes(2)
})
test.each([['electric', null, 25, 1], ['fire', 'flying', 1025, 143]] as const)('header %s/%s, count and four digit dex', async (primary, secondary, dexNumber, count) => {
  read.mockResolvedValue({ ...catalogPokemon, primaryType: primary, secondaryType: secondary, dexNumber, variantCount: count })
  const { container } = setup(); await loaded()
  const theme = container.querySelector<HTMLElement>('.catalog-themed')!
  const identity = resolveCatalogIdentity(primary, secondary)
  expect(theme.style.getPropertyValue('--catalog-gradient')).toBe(identity.gradient)
  expect(theme.style.getPropertyValue('--catalog-accent')).toBe(identity.primaryAccent)
  expect(screen.getByText(`#${String(dexNumber).padStart(4, '0')}`)).toBeVisible()
  expect(screen.getByText(`${count} ${count === 1 ? 'version' : 'versions'}`)).toBeVisible()
  expect(screen.getByText(primary === 'electric' ? 'Électrik' : 'Feu')).toBeVisible()
  if (secondary) expect(screen.getByText('Vol')).toBeVisible()
  expect(container.querySelector('.catalog-pokemon-header img')).toBeNull()
})
test('neutral list/cards, local search keeps order and query, clear restores focus', async () => {
  const { container } = setup(); await loaded()
  const input = screen.getByRole('searchbox', { name: 'Rechercher dans Pikachu…' })
  expect(input).toHaveAttribute('autocomplete', 'off')
  const results = screen.getByRole('list', { name: 'Versions du catalogue' })
  expect(within(results).getAllByRole('listitem')).toHaveLength(3)
  fireEvent.change(input, { target: { value: 'PIKACHU écarlate 25' } })
  expect(within(results).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    'Voir le détail de Pikachu · EV (SV) · 025 · Holo', 'Voir le détail de Pikachu spécial · EV (SV) · 025 · Holo spéciale',
  ])
  const cards = screen.getByRole('button', { name: 'Cartes' }); cards.focus(); fireEvent.click(cards)
  expect(cards).toHaveFocus(); expect(cards).toHaveAttribute('aria-pressed', 'true')
  expect(results).toHaveClass('catalog-variants-cards'); expect(input).toHaveValue('PIKACHU écarlate 25')
  await waitFor(() => expect(saveUserPreferences).toHaveBeenCalledExactlyOnceWith(viewer, { lastCatalogView: 'cards' }))
  expect(cards).toHaveFocus(); expect(read).toHaveBeenCalledOnce(); expect(find).toHaveBeenCalledOnce()
  expect(container.querySelector('[class*="is-missing"], [class*="owned"], [class*="reorder"], [class*="collection-content-actions"]')).toBeNull()
  expect(results.querySelectorAll('a')).toHaveLength(4)
  for (const text of ['Possédée', 'Manquante', 'Auto', 'Perso', 'Exemplaires']) expect(within(results).queryByText(text)).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'absent' } }); expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  press('Effacer la recherche'); expect(input).toHaveValue(''); expect(input).toHaveFocus()
  expect(within(results).getAllByRole('listitem')).toHaveLength(3)
  press('Liste'); expect(results).toHaveClass('catalog-variants-list')
})
test.each(['Liste', 'Cartes'])('real Detail dialog from %s, own copies, local unavailable and exact focus restoration', async view => {
  setup(); await loaded(); if (view === 'Cartes') press('Cartes')
  const opener = screen.getAllByRole('button', { name: /^Voir le détail/ })[1]!
  opener.focus(); fireEvent.click(opener)
  const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('Informations de la carte')).toHaveFocus()
  await within(dialog).findByText('Cette version n’est pas disponible.')
  await waitFor(() => expect(listPhysicalCopies).toHaveBeenCalledWith(viewer, '2'))
  const addCopy = await within(dialog).findByRole('button', { name: 'Ajouter un exemplaire' })
  addCopy.focus(); fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(within(dialog).getByRole('button', { name: 'Fermer le détail' })).toHaveFocus()
  expect(screen.getByRole('heading', { name: 'Pikachu', level: 1 })).toBeVisible()
  press('Fermer le détail'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus()
  fireEvent.click(opener); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(opener).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('detection loading/error/retry never assumes absence', async () => {
  find.mockReturnValueOnce(new Promise(() => {})); setup(); await loaded()
  expect(screen.getByText('Chargement de votre collection…')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Créer ma collection' })).not.toBeInTheDocument()
})
test('detection retry and existing owned collection opens directly', async () => {
  find.mockRejectedValueOnce(new CollectionsError('unexpected')).mockResolvedValue({ collectionId }); setup()
  await screen.findByText('Impossible de vérifier votre collection.'); press('Réessayer')
  await screen.findByRole('button', { name: 'Ouvrir ma collection' }); press('Ouvrir ma collection')
  expect(screen.getByTestId('path')).toHaveTextContent(`/collections/${collectionId}`)
  expect(find).toHaveBeenCalledWith(viewer, 'pokemon', '800'); expect(create).not.toHaveBeenCalled()
})
test('creation dialog empty name, validation, trap, cancel and exact focus', async () => {
  setup(); const dialog = await creation()
  expect(within(dialog).getByRole('heading', { name: 'Nouvelle collection' })).toBeVisible()
  expect(within(dialog).getByText('Crée automatiquement une collection à partir de Pikachu.')).toBeVisible()
  const input = within(dialog).getByRole('textbox', { name: 'Nom de la collection' }); expect(input).toHaveValue(''); expect(input).toHaveFocus()
  press('Créer la collection'); expect(input).toHaveAttribute('aria-invalid', 'true'); expect(input).toHaveFocus(); expect(create).not.toHaveBeenCalled()
  const submit = within(dialog).getByRole('button', { name: 'Créer la collection' }); submit.focus(); fireEvent.keyDown(dialog, { key: 'Tab' }); expect(input).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(submit).toHaveFocus()
  press('Annuler'); expect(screen.getByRole('button', { name: 'Créer ma collection' })).toHaveFocus()
  await creation(); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('button', { name: 'Créer ma collection' })).toHaveFocus()
})
test.each([true, false])('createAutomatic created=%s navigates authoritative ID, coherent CTA/Dashboard', async created => {
  create.mockResolvedValue({ collectionId, created }); const { client } = setup()
  client.setQueryData(dashboardCollectionsKey(viewer), [])
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  await creation(); fireEvent.change(screen.getByLabelText('Nom de la collection'), { target: { value: '  Mes favoris  ' } })
  press('Créer la collection')
  await screen.findByRole('heading', { name: 'Collection ouverte' })
  expect(create).toHaveBeenCalledExactlyOnceWith({ name: '  Mes favoris  ', targetType: 'pokemon', targetId: '800' })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardCollectionsKey(viewer), exact: true })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ownedAutomaticCollectionKey(viewer, 'pokemon', '800'), exact: true })
})
test('double submission stays single; pending creation cannot be dismissed', async () => {
  let resolve!: (value: { collectionId: string; created: boolean }) => void
  create.mockReturnValueOnce(new Promise(done => { resolve = done }))
  setup(); const dialog = await creation()
  fireEvent.change(screen.getByLabelText('Nom de la collection'), { target: { value: 'Favoris' } })
  const form = dialog.querySelector('form')!
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  await waitFor(() => expect(create).toHaveBeenCalledOnce())
  expect(screen.getByText('Création en cours…')).toBeVisible()
  fireEvent(dialog, new Event('cancel', { cancelable: true })); expect(dialog).toHaveAttribute('open')
  await act(async () => { resolve({ collectionId, created: false }); await Promise.resolve() })
  await screen.findByRole('heading', { name: 'Collection ouverte' })
})
test.each([
  ['invalid_name', 'Saisissez au moins 3 caractères'], ['not_authorized', 'Votre session ne permet pas cette action.'],
  ['target_not_found', 'Ce Pokémon n’est plus disponible dans le catalogue.'], ['empty_automatic_target', 'Ce Pokémon n’est plus disponible dans le catalogue.'],
  ['automatic_state_missing', 'La création n’a pas pu être confirmée.'], ['automatic_state_inconsistent', 'La création n’a pas pu être confirmée.'],
  ['unexpected', 'La création n’a pas pu être confirmée.'],
] as const)('creation error %s safe and retryable', async (code, message) => {
  create.mockRejectedValue(new CollectionsError(code)); setup(); await creation()
  fireEvent.change(screen.getByLabelText('Nom de la collection'), { target: { value: 'Favoris' } }); press('Créer la collection')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
  expect(screen.getByTestId('path')).toHaveTextContent('/catalog/pokemon/800')
  expect(screen.getByRole('button', { name: 'Créer la collection' })).toBeEnabled()
  expect(screen.getByRole('dialog')).not.toHaveTextContent(code)
  if (code === 'invalid_name') expect(screen.getByLabelText('Nom de la collection')).toHaveFocus()
})
