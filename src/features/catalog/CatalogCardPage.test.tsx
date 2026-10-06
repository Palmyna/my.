import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { CatalogError, getCatalogCard, getCatalogPokemon, getCatalogSet } from '../../services/catalog'
import { findOwnedAutomaticCollection } from '../../services/collections'
import { getUserPreferences, saveUserPreferences } from '../../services/view-preferences'
import { getVariantDetail, VariantDetailError } from '../../services/variant-detail'
import { listPhysicalCopies } from '../../services/physical-copies'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import * as catalogIdentity from '../../lib/catalog-identity'
import { catalogCard, catalogPokemon, catalogSet } from '../../test/catalog-fixtures'
import type { CatalogCard } from '../../types/catalog'
import { catalogCardKey } from './catalog-query'
import { CatalogCardPage } from './CatalogCardPage'
import { CatalogPokemonPage } from './CatalogPokemonPage'
import { CatalogSetPage } from './CatalogSetPage'

const viewer = 'c1200000-0000-0000-0000-000000000099'
const auth = vi.hoisted(() => ({ user: { id: 'c1200000-0000-0000-0000-000000000099' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/catalog', async original => ({ ...await original<typeof import('../../services/catalog')>(),
  getCatalogCard: vi.fn(), getCatalogPokemon: vi.fn(), getCatalogSet: vi.fn() }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(), findOwnedAutomaticCollection: vi.fn() }))
