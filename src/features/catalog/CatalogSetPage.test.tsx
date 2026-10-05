import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CatalogError, getCatalogPokemon, getCatalogSet } from '../../services/catalog'
import { CollectionsError, createAutomatic, findOwnedAutomaticCollection } from '../../services/collections'
import { getUserPreferences, saveUserPreferences } from '../../services/view-preferences'
import { getVariantDetail, VariantDetailError } from '../../services/variant-detail'
import { listPhysicalCopies } from '../../services/physical-copies'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { resolveCatalogIdentity } from '../../lib/catalog-identity'
import { catalogPokemon, catalogSet } from '../../test/catalog-fixtures'
import type { CatalogSet } from '../../types/catalog'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { userPreferencesKey } from '../view-preferences/view-preferences-query'
import { catalogSetKey, ownedAutomaticCollectionKey } from './catalog-query'
import { CatalogPokemonPage } from './CatalogPokemonPage'
import { CatalogSetPage } from './CatalogSetPage'

const viewer = 'c1200000-0000-0000-0000-000000000099', collectionId = 'c1200000-0000-0000-0000-000000000001'
const auth = vi.hoisted(() => ({ user: { id: 'c1200000-0000-0000-0000-000000000099' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/catalog', async original => ({ ...await original<typeof import('../../services/catalog')>(), getCatalogSet: vi.fn(), getCatalogPokemon: vi.fn() }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(), createAutomatic: vi.fn(), findOwnedAutomaticCollection: vi.fn() }))
vi.mock('../../services/variant-detail', async original => ({ ...await original<typeof import('../../services/variant-detail')>(), getVariantDetail: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), saveUserPreferences: vi.fn() }))
const read = vi.mocked(getCatalogSet), find = vi.mocked(findOwnedAutomaticCollection), create = vi.mocked(createAutomatic)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.isAuthorized = true; auth.user.id = viewer
  read.mockReset().mockResolvedValue(catalogSet)
  vi.mocked(getCatalogPokemon).mockReset().mockResolvedValue(catalogPokemon)
  find.mockReset().mockResolvedValue(null)
  create.mockReset().mockResolvedValue({ collectionId, created: true })
  let preferences = { ...DEFAULT_USER_PREFERENCES }
  vi.mocked(getUserPreferences).mockReset().mockImplementation(() => Promise.resolve({ ...preferences }))
  vi.mocked(saveUserPreferences).mockReset().mockImplementation((_id, patch) => {
    preferences = { ...preferences, ...patch }; return Promise.resolve({ ...preferences })
  })
  vi.mocked(getVariantDetail).mockReset().mockRejectedValue(new VariantDetailError('variant_unavailable'))
  vi.mocked(listPhysicalCopies).mockReset().mockResolvedValue([])
})
function History() {
  const navigate = useNavigate()
  return <><span data-testid="path">{useLocation().pathname}</span><button onClick={() => void navigate(-1)}>Retour navigateur</button></>
}
function setup(id = catalogSet.setId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/catalog/extensions/${id}`]}>
    <Routes><Route path="/catalog/extensions/:setId" element={<CatalogSetPage />} />
      <Route path="/catalog/pokemon/:pokemonId" element={<CatalogPokemonPage />} />
      <Route path="/collections/:collectionId" element={<h1>Collection ouverte</h1>} /></Routes><History />
  </MemoryRouter></QueryClientProvider>)
  return { ...result, client }
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
async function loaded() { await screen.findByRole('heading', { name: catalogSet.nameFr!, level: 1 }) }
async function creation() { await screen.findByRole('button', { name: 'Créer ma collection' }); press('Créer ma collection'); return screen.getByRole('dialog') }

test('loading, private resource key, title without refocus, no premature CTA', async () => {
  let resolve!: (value: CatalogSet) => void
  read.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const { client } = setup()
  expect(screen.getByText('Chargement de l’Extension…')).toHaveAttribute('role', 'status')
  expect(screen.queryByRole('button', { name: 'Créer ma collection' })).not.toBeInTheDocument()
  const target = screen.getByRole('button', { name: 'Retour navigateur' }); target.focus()
  await act(async () => { resolve(catalogSet); await Promise.resolve() }); await loaded()
  expect(target).toHaveFocus(); expect(document.title).toBe('Forces Temporelles — MY.')
  expect(read).toHaveBeenCalledExactlyOnceWith('50')
  expect(client.getQueryData(catalogSetKey(viewer, '50'))).toEqual(catalogSet)
  expect(client.getQueryData(catalogSetKey('another-viewer', '50'))).toBeUndefined()
})

test('unauthorized page reads nothing', () => {
  auth.isAuthorized = false; setup()
  expect(read).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled()
})
test.each(['invalid', '50'])('unavailable %s has uniform outcome and safe navigation', async id => {
  read.mockRejectedValue(new CatalogError('catalog_unavailable')); setup(id)
  await screen.findByText('Cette Extension n’est pas disponible dans le catalogue.')
  expect(screen.getByRole('link', { name: 'Revenir aux collections' })).toHaveAttribute('href', '/dashboard')
  expect(find).not.toHaveBeenCalled()
})
test('technical error hides server messages and retries', async () => {
  read.mockRejectedValueOnce(new Error('42501 SQL secret')).mockResolvedValue(catalogSet); setup()
  await screen.findByText('Impossible de charger cette Extension.')
  expect(screen.queryByText(/42501/)).not.toBeInTheDocument(); press('Réessayer'); await loaded()
  expect(read).toHaveBeenCalledTimes(2)
})

test('header has one h1, distinct source, FR abbreviation, series, French date, count and neutral theme', async () => {
  const { container } = setup(); await loaded()
  const header = container.querySelector('header')!
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  for (const text of ['Temporal Forces', 'EV05 (TEF)', 'Écarlate et Violet', '22 mars 2024', '4 versions']) {
    expect(within(header).getByText(text)).toBeVisible()
  }
  expect(header.querySelector('time')).toHaveAttribute('datetime', '2024-03-22')
  const identity = resolveCatalogIdentity(), theme = container.querySelector<HTMLElement>('.catalog-themed')!
  expect(theme.style.getPropertyValue('--catalog-accent')).toBe(identity.primaryAccent)
  expect(theme.style.getPropertyValue('--catalog-gradient')).toBe(identity.gradient)
  expect(header.querySelector('.catalog-types')).toBeNull()
  expect(header.querySelector('.catalog-set-logo')).toHaveAttribute('src', catalogSet.logoUrl)
  expect(header.querySelector('.catalog-set-symbol')).toHaveAttribute('src', catalogSet.symbolUrl)
  expect(header.querySelector('.catalog-set-logo')).toHaveAttribute('alt', '')
  fireEvent.error(header.querySelector('.catalog-set-logo')!); fireEvent.error(header.querySelector('.catalog-set-symbol')!)
  expect(header.querySelector('img')).toBeNull(); expect(within(header).getByRole('heading', { level: 1 })).toBeVisible()
})
test.each([
  ['EV05', 'EV05', 'EV05'], ['EV05', null, 'EV05'], [null, 'TEF', 'TEF'], [null, null, null],
])('header abbreviation %s/%s, missing metadata/media and singular', async (fr, source, expected) => {
  read.mockResolvedValue({ ...catalogSet, abbreviationFr: fr, abbreviation: source, nameSource: catalogSet.nameFr,
    releaseDate: null, series: { ...catalogSet.series, nameFr: null, nameSource: null }, logoUrl: null, symbolUrl: null,
    variantCount: 1, variants: catalogSet.variants.slice(0, 1) })
  const { container } = setup(); await loaded(); const header = container.querySelector('header')!
  expect(within(header).getByText('1 version')).toBeVisible()
  expect(header.querySelector('img, time, .catalog-set-source, .catalog-set-metadata')).toBeNull()
  if (expected) expect(within(header).getByText(expected)).toBeVisible()
  else expect(header.querySelector('.catalog-set-abbreviation')).toBeEmptyDOMElement()
})
test('partial media and source metadata remain useful', async () => {
  read.mockResolvedValue({ ...catalogSet, logoUrl: null, nameFr: null, series: { ...catalogSet.series, nameFr: null } })
  const { container } = setup()
  await screen.findByRole('heading', { name: 'Temporal Forces', level: 1 })
  expect(container.querySelector('.catalog-set-logo')).toBeNull()
  expect(container.querySelector('.catalog-set-symbol')).toBeVisible()
  expect(screen.getByText('Scarlet & Violet')).toBeVisible()
})

test.each(['list', 'cards'] as const)('opens using existing Catalogue preference %s', async view => {
  vi.mocked(getUserPreferences).mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, catalogDefaultView: view })
  setup(); await loaded()
  await waitFor(() => expect(screen.getByRole('button', { name: view === 'list' ? 'Liste' : 'Cartes' })).toHaveAttribute('aria-pressed', 'true'))
  expect(screen.getByRole('list')).toHaveClass(`catalog-variants-${view}`)
  expect(saveUserPreferences).not.toHaveBeenCalled()
})
test('local search across attached Pokémon and fields, order/query preserved, no network typing, neutral views', async () => {
  const { container } = setup(); await loaded()
  const results = screen.getByRole('list', { name: 'Versions du catalogue' }), input = screen.getByRole('searchbox')
  expect(within(results).getAllByRole('listitem')).toHaveLength(4)
  expect(within(results).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    'Voir le détail de Duo électrique · EV05 (TEF) · 025 · Reverse', 'Voir le détail de Évoli · EV05 (TEF) · 026 · Holo',
    'Voir le détail de Recherche Professorale · EV05 (TEF) · 100 · Normale', 'Voir le détail de Énergie · EV05 (TEF) · 101 · Normale',
  ])
  fireEvent.change(input, { target: { value: ' PIKACHU   Réverse ' } })
  expect(within(results).getAllByRole('listitem')).toHaveLength(1)
  const cards = screen.getByRole('button', { name: 'Cartes' }); cards.focus(); fireEvent.click(cards)
  expect(cards).toHaveFocus(); expect(cards).toHaveAttribute('aria-pressed', 'true')
  expect(results).toHaveClass('catalog-variants-cards'); expect(input).toHaveValue(' PIKACHU   Réverse ')
  await waitFor(() => expect(saveUserPreferences).toHaveBeenCalledExactlyOnceWith(viewer, { lastCatalogView: 'cards' }))
  for (const query of ['DUO électrique 025', 'Raichu reverse', 'evoli holo', '100 normale']) {
    fireEvent.change(input, { target: { value: query } }); expect(within(results).getAllByRole('listitem')).toHaveLength(1)
  }
  fireEvent.change(input, { target: { value: 'pikachu holo' } })
  expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  press('Effacer la recherche'); expect(input).toHaveValue(''); expect(input).toHaveFocus()
  expect(within(results).getAllByRole('listitem')).toHaveLength(4)
  expect(read).toHaveBeenCalledOnce(); expect(find).toHaveBeenCalledOnce()
  expect(container.querySelector('[class*="is-missing"], [class*="owned"], [class*="reorder"], [class*="collection-content-actions"]')).toBeNull()
  for (const text of ['Possédée', 'Manquante', 'Auto', 'Perso', 'Exemplaires']) expect(within(results).queryByText(text)).not.toBeInTheDocument()
  press('Liste'); expect(results).toHaveClass('catalog-variants-list')
})
test.each(['Liste', 'Cartes'])('independent real Pokémon links and history from %s, no nested controls or empty zones', async view => {
  const { container, client } = setup(); await loaded()
  if (view === 'Cartes') {
    press('Cartes')
    await waitFor(() => expect(client.getQueryData(userPreferencesKey(viewer))).toMatchObject({ lastCatalogView: 'cards' }))
  }
  const rows = screen.getAllByRole('listitem'), duo = within(rows[0]!), single = within(rows[1]!)
  expect(duo.getByRole('group', { name: 'Pokémon associés' })).toBeVisible()
  expect(duo.getByRole('link', { name: 'Pikachu' })).toHaveAttribute('href', '/catalog/pokemon/800')
  expect(duo.getByRole('link', { name: 'Raichu' })).toHaveAttribute('href', '/catalog/pokemon/801')
  expect(single.getByRole('link', { name: 'Évoli' })).toHaveAttribute('href', '/catalog/pokemon/802')
  for (const row of rows.slice(2)) expect(row.querySelector('.catalog-pokemon-links')).toBeNull()
  expect(container.querySelector('button a, a button')).toBeNull()
  fireEvent.click(duo.getByRole('link', { name: 'Pikachu' }))
  await screen.findByRole('heading', { name: 'Pikachu', level: 1 })
  expect(screen.getByTestId('path')).toHaveTextContent('/catalog/pokemon/800')
  expect(getVariantDetail).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  press('Retour navigateur'); await loaded()
  await waitFor(() => expect(screen.getByRole('list')).toHaveClass(view === 'Cartes' ? 'catalog-variants-cards' : 'catalog-variants-list'))
})
test.each(['Liste', 'Cartes'])('main %s opens existing Detail with personal copies, trap/Esc and exact focus restoration', async view => {
  setup(); await loaded(); if (view === 'Cartes') press('Cartes')
  const opener = screen.getAllByRole('button', { name: /^Voir le détail/ })[0]!
  opener.focus(); fireEvent.click(opener)
  const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('Informations de la carte')).toHaveFocus()
  await within(dialog).findByText('Cette version n’est pas disponible.')
  await waitFor(() => expect(listPhysicalCopies).toHaveBeenCalledWith(viewer, '9007199254740995'))
  const add = await within(dialog).findByRole('button', { name: 'Ajouter un exemplaire' }); add.focus()
  fireEvent.keyDown(dialog, { key: 'Tab' }); expect(within(dialog).getByRole('button', { name: 'Fermer le détail' })).toHaveFocus()
  press('Fermer le détail'); expect(opener).toHaveFocus()
  fireEvent.click(opener); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(opener).toHaveFocus(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('CTA detection pending never assumes absent', async () => {
  find.mockReturnValueOnce(new Promise(() => {})); setup(); await loaded()
  expect(screen.getByText('Chargement de votre collection…')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Créer ma collection' })).not.toBeInTheDocument()
})
test('detection error/retry opens existing personal set without creation', async () => {
  find.mockRejectedValueOnce(new CollectionsError('unexpected')).mockResolvedValue({ collectionId }); setup()
  await screen.findByText('Impossible de vérifier votre collection.'); press('Réessayer')
  await screen.findByRole('button', { name: 'Ouvrir ma collection' }); press('Ouvrir ma collection')
  expect(screen.getByTestId('path')).toHaveTextContent(`/collections/${collectionId}`)
  expect(find).toHaveBeenCalledWith(viewer, 'set', '50'); expect(create).not.toHaveBeenCalled()
})
test('Extension modal context, empty free name, validation, cancel, trap and focus', async () => {
  setup(); const dialog = await creation()
  expect(within(dialog).getByRole('heading', { name: 'Nouvelle collection' })).toBeVisible()
  expect(within(dialog).getByText('Crée automatiquement une collection à partir de Forces Temporelles.')).toBeVisible()
  const input = within(dialog).getByRole('textbox', { name: 'Nom de la collection' })
  expect(input).toHaveValue(''); expect(input).toHaveFocus()
  expect(dialog.querySelector('select')).toBeNull(); expect(within(dialog).getAllByRole('textbox')).toHaveLength(1)
  press('Créer la collection'); expect(input).toHaveAttribute('aria-invalid', 'true'); expect(create).not.toHaveBeenCalled()
  const submit = within(dialog).getByRole('button', { name: 'Créer la collection' }); submit.focus()
  fireEvent.keyDown(dialog, { key: 'Tab' }); expect(input).toHaveFocus()
  press('Annuler'); expect(screen.getByRole('button', { name: 'Créer ma collection' })).toHaveFocus()
  await creation(); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('button', { name: 'Créer ma collection' })).toHaveFocus()
})
test.each([true, false])('set created=%s opens authoritative ID and reconciles exact CTA/Dashboard caches', async created => {
  create.mockResolvedValue({ collectionId, created }); const { client } = setup()
  client.setQueryData(dashboardCollectionsKey(viewer), [])
  const invalidate = vi.spyOn(client, 'invalidateQueries'), cache = vi.spyOn(client, 'setQueryData')
  await creation(); fireEvent.change(screen.getByLabelText('Nom de la collection'), { target: { value: '  Mes extensions  ' } }); press('Créer la collection')
  await screen.findByRole('heading', { name: 'Collection ouverte' })
  expect(create).toHaveBeenCalledExactlyOnceWith({ name: '  Mes extensions  ', targetType: 'set', targetId: '50' })
  const queryKey = ownedAutomaticCollectionKey(viewer, 'set', '50')
  expect(cache).toHaveBeenCalledWith(queryKey, { collectionId })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardCollectionsKey(viewer), exact: true })
  expect(invalidate).toHaveBeenCalledWith({ queryKey, exact: true })
})
test.each([
  ['invalid_name', 'Saisissez au moins 3 caractères'], ['not_authorized', 'Votre session ne permet pas cette action.'],
  ['target_not_found', 'Cette Extension n’est plus disponible dans le catalogue.'], ['empty_automatic_target', 'Cette Extension n’est plus disponible dans le catalogue.'],
  ['invalid_target', 'Cette Extension n’est plus disponible dans le catalogue.'],
  ['automatic_state_missing', 'La création n’a pas pu être confirmée.'], ['automatic_state_inconsistent', 'La création n’a pas pu être confirmée.'],
  ['unexpected', 'La création n’a pas pu être confirmée.'],
] as const)('set creation error %s translated locally, name errors focus field', async (code, message) => {
  create.mockRejectedValue(new CollectionsError(code)); setup(); await creation()
  fireEvent.change(screen.getByLabelText('Nom de la collection'), { target: { value: 'Extensions' } }); press('Créer la collection')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
  expect(screen.getByTestId('path')).toHaveTextContent('/catalog/extensions/50')
  expect(screen.getByRole('button', { name: 'Créer la collection' })).toBeEnabled()
  expect(screen.getByRole('dialog')).not.toHaveTextContent(code)
  if (code === 'invalid_name') expect(screen.getByLabelText('Nom de la collection')).toHaveFocus()
})
