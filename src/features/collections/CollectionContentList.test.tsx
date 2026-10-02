import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getUserPreferences } from '../../services/view-preferences'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { getCollectionOverview, CollectionsError } from '../../services/collections'
import { getCollectionContent } from '../../services/collection-content'
import { getVariantDetail } from '../../services/variant-detail'
import { listCollectionItemOrder, moveCollectionItem } from '../../services/collection-items'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, updatePhysicalCopy, type PhysicalCopy } from '../../services/physical-copies'
import type { CollectionContentItem } from '../../types/collection-content'
import type { CollectionOverview } from '../../types/collections'
import { CollectionPage } from './CollectionPage'
import { CollectionContentRow } from './CollectionContentRow'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from './collection-query'
import { physicalCopiesKey } from '../physical-copies/physical-copies-query'

const auth = vi.hoisted(() => ({ user: { id: 'viewer' }, isAuthorized: true }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn().mockResolvedValue(DEFAULT_USER_PREFERENCES), saveUserPreferences: vi.fn() }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(), getCollectionOverview: vi.fn() }))
vi.mock('../../services/collection-content', () => ({ getCollectionContent: vi.fn() }))
vi.mock('../../services/variant-detail', () => ({ getVariantDetail: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(), listCollectionItemOrder: vi.fn(), moveCollectionItem: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn(), createPhysicalCopy: vi.fn(), updatePhysicalCopy: vi.fn(), deletePhysicalCopy: vi.fn() }))