vi.mock('../../services/variant-detail', async original => ({ ...await original<typeof import('../../services/variant-detail')>(), getVariantDetail: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), saveUserPreferences: vi.fn() }))
const read = vi.mocked(getCatalogCard)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  auth.isAuthorized = true; auth.user.id = viewer
  read.mockReset().mockResolvedValue(catalogCard)
  vi.mocked(getCatalogPokemon).mockReset().mockResolvedValue(catalogPokemon)
  vi.mocked(getCatalogSet).mockReset().mockResolvedValue(catalogSet)
  vi.mocked(findOwnedAutomaticCollection).mockReset().mockResolvedValue(null)
  vi.mocked(getUserPreferences).mockReset().mockResolvedValue(DEFAULT_USER_PREFERENCES)
  vi.mocked(saveUserPreferences).mockReset().mockImplementation((_id, patch) => Promise.resolve({ ...DEFAULT_USER_PREFERENCES, ...patch }))
  vi.mocked(getVariantDetail).mockReset().mockRejectedValue(new VariantDetailError('variant_unavailable'))
  vi.mocked(listPhysicalCopies).mockReset().mockResolvedValue([])
})
function History() {
  const navigate = useNavigate()
  return <><span data-testid="path">{useLocation().pathname}</span><button onClick={() => void navigate(-1)}>Retour navigateur</button></>
}
function setup(path = `/catalog/cards/${catalogCard.sourceCardId}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/catalog/cards/:cardId" element={<CatalogCardPage />} />
      <Route path="/catalog/extensions/:setId" element={<CatalogSetPage />} />
      <Route path="/catalog/pokemon/:pokemonId" element={<CatalogPokemonPage />} />
      <Route path="/dashboard" element={<h1>Collections</h1>} />
    </Routes><History />
  </MemoryRouter></QueryClientProvider>)
  return { ...result, client }
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
async function loaded() { await screen.findByRole('heading', { name: catalogCard.nameFr!, level: 1 }) }

test('loading, private stable key, ID unchanged and title without stealing focus', async () => {
  let resolve!: (value: CatalogCard) => void
  read.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const { client } = setup()
  expect(screen.getByText('Chargement de la carte…')).toHaveAttribute('role', 'status')
  const target = screen.getByRole('button', { name: 'Retour navigateur' }); target.focus()
  await act(async () => { resolve(catalogCard); await Promise.resolve() }); await loaded()
  expect(target).toHaveFocus(); expect(document.title).toBe('Duo électrique — MY.')
  expect(read).toHaveBeenCalledExactlyOnceWith('300')
  expect(client.getQueryData(catalogCardKey(viewer, '300'))).toEqual(catalogCard)
  expect(client.getQueryData(catalogCardKey('other-viewer', '300'))).toBeUndefined()
  expect(getCatalogSet).not.toHaveBeenCalled(); expect(getCatalogPokemon).not.toHaveBeenCalled()
  expect(findOwnedAutomaticCollection).not.toHaveBeenCalled()
})
test('unauthorized reads nothing', () => {
  auth.isAuthorized = false; setup()
  expect(read).not.toHaveBeenCalled(); expect(getUserPreferences).not.toHaveBeenCalled()
})
test.each(['invalid', '300'])('unavailable %s has safe dashboard navigation', async id => {
  read.mockRejectedValue(new CatalogError('catalog_unavailable')); setup(`/catalog/cards/${id}`)
  await screen.findByText('Cette carte n’est pas disponible dans le catalogue.')
  const link = screen.getByRole('link', { name: 'Revenir aux collections' })
  expect(link).toHaveAttribute('href', '/dashboard'); fireEvent.click(link)
  await screen.findByRole('heading', { name: 'Collections' })
})
test('technical error and retry hide backend messages', async () => {
  read.mockRejectedValueOnce(new Error('42501 Supabase private payload')).mockResolvedValue(catalogCard); setup()
  await screen.findByText('Impossible de charger cette carte.')
  expect(screen.queryByText(/42501|Supabase|private payload/)).not.toBeInTheDocument()
  press('Réessayer'); await loaded(); expect(read).toHaveBeenCalledTimes(2)
})
test('reference: one h1, shared Card resolver, semantic metadata, backend image, no search or collection CTA', async () => {
  const resolve = vi.spyOn(catalogIdentity, 'resolveCardIdentity')
  const { container } = setup(); await loaded()
  const header = container.querySelector('header')!
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Versions', level: 2 })).toBeVisible()
  expect(within(header).getByRole('img', { name: catalogCard.nameFr! })).toHaveAttribute('src', catalogCard.imageUrl)
  for (const text of ['EV05 (TEF) · 025/165', 'Rare', 'Écarlate et Violet', '22 mars 2024', '3 versions']) {
    expect(within(header).getByText(text, { exact: true })).toBeVisible()
  }
  expect(header.querySelector('time')).toHaveAttribute('datetime', '2024-03-22')
  expect(within(header).queryByText(/^\d+ cartes?$/)).not.toBeInTheDocument()
  expect(header.querySelectorAll('dl dt')).toHaveLength(5)
  expect(within(header).getByRole('link', { name: 'Forces Temporelles' })).toHaveAttribute('href', '/catalog/extensions/50')
  expect(within(header).queryByText('Pokémon associés')).not.toBeInTheDocument()
  const links = within(header).getByRole('group', { name: 'Pokémon' })
  expect(within(links).getByRole('link', { name: 'Pikachu' })).toHaveAttribute('href', '/catalog/pokemon/800')
  expect(within(links).getByRole('link', { name: 'Raichu' })).toHaveAttribute('href', '/catalog/pokemon/801')
  const theme = container.querySelector<HTMLElement>('.catalog-themed')!, identity = catalogIdentity.resolveCardIdentity(catalogCard.pokemon)
  expect(resolve).toHaveBeenCalledWith(catalogCard.pokemon)
  expect(theme.style.getPropertyValue('--catalog-accent')).toBe(identity.primaryAccent)
  expect(theme.style.getPropertyValue('--catalog-gradient')).toBe(identity.gradient)
  expect(header.querySelector('.catalog-types')).toBeNull()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Créer ma collection|Ouvrir ma collection/ })).not.toBeInTheDocument()
  expect(findOwnedAutomaticCollection).not.toHaveBeenCalled()
})
test.each([null, 'https://assets.example/broken.webp'])('common representative fallback for %s preserves named alternative', async imageUrl => {
  read.mockResolvedValue({ ...catalogCard, imageUrl }); const { container } = setup(); await loaded()
  const image = container.querySelector('header img')!
  if (imageUrl) { expect(image).toHaveAttribute('src', imageUrl); fireEvent.error(image) }
  expect(image.getAttribute('src')).toContain('card-placeholder.webp')
  expect(image.getAttribute('alt')).toBe('Duo électrique — image indisponible')
  expect(image.getAttribute('src')).not.toBe(catalogCard.variants[0]!.imageUrl)
})
test.each([
  ['EV05', 'EV05', 'EV05'], ['EV05', null, 'EV05'], [null, 'TEF', 'TEF'], [null, null, null],
])('missing metadata omitted, FR/source %s/%s and single version', async (fr, source, abbreviation) => {
  read.mockResolvedValue({ ...catalogCard, localId: null, rarity: null, category: null, effectiveReleaseDate: null,
    series: { ...catalogCard.series, nameFr: null, nameSource: null }, pokemon: [], variants: catalogCard.variants.slice(0, 1),
    set: { ...catalogCard.set, abbreviationFr: fr, abbreviation: source } })
  const { container } = setup(); await loaded(); const header = container.querySelector('header')!
  expect(within(header).getByText('1 version')).toBeVisible()
  expect(within(header).queryByText(/^\d+ cartes?$/)).not.toBeInTheDocument()
  expect(header.querySelectorAll('dt')).toHaveLength(1)
  expect(header.querySelector('time, .catalog-card-pokemon')).toBeNull()
  if (abbreviation) expect(within(header).getByText(abbreviation)).toBeVisible()
  else expect(header.querySelector('.catalog-card-reference-context')).toBeNull()
  expect(within(header).queryByText(/^(—|N\/A|Inconnu)$/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Versions', level: 2 })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Vue du catalogue' })).toBeVisible()
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
  press('Cartes'); expect(screen.getByRole('list')).toHaveClass('catalog-variants-cards')
})
test('source metadata fallbacks and unnamed associations omitted without fabricated data', async () => {
  read.mockResolvedValue({ ...catalogCard, set: { ...catalogCard.set, nameFr: null },
    series: { ...catalogCard.series, nameFr: null }, pokemon: [{ ...catalogCard.pokemon[0]!, nameFr: null }] })
  const { container } = setup(); await loaded()
  expect(screen.getByRole('link', { name: 'Temporal Forces' })).toBeVisible()
  expect(screen.getByText('Scarlet & Violet')).toBeVisible()
  expect(container.querySelector('.catalog-card-pokemon')).toBeNull()
})
test.each(['Pokémon', 'Trainer', 'Energy'])('category %s and optional associations', async category => {
  read.mockResolvedValue({ ...catalogCard, category, pokemon: category === 'Pokémon' ? catalogCard.pokemon.slice(0, 1) : [] })
  const { container } = setup(); await loaded()
  expect(within(container.querySelector('header')!).getByText(category, { selector: 'dd', exact: true })).toBeVisible()
  expect(screen.queryAllByRole('link', { name: 'Pikachu' })).toHaveLength(category === 'Pokémon' ? 1 : 0)
  expect(screen.queryByRole('link', { name: 'Raichu' })).not.toBeInTheDocument()
})
test.each(['list', 'cards'] as const)('global default %s opens without a write; versions keep backend order and own images', async view => {
  vi.mocked(getUserPreferences).mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, catalogDefaultView: view })
  const { container } = setup(); await loaded()
  const list = screen.getByRole('list', { name: 'Versions du catalogue' })
  await waitFor(() => expect(list).toHaveClass(`catalog-variants-${view}`))
  expect(screen.getByRole('button', { name: view === 'list' ? 'Liste' : 'Cartes' })).toHaveAttribute('aria-pressed', 'true')
  expect(saveUserPreferences).not.toHaveBeenCalled()
  const rows = within(list).getAllByRole('listitem')
  expect(rows.map(row => row.querySelector('.catalog-variant-label')!.textContent)).toEqual(['Reverse', 'Holo', 'Variante indisponible'])
  expect(rows[0]!.querySelector('img')).toHaveAttribute('src', catalogCard.variants[0]!.imageUrl)
  expect(rows[1]!.querySelector('img')).toHaveAttribute('src', catalogCard.variants[1]!.imageUrl)
  expect(rows[2]!.querySelector('img')!.getAttribute('src')).toContain('card-placeholder.webp')
  expect(rows[0]!.querySelector('time')).toBeNull()
  if (view === 'list') expect(within(rows[1]!).getByText('1 avril 2024')).toHaveAttribute('datetime', '2024-04-01')
  else expect(rows[1]!.querySelector('time')).toBeNull()
  expect(list.querySelectorAll('a')).toHaveLength(0)
  if (view === 'list') {
    expect(within(list).queryByText(catalogCard.nameFr!)).not.toBeInTheDocument()
    expect(within(list).queryByText('025/165')).not.toBeInTheDocument()
  } else {
    expect(rows[0]!.querySelector('.catalog-card-line')).toHaveTextContent('Duo électrique · EV05 (TEF) · 025/165')
  }
  expect(container.querySelector('[class*="is-missing"], [class*="owned"], [class*="reorder"], [class*="collection-content-actions"]')).toBeNull()
  for (const text of ['Possédée', 'Manquante', 'Auto', 'Perso', 'Exemplaires', 'Créer ma collection']) expect(within(list).queryByText(text)).not.toBeInTheDocument()
})
test('last-used global view and explicit choice write only lastCatalogView', async () => {
  vi.mocked(getUserPreferences).mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, catalogDefaultView: 'last_used', lastCatalogView: 'cards' })
  setup(); await loaded()
  await waitFor(() => expect(screen.getByRole('list')).toHaveClass('catalog-variants-cards'))
  const button = screen.getByRole('button', { name: 'Liste' }); button.focus(); fireEvent.click(button)
  expect(button).toHaveFocus(); expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('list')).toHaveClass('catalog-variants-list')
  await waitFor(() => expect(saveUserPreferences).toHaveBeenCalledExactlyOnceWith(viewer, { lastCatalogView: 'list' }))
  expect(read).toHaveBeenCalledOnce()
})
test.each(['Liste', 'Cartes'])('existing Detail from %s: exact variant, personal copies, trap, close and Esc focus restoration', async view => {
  setup(); await loaded(); if (view === 'Cartes') press('Cartes')
  const opener = screen.getAllByRole('button', { name: /^Voir le détail/ })[1]!
  opener.focus(); fireEvent.click(opener)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Informations de la carte')).toHaveFocus()
  await within(dialog).findByText('Cette version n’est pas disponible.')
  expect(getVariantDetail).toHaveBeenCalledWith('2')
  await waitFor(() => expect(listPhysicalCopies).toHaveBeenCalledWith(viewer, '2'))
  const add = await within(dialog).findByRole('button', { name: 'Ajouter un exemplaire' })
  add.focus(); fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(within(dialog).getByRole('button', { name: 'Fermer le détail' })).toHaveFocus()
  press('Fermer le détail'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus()
  fireEvent.click(opener); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus()
  expect(screen.getByRole('heading', { name: 'Versions', level: 2 })).toBeVisible()
})
test.each(['Forces Temporelles', 'Pikachu', 'Raichu'])('reference link %s navigates by internal ID without Detail and returns via history', async name => {
  const { container } = setup(); await loaded()
  fireEvent.click(within(container.querySelector('header')!).getByRole('link', { name }))
  await screen.findByRole('searchbox')
  expect(screen.getByTestId('path')).toHaveTextContent(name === 'Forces Temporelles' ? '/catalog/extensions/50' : `/catalog/pokemon/${name === 'Pikachu' ? '800' : '801'}`)
  expect(getVariantDetail).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  press('Retour navigateur'); await loaded()
})
test.each(['Liste', 'Cartes'])('Pokemon result Card/Extension links are independent of Detail in %s', async view => {
  const { container } = setup('/catalog/pokemon/800')
  await screen.findByRole('heading', { name: 'Pikachu', level: 1 }); if (view === 'Cartes') press('Cartes')
  const row = screen.getAllByRole('listitem')[0]!
  const cardLink = within(row).getByRole('link', { name: 'Pikachu' })
  expect(cardLink).toHaveAttribute('href', '/catalog/cards/300')
  expect(within(row).getByRole('link', { name: 'EV (SV)' })).toHaveAttribute('href', '/catalog/extensions/50')
  expect(container.querySelector('button a, a button, a a')).toBeNull()
  fireEvent.click(cardLink); await loaded()
  expect(getVariantDetail).not.toHaveBeenCalled(); press('Retour navigateur')
  await screen.findByRole('heading', { name: 'Pikachu', level: 1 })
  fireEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('link', { name: 'EV (SV)' }))
  await screen.findByRole('heading', { name: 'Forces Temporelles', level: 1 })
  expect(getVariantDetail).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test.each(['Liste', 'Cartes'])('Extension result Card link remains independent of Pokémon links and Detail in %s', async view => {
  const { container } = setup('/catalog/extensions/50')
  await screen.findByRole('heading', { name: 'Forces Temporelles', level: 1 }); if (view === 'Cartes') press('Cartes')
  const row = screen.getAllByRole('listitem')[0]!
  if (view === 'Liste') expect(within(row).getByRole('link', { name: 'Pikachu' })).toHaveAttribute('href', '/catalog/pokemon/800')
  else expect(row.querySelector('.catalog-pokemon-links')).toBeNull()
  const link = within(row).getByRole('link', { name: 'Duo électrique' })
  expect(link).toHaveAttribute('href', '/catalog/cards/300')
  expect(container.querySelector('button a, a button, a a')).toBeNull()
  fireEvent.click(link); await loaded()
  expect(getVariantDetail).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  press('Retour navigateur'); await screen.findByRole('heading', { name: 'Forces Temporelles', level: 1 })
})

test('Pokemon result still links Extension by name when its abbreviations are absent', async () => {
  vi.mocked(getCatalogPokemon).mockResolvedValue({ ...catalogPokemon, variants: catalogPokemon.variants.map(variant => ({
    ...variant, setAbbreviationFr: null, setAbbreviation: null,
  })) })
  setup('/catalog/pokemon/800'); await screen.findByRole('heading', { name: 'Pikachu', level: 1 })
  expect(within(screen.getAllByRole('listitem')[0]!).getByRole('link', { name: 'Écarlate et Violet' }))
    .toHaveAttribute('href', '/catalog/extensions/50')
})