const id = 'c1200000-0000-0000-0000-000000000001'
const bigId = '9007199254740995'
const overview: CollectionOverview = { collectionId: id, ownerId: 'viewer', name: 'Favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 2 }
const first: CollectionContentItem = { collectionItemId: 'first', variantId: bigId, cardNameFr: 'Pikachu', setNameFr: 'Extension', setAbbreviationFr: null, setAbbreviation: 'EXT', seriesNameFr: 'Soleil et Lune', seriesNameSource: 'Sun & Moon', localId: '025', variantLabel: 'Holo', imageUrl: 'https://images.pokemontcg.io/base1/58.png', origin: 'automatic', owned: false }
const second: CollectionContentItem = { ...first, collectionItemId: 'second', variantId: '42', cardNameFr: 'Évoli', imageUrl: null, owned: true }
const get = vi.mocked(getCollectionOverview), content = vi.mocked(getCollectionContent)
const order = vi.mocked(listCollectionItemOrder), move = vi.mocked(moveCollectionItem)
const copies = vi.mocked(listPhysicalCopies), create = vi.mocked(createPhysicalCopy), remove = vi.mocked(deletePhysicalCopy)
let rows: PhysicalCopy[]
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  vi.mocked(getUserPreferences).mockResolvedValue(DEFAULT_USER_PREFERENCES)
  auth.user = { id: 'viewer' }; auth.isAuthorized = true; rows = []
  get.mockReset().mockResolvedValue(overview)
  content.mockReset().mockResolvedValue([first, second])
  order.mockReset().mockResolvedValue(['second', 'first']) // Must not reorder the visible content.
  move.mockReset().mockResolvedValue(undefined)
  copies.mockReset().mockImplementation(() => Promise.resolve([...rows]))
  create.mockReset().mockImplementation(() => { rows.push({ id: `copy-${rows.length}`, name: null, note: null, created_at: '2026-09-25T00:00:00Z' }); return Promise.resolve() })
  remove.mockReset().mockImplementation(copyId => { rows = rows.filter(copy => copy.id !== copyId); return Promise.resolve() })
  vi.mocked(updatePhysicalCopy).mockReset().mockResolvedValue(undefined)
  vi.mocked(getVariantDetail).mockReset().mockResolvedValue({ variantId: bigId, cardNameFr: 'Nom catalogue', imageUrl: null,
    localId: null, setNameFr: null, setNameSource: null, setAbbreviationFr: null, setAbbreviation: null,
    seriesNameFr: null, seriesNameSource: null, rarity: null, category: null, variantLabel: null, variantType: null,
    variantSubtype: null, variantSize: null, variantFoil: null, variantStamps: [], effectiveReleaseDate: null, dateOrigin: 'unknown' })
})
function LocationProbe() { return <output aria-label="Route">{useLocation().pathname}</output> }
function setup(initialView: 'list' | 'cards' = 'list') {
  vi.mocked(getUserPreferences).mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, collectionDefaultView: initialView })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/collections/${id}`]}><Routes>
    <Route path="/collections/:collectionId" element={<><LocationProbe /><CollectionPage /></>} />
  </Routes></MemoryRouter></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}
const region = () => screen.getByRole('region', { name: 'Contenu de la collection' })
const contentRows = () => within(region()).getAllByRole('listitem')

test.each([['owned', 'list'], ['shared', 'list'], ['owned', 'cards'], ['shared', 'cards']] as const)('main trigger preserves context and route, separate copies shortcut: %s/%s', async (access, view) => {
  get.mockResolvedValue({ ...overview, access, ownerId: access === 'owned' ? 'viewer' : 'real-owner' })
  // Wait for the real lazy chunk as well as the content query under suite load.
  setup(view); await screen.findByText('Pikachu · EXT · 025', {}, { timeout: 5000 })
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'pikachu soleil' } })
  const opener = screen.getByRole('button', { name: /^Voir le détail de Pikachu/  })
  expect(opener.querySelector('button')).toBeNull()
  opener.focus(); fireEvent.click(opener)
  await screen.findByRole('heading', { name: 'Nom catalogue' })
  await screen.findByText('Aucun exemplaire.')
  expect(vi.mocked(getVariantDetail)).toHaveBeenCalledExactlyOnceWith(bigId)
  expect(copies).toHaveBeenCalledExactlyOnceWith(access === 'owned' ? 'viewer' : 'real-owner', bigId)
  expect(within(screen.getByRole('dialog')).queryByText('Pikachu')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Route')).toHaveTextContent(`/collections/${id}`)
  fireEvent.click(screen.getByRole('button', { name: 'Fermer le détail' }))
  expect(opener).toHaveFocus(); expect(search).toHaveValue('pikachu soleil')
  expect(contentRows()).toHaveLength(1); expect(contentRows()[0]).toHaveTextContent('Pikachu')
  expect(content).toHaveBeenCalledTimes(1); expect(move).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: `${access === 'owned' ? 'Gérer' : 'Consulter'} les exemplaires de Pikachu${view === 'cards' ? ' · Holo' : ''}` }))
  await screen.findByRole('dialog', { name: access === 'owned' ? 'Mes exemplaires' : 'Exemplaires' })
  expect(vi.mocked(getVariantDetail)).toHaveBeenCalledTimes(1)
})

test.each([['owned', 'list'], ['shared', 'list'], ['owned', 'cards'], ['shared', 'cards']] as const)('local search, clear focus and full restoration for %s/%s', async (access, view) => {
  get.mockResolvedValue({ ...overview, access, ownerId: access === 'owned' ? 'viewer' : 'real-owner' })
  setup(view); await screen.findByText('Pikachu · EXT · 025')
  const input = within(region()).getByRole('searchbox', { name: 'Rechercher dans la collection…' })
  expect(input).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).not.toBeInTheDocument()
  if (access === 'owned') await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false'))
  const orderReads = order.mock.calls.length
  input.focus(); fireEvent.change(input, { target: { value: 'pikachu soleil EXT' } })
  expect(contentRows()).toHaveLength(1)
  expect(contentRows()[0]).toHaveTextContent('Pikachu')
  if (access === 'owned' && view === 'list') {
    const handle = screen.getByRole('button', { name: 'Déplacer Pikachu' })
    expect(handle).toHaveAttribute('aria-disabled', 'true')
    expect(handle).toHaveAccessibleDescription('Effacez la recherche pour réorganiser la collection.')
    fireEvent.keyDown(handle, { key: ' ', keyCode: 32 })
    expect(move).not.toHaveBeenCalled()
  } else if (access === 'shared') {
    expect(screen.queryByRole('button', { name: /Déplacer|Ajouter une carte|Actions de/ })).not.toBeInTheDocument()
  } else {
    expect(screen.queryByRole('button', { name: /Déplacer/ })).not.toBeInTheDocument()
  }
  expect(screen.getByRole('button', { name: `${access === 'owned' ? 'Gérer' : 'Consulter'} les exemplaires de Pikachu${view === 'cards' ? ' · Holo' : ''}` })).toBeEnabled()
  fireEvent.change(input, { target: { value: 'aucun résultat' } })
  expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  expect(screen.queryByText('Cette collection ne contient encore aucune carte.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
  expect(input).toHaveValue(''); expect(input).toHaveFocus()
  expect(contentRows().map(row => row.querySelector('.collection-content-name')?.textContent)).toEqual(['Pikachu · EXT · 025', 'Évoli · EXT · 025'])
  if (access === 'owned') expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false')
  expect(content).toHaveBeenCalledTimes(1)
  expect(order).toHaveBeenCalledTimes(orderReads)
})

test('matching all cards keeps reorder; current query applies to authoritative added/removed rows', async () => {
  const { client } = setup(); await screen.findByText('Pikachu · EXT · 025')
  const input = within(region()).getByRole('searchbox')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false'))
  fireEvent.change(input, { target: { value: 'EXT' } })
  expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false')
  fireEvent.change(input, { target: { value: 'Pikachu' } })
  const added = { ...first, collectionItemId: 'added', variantId: '43', cardNameFr: 'Pikachu ex' }
  content.mockResolvedValue([second, added, first])
  await act(async () => { await client.invalidateQueries({ queryKey: collectionContentKey('viewer', id), exact: true }) })
  await waitFor(() => expect(contentRows().map(row => row.querySelector('.collection-content-name')?.textContent)).toEqual(['Pikachu ex · EXT · 025', 'Pikachu · EXT · 025']))
  content.mockResolvedValue([second, added])
  await act(async () => { await client.invalidateQueries({ queryKey: collectionContentKey('viewer', id), exact: true }) })
  await waitFor(() => expect(contentRows()).toHaveLength(1)); expect(contentRows()[0]).toHaveTextContent('Pikachu ex')
  expect(input).toHaveValue('Pikachu')
})

test('query on an actually empty collection retains the empty-collection message', async () => {
  content.mockResolvedValue([])
  setup(); await screen.findByText('Cette collection ne contient encore aucune carte.')
  fireEvent.change(within(region()).getByRole('searchbox'), { target: { value: 'Pikachu' } })
  expect(screen.getByText('Cette collection ne contient encore aucune carte.')).toBeVisible()
  expect(screen.queryByText('Aucune carte ne correspond à cette recherche.')).not.toBeInTheDocument()
})

test('content waits for authorized overview, then loading and exact content key', async () => {
  let finishOverview!: (value: CollectionOverview) => void, finishContent!: (value: CollectionContentItem[]) => void
  get.mockReturnValue(new Promise(resolve => { finishOverview = resolve }))
  content.mockReturnValue(new Promise(resolve => { finishContent = resolve }))
  const { client } = setup()
  expect(content).not.toHaveBeenCalled()
  await act(() => { finishOverview(overview); return Promise.resolve() })
  expect(await screen.findByText('Chargement des cartes…')).toBeVisible()
  await waitFor(() => expect(content).toHaveBeenCalledExactlyOnceWith(id))
  await act(() => { finishContent([first]); return Promise.resolve() })
  expect(await screen.findByText('Pikachu · EXT · 025')).toBeVisible()
  expect(client.getQueryData(collectionContentKey('viewer', id))).toEqual([first])
})

test.each(['unauthorized', 'unavailable'] as const)('%s overview never starts content', async mode => {
  if (mode === 'unauthorized') auth.isAuthorized = false
  else get.mockRejectedValue(new CollectionsError('collection_unavailable'))
  setup()
  if (mode === 'unavailable') await screen.findByRole('heading', { name: 'Collection indisponible' })
  expect(content).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: 'Contenu de la collection' })).not.toBeInTheDocument()
})

test('content failure is sanitized, retry accepts [] without declaring collection unavailable', async () => {
  content.mockRejectedValueOnce(new Error('private backend')).mockResolvedValueOnce([])
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les cartes')
  expect(screen.queryByText(/private backend/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(await screen.findByText('Cette collection ne contient encore aucune carte.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Favoris' })).toBeVisible()
  expect(content).toHaveBeenCalledTimes(2)
})

test.each(['list', 'cards'] as const)('backend order, ownership visuals, enabled controls and masked status: %s', async view => {
  setup(view); await screen.findByText('Pikachu · EXT · 025')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false'))
  const [missing, owned] = contentRows()
  expect(missing).toHaveTextContent('Pikachu'); expect(owned).toHaveTextContent('Évoli')
  expect(missing!.querySelector('.collection-content-row')).toHaveClass('is-missing')
  expect(owned!.querySelector('.collection-content-row')).not.toHaveClass('is-missing')
  expect(within(missing!).getByText('Carte manquante')).toHaveClass('visually-hidden')
  expect(within(owned!).getByText('Carte possédée')).toHaveClass('visually-hidden')
  expect(screen.getAllByRole('button', { name: /Gérer les exemplaires de/ })).toHaveLength(2)
  expect(screen.getByRole('button', { name: /^Gérer les exemplaires de Pikachu/  })).toBeEnabled()
  expect(within(region()).queryByText(/^(Possédée|Manquante|automatic|manual|origin|…|\.\.\.)$/)).not.toBeInTheDocument()
  expect(within(region()).queryByRole('button', { name: /Enregistrer|reset|Réinitialiser|Actions de/ })).not.toBeInTheDocument()
  expect(within(region()).queryByRole('link')).not.toBeInTheDocument()
})

test.each([
  ['HER', 'ASC', '28', 'Pikachu · HER (ASC) · 28'],
  [null, 'ASC', '28', 'Pikachu · ASC · 28'],
  ['HER', null, '28', 'Pikachu · HER · 28'],
  ['ASC', 'ASC', '28', 'Pikachu · ASC · 28'],
  [null, 'SLG', '28/73', 'Pikachu · SLG · 28/73'],
  [null, 'EXT', null, 'Pikachu · EXT'], [null, null, '025', 'Pikachu · 025'], [null, null, null, 'Pikachu'],
])('compact title %s / %s / %s', (setAbbreviationFr, setAbbreviation, localId, expected) => {
  const { container } = render(<CollectionContentRow item={{ ...first, setAbbreviationFr, setAbbreviation, localId }} readOnly={false} onCopies={() => {}} onDetail={() => {}} />)
  expect(container.querySelector('.collection-content-name')).toHaveTextContent(expected)
  expect(screen.queryByText('Extension')).not.toBeInTheDocument()
  expect(container.querySelector('.collection-content-variant')).toHaveTextContent('Holo')
  expect(container.querySelector('.collection-content-info')?.children).toHaveLength(2)
})

test('name fallback, optional variant, exact image URL and graphical missing/broken image', () => {
  const view = render(<CollectionContentRow item={first} readOnly={false} onCopies={() => {}} onDetail={() => {}} />)
  expect(screen.getByText('Holo')).toBeVisible()
  const image = screen.getByRole('img', { name: 'Pikachu' })
  expect(image).toHaveAttribute('src', first.imageUrl)
  fireEvent.error(image)
  expect(screen.getByRole('img', { name: 'Image indisponible' }).tagName).toBe('IMG')
  view.rerender(<CollectionContentRow item={{ ...first, imageUrl: null, cardNameFr: null, variantLabel: null }} readOnly onCopies={() => {}} onDetail={() => {}} />)
  expect(screen.getByText('Nom indisponible · EXT · 025')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Consulter les exemplaires de Nom indisponible' })).toBeEnabled()
  expect(screen.queryByText('Holo')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Image indisponible' })).toBeInTheDocument()
})

test('Cards reuses exact image/placeholder, keeps variant visible, actions separate and ownership authoritative', () => {
  const detail = vi.fn(), copiesAction = vi.fn(), removal = vi.fn()
  const tile = (item: CollectionContentItem, readOnly = false) => <CollectionContentRow item={item} view="cards"
    readOnly={readOnly} onDetail={detail} onCopies={copiesAction} onRemove={removal} />
  const { container, rerender } = render(tile({ ...first, origin: 'manual' }))
  expect(screen.getByRole('img', { name: 'Pikachu' })).toHaveAttribute('src', first.imageUrl)
  expect(screen.getByText('Holo')).toBeVisible()
  expect(container.querySelector('.collection-content-card')).toHaveClass('is-missing')
  const overlay = container.querySelector<HTMLDivElement>('.collection-card-image-overlay')!
  expect(overlay).toContainElement(screen.getByRole('button', { name: /^Gérer les exemplaires de Pikachu/ }))
  expect(overlay).toContainElement(screen.getByRole('button', { name: /^Actions de Pikachu/ }))
  expect(container.querySelector('.collection-detail-trigger')).not.toContainElement(overlay)
  expect(container.querySelector('.collection-content-image')).not.toContainElement(overlay)
  fireEvent.error(screen.getByRole('img', { name: 'Pikachu' }))
  expect(screen.getByRole('img', { name: 'Image indisponible' }).tagName).toBe('IMG')
  fireEvent.click(screen.getByRole('button', { name: /^Gérer les exemplaires de Pikachu/  }))
  expect(copiesAction).toHaveBeenCalledOnce(); expect(detail).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^Actions de Pikachu/  }))
  fireEvent.click(screen.getByRole('button', { name: 'Retirer de la collection' }))
  expect(removal).toHaveBeenCalledOnce(); expect(detail).not.toHaveBeenCalled()
  rerender(tile({ ...first, owned: true, origin: 'automatic' }))
  expect(container.querySelector('.collection-content-card')).not.toHaveClass('is-missing')
  expect(screen.queryByRole('button', { name: /^Actions de Pikachu/  })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Voir le détail de Pikachu/  }))
  expect(detail).toHaveBeenCalledOnce()
  rerender(tile({ ...first, imageUrl: null, variantLabel: null, origin: 'manual' }, true))
  expect(screen.getByText('Variante indisponible')).toBeVisible()
  expect(screen.getByRole('img', { name: 'Image indisponible' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Actions de Pikachu/  })).not.toBeInTheDocument()
})

test.each([false, true])('shared copies (present=%s) use real owner; no DnD or write controls, notes readable', async present => {
  get.mockResolvedValue({ ...overview, access: 'shared', ownerId: 'real-owner' })
  if (present) rows = [{ id: 'copy', name: 'Cadeau', note: 'Recto intact', created_at: '2026-09-25T00:00:00Z' }]
  setup(); await screen.findByText('Pikachu · EXT · 025')
  expect(order).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Déplacer/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Consulter les exemplaires de Pikachu' }))
  await screen.findByText(present ? 'Cadeau' : 'Aucun exemplaire.')
  expect(copies).toHaveBeenCalledExactlyOnceWith('real-owner', bigId)
  if (present) {
    fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Cadeau' }))
    expect(screen.getByText('Recto intact')).toBeVisible()
  }
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Ajouter|Modifier|Supprimer|Actions de/ })).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

test('BIGINT line -> full dialog -> first/second copy -> delete to zero; owned comes from refetch', async () => {
  content.mockImplementation(() => Promise.resolve([{ ...first, owned: rows.length > 0 }]))
  const { client } = setup(); await screen.findByText('Pikachu · EXT · 025')
  expect(client.getQueryData<CollectionContentItem[]>(collectionContentKey('viewer', id))?.[0]?.variantId).toBe(bigId)
  const opener = screen.getByRole('button', { name: /^Gérer les exemplaires de Pikachu/  })
  opener.focus(); fireEvent.click(opener)
  await screen.findByText('Aucun exemplaire.')
  expect(copies).toHaveBeenCalledExactlyOnceWith('viewer', bigId)
  for (let count = 1; count <= 2; count++) {
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemplaire' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await screen.findByText(`Exemplaire ${count}`)
    await waitFor(() => expect(screen.getByText('Carte possédée')).toBeInTheDocument())
    expect(create).toHaveBeenLastCalledWith(bigId, '', '')
  }
  // Editing copy metadata must not refresh owned.
  const reads = content.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Actions de Exemplaire 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await screen.findByText('Exemplaire 1')
  expect(content).toHaveBeenCalledTimes(reads)
  for (let count = 1; count >= 0; count--) {
    fireEvent.click(screen.getByRole('button', { name: 'Actions de Exemplaire 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await screen.findByText(count ? 'Exemplaire 1' : 'Aucun exemplaire.')
    await waitFor(() => expect(screen.getByText(count ? 'Carte possédée' : 'Carte manquante')).toBeInTheDocument())
  }
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(opener).toHaveFocus()
})

test.each([[false, 'list'], [true, 'list'], [false, 'cards'], [true, 'cards']] as const)('real keyboard reorder refetches content on uncertainty=%s / %s', async (fail, view) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('li'), index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    return DOMRect.fromRect(view === 'list' ? { x: 0, y: index * 80, width: 300, height: row ? 80 : 160 }
      : { x: row ? index * 200 : 0, y: 0, width: row ? 180 : 400, height: 280 })
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  const { client } = setup(view); await screen.findByText('Pikachu · EXT · 025')
  const handle = screen.getByRole('button', { name: 'Déplacer Pikachu' })
  await waitFor(() => expect(handle).toHaveAttribute('aria-disabled', 'false'))
  const other = collectionContentKey('other-viewer', id)
  client.setQueryData(other, [first, second])
  content.mockResolvedValue([second, first])
  if (fail) move.mockRejectedValue(new Error('uncertain private error'))
  const transitions: { order: string[]; state: string | undefined }[] = []
  const observer = new MutationObserver(() => transitions.push({
    order: contentRows().map(row => row.querySelector('.collection-reorder-handle')?.getAttribute('aria-label') ?? ''),
    state: handle.dataset.state,
  }))
  observer.observe(handle.closest('ul')!, { subtree: true, childList: true, attributes: true })
  const key = (value: string, keyCode: number) => fireEvent.keyDown(handle, { key: value, keyCode, which: keyCode })
  handle.focus(); key(' ', 32)
  await screen.findByText(/Pikachu : carte sélectionnée/)
  key(view === 'list' ? 'ArrowDown' : 'ArrowRight', view === 'list' ? 40 : 39); await screen.findByText(/Pikachu, position 2/)
  key(' ', 32); fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith(id, { itemId: 'first', destination: { placement: 'after', anchorId: 'second' } }))
  await waitFor(() => expect(contentRows()[0]).toHaveTextContent('Évoli'))
  expect(content).toHaveBeenCalledTimes(2); expect(order).toHaveBeenCalledTimes(2)
  expect(client.getQueryState(other)?.isInvalidated).toBe(false)
  if (fail) expect(await screen.findByText(/Le déplacement n’a pas pu être confirmé/)).toBeVisible()
  else {
    await waitFor(() => expect(handle).toHaveAttribute('data-state', 'success'))
    expect(transitions.filter(event => event.state === 'pending' || event.state === 'success').map(event => event.order))
      .not.toContainEqual(['Déplacer Pikachu', 'Déplacer Évoli'])
  }
  observer.disconnect()
  if (view === 'cards') {
    fireEvent.click(screen.getByRole('button', { name: 'Liste' }))
    expect(contentRows().map(row => row.querySelector('.collection-content-name')?.textContent))
      .toEqual(['Évoli · EXT · 025', 'Pikachu · EXT · 025'])
    expect(content).toHaveBeenCalledTimes(2)
  }
})

test('order read error is accessible beside the list and refresh restores handles', async () => {
  order.mockRejectedValueOnce(new Error('private server details'))
  setup()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Impossible d’actualiser l’ordre des cartes. Réessayez.')
  expect(alert.closest('.collection-item-reorder')).toBeInTheDocument()
  expect(screen.queryByText('private server details')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Actualiser l’ordre' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(order).toHaveBeenCalledTimes(2)
  expect(move).not.toHaveBeenCalled()
})

test('revoked overview removes visible cached rows, open notes/dialog, and private caches', async () => {
  get.mockResolvedValue({ ...overview, access: 'shared', ownerId: 'real-owner' })
  rows = [{ id: 'copy', name: 'Secret', note: 'Note privée', created_at: '2026-09-25T00:00:00Z' }]
  const { client } = setup(); await screen.findByText('Pikachu · EXT · 025')
  fireEvent.click(screen.getByRole('button', { name: 'Consulter les exemplaires de Pikachu' }))
  await screen.findByText('Secret')
  fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Secret' }))
  get.mockRejectedValue(new CollectionsError('collection_unavailable'))
  await act(async () => { await client.invalidateQueries({ queryKey: collectionOverviewKey('viewer', id), exact: true }) })
  await screen.findByRole('heading', { name: 'Collection indisponible' })
  for (const text of ['Pikachu · EXT · 025', 'Secret', 'Note privée']) expect(screen.queryByText(text)).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const key of [collectionContentKey('viewer', id), collectionItemOrderKey('viewer', id), physicalCopiesKey('viewer', 'real-owner', bigId)]) expect(client.getQueryData(key)).toBeUndefined()
})

test('logout and viewer switch never show previous private rows', async () => {
  const { rerender } = setup(); await screen.findByText('Pikachu · EXT · 025')
  auth.isAuthorized = false; rerender()
  expect(screen.queryByText('Pikachu · EXT · 025')).not.toBeInTheDocument()
  auth.user = { id: 'next-viewer' }; auth.isAuthorized = true
  get.mockReturnValue(new Promise(() => {})); rerender()
  expect(screen.queryByText('Pikachu · EXT · 025')).not.toBeInTheDocument()
  expect(content).toHaveBeenCalledTimes(1)
})
