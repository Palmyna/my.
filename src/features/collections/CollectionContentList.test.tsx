import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { getCollectionOverview, CollectionsError } from '../../services/collections'
import { getCollectionContent } from '../../services/collection-content'
import { listCollectionItemOrder, moveCollectionItem } from '../../services/collection-items'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, updatePhysicalCopy, type PhysicalCopy } from '../../services/physical-copies'
import type { CollectionContentItem } from '../../types/collection-content'
import type { CollectionOverview } from '../../types/collections'
import { CollectionPage } from './CollectionPage'
import { CollectionContentRow } from './CollectionContentRow'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from './collection-query'
import { physicalCopiesKey } from '../physical-copies/physical-copies-query'

const auth = vi.hoisted(() => ({ user: { id: 'viewer' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collections', async original => ({ ...await original<typeof import('../../services/collections')>(), getCollectionOverview: vi.fn() }))
vi.mock('../../services/collection-content', () => ({ getCollectionContent: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(), listCollectionItemOrder: vi.fn(), moveCollectionItem: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn(), createPhysicalCopy: vi.fn(), updatePhysicalCopy: vi.fn(), deletePhysicalCopy: vi.fn() }))

const id = 'c1200000-0000-0000-0000-000000000001'
const bigId = '9007199254740995'
const overview: CollectionOverview = { collectionId: id, ownerId: 'viewer', name: 'Favoris', collectionType: 'free', access: 'owned', targetType: null, targetName: null, ownedCount: 0, totalCount: 2 }
const first: CollectionContentItem = { collectionItemId: 'first', variantId: bigId, cardNameFr: 'Pikachu', setNameFr: 'Extension', localId: '025', variantLabel: 'Holo', imageUrl: 'https://images.pokemontcg.io/base1/58.png', origin: 'automatic', owned: false }
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
  auth.user = { id: 'viewer' }; auth.isAuthorized = true; rows = []
  get.mockReset().mockResolvedValue(overview)
  content.mockReset().mockResolvedValue([first, second])
  order.mockReset().mockResolvedValue(['second', 'first']) // Must not reorder the visible content.
  move.mockReset().mockResolvedValue(undefined)
  copies.mockReset().mockImplementation(() => Promise.resolve([...rows]))
  create.mockReset().mockImplementation(() => { rows.push({ id: `copy-${rows.length}`, name: null, note: null, created_at: '2026-09-25T00:00:00Z' }); return Promise.resolve() })
  remove.mockReset().mockImplementation(copyId => { rows = rows.filter(copy => copy.id !== copyId); return Promise.resolve() })
  vi.mocked(updatePhysicalCopy).mockReset().mockResolvedValue(undefined)
})
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/collections/${id}`]}><Routes>
    <Route path="/collections/:collectionId" element={<CollectionPage />} />
  </Routes></MemoryRouter></QueryClientProvider>
  const view = render(tree())
  return { client, rerender: () => view.rerender(tree()) }
}
const region = () => screen.getByRole('region', { name: 'Contenu de la collection' })
const contentRows = () => within(region()).getAllByRole('listitem')

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
  expect(await screen.findByText('Pikachu')).toBeVisible()
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

test('backend order, ownership visuals, enabled controls and masked status; no origin or empty menu', async () => {
  setup(); await screen.findByText('Pikachu')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Pikachu' })).toHaveAttribute('aria-disabled', 'false'))
  const [missing, owned] = contentRows()
  expect(missing).toHaveTextContent('Pikachu'); expect(owned).toHaveTextContent('Évoli')
  expect(missing!.querySelector('.collection-content-row')).toHaveClass('is-missing')
  expect(owned!.querySelector('.collection-content-row')).not.toHaveClass('is-missing')
  expect(within(missing!).getByText('Carte manquante')).toHaveClass('visually-hidden')
  expect(within(owned!).getByText('Carte possédée')).toHaveClass('visually-hidden')
  expect(screen.getAllByRole('button', { name: /Gérer les exemplaires de/ })).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Gérer les exemplaires de Pikachu' })).toBeEnabled()
  expect(within(region()).queryByText(/^(Possédée|Manquante|automatic|manual|origin|…|\.\.\.)$/)).not.toBeInTheDocument()
  expect(within(region()).queryByRole('button', { name: /Enregistrer|reset|Réinitialiser|Actions de/ })).not.toBeInTheDocument()
  expect(within(region()).queryByRole('link')).not.toBeInTheDocument()
})

test.each([
  ['Extension', '025', 'Extension · 025'], ['Extension', null, 'Extension'], [null, '025', '025'], [null, null, null],
])('metadata %s / %s', (setNameFr, localId, expected) => {
  const { container } = render(<CollectionContentRow item={{ ...first, setNameFr, localId }} readOnly={false} onCopies={() => {}} />)
  const metadata = container.querySelector('.collection-content-meta')
  if (expected) expect(metadata).toHaveTextContent(expected)
  else expect(metadata).toBeNull()
})

test('name fallback, optional variant, exact image URL and graphical missing/broken image', () => {
  const view = render(<CollectionContentRow item={first} readOnly={false} onCopies={() => {}} />)
  expect(screen.getByText('Holo')).toBeVisible()
  const image = screen.getByRole('img', { name: 'Pikachu' })
  expect(image).toHaveAttribute('src', first.imageUrl)
  fireEvent.error(image)
  expect(screen.getByRole('img', { name: 'Image indisponible' }).tagName).toBe('svg')
  view.rerender(<CollectionContentRow item={{ ...first, imageUrl: null, cardNameFr: null, variantLabel: null }} readOnly onCopies={() => {}} />)
  expect(screen.getByText('Nom indisponible')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Consulter les exemplaires de Nom indisponible' })).toBeEnabled()
  expect(screen.queryByText('Holo')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Image indisponible' })).toBeInTheDocument()
})

test.each([false, true])('shared copies (present=%s) use real owner; no DnD or write controls, notes readable', async present => {
  get.mockResolvedValue({ ...overview, access: 'shared', ownerId: 'real-owner' })
  if (present) rows = [{ id: 'copy', name: 'Cadeau', note: 'Recto intact', created_at: '2026-09-25T00:00:00Z' }]
  setup(); await screen.findByText('Pikachu')
  expect(order).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Déplacer/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Consulter les exemplaires de Pikachu' }))
  await screen.findByText(present ? 'Cadeau' : 'Aucun exemplaire.')
  expect(copies).toHaveBeenCalledExactlyOnceWith('real-owner', bigId)
  if (present) {
    fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Cadeau' }))
    expect(screen.getByText('Recto intact')).toBeVisible()
  }
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Ajouter|Éditer|Supprimer|Actions de/ })).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled()
})

test('BIGINT line -> full dialog -> first/second copy -> delete to zero; owned comes from refetch', async () => {
  content.mockImplementation(() => Promise.resolve([{ ...first, owned: rows.length > 0 }]))
  const { client } = setup(); await screen.findByText('Pikachu')
  expect(client.getQueryData<CollectionContentItem[]>(collectionContentKey('viewer', id))?.[0]?.variantId).toBe(bigId)
  const opener = screen.getByRole('button', { name: 'Gérer les exemplaires de Pikachu' })
  opener.focus(); fireEvent.click(opener)
  await screen.findByText('Aucun exemplaire.')
  expect(copies).toHaveBeenCalledExactlyOnceWith('viewer', bigId)
  for (let count = 1; count <= 2; count++) {
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemplaire' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’exemplaire' }))
    await screen.findByText(`Exemplaire ${count}`)
    await waitFor(() => expect(screen.getByText('Carte possédée')).toBeInTheDocument())
    expect(create).toHaveBeenLastCalledWith(bigId, '', '')
  }
  // Editing copy metadata must not refresh owned.
  const reads = content.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Actions de Exemplaire 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Éditer' }))
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

test.each([false, true])('real keyboard reorder refetches content on success/uncertainty=%s', async fail => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('li'), index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    return DOMRect.fromRect({ x: 0, y: index * 80, width: 300, height: row ? 80 : 160 })
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  const { client } = setup(); await screen.findByText('Pikachu')
  const handle = screen.getByRole('button', { name: 'Déplacer Pikachu' })
  await waitFor(() => expect(handle).toHaveAttribute('aria-disabled', 'false'))
  const other = collectionContentKey('other-viewer', id)
  client.setQueryData(other, [first, second])
  content.mockResolvedValue([second, first])
  if (fail) move.mockRejectedValue(new Error('uncertain private error'))
  const key = (value: string, keyCode: number) => fireEvent.keyDown(handle, { key: value, keyCode, which: keyCode })
  handle.focus(); key(' ', 32)
  await screen.findByText(/Pikachu sélectionné/)
  key('ArrowDown', 40); await screen.findByText(/Pikachu, position 2/)
  key(' ', 32); fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith(id, { itemId: 'first', destination: { placement: 'after', anchorId: 'second' } }))
  await waitFor(() => expect(contentRows()[0]).toHaveTextContent('Évoli'))
  expect(content).toHaveBeenCalledTimes(2); expect(order).toHaveBeenCalledTimes(2)
  expect(client.getQueryState(other)?.isInvalidated).toBe(false)
  if (fail) expect(await screen.findByText(/Le déplacement n’a pas pu être confirmé/)).toBeVisible()
})

test('revoked overview removes visible cached rows, open notes/dialog, and private caches', async () => {
  get.mockResolvedValue({ ...overview, access: 'shared', ownerId: 'real-owner' })
  rows = [{ id: 'copy', name: 'Secret', note: 'Note privée', created_at: '2026-09-25T00:00:00Z' }]
  const { client } = setup(); await screen.findByText('Pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Consulter les exemplaires de Pikachu' }))
  await screen.findByText('Secret')
  fireEvent.click(screen.getByRole('button', { name: 'Afficher l’état / note de Secret' }))
  get.mockRejectedValue(new CollectionsError('collection_unavailable'))
  await act(async () => { await client.invalidateQueries({ queryKey: collectionOverviewKey('viewer', id), exact: true }) })
  await screen.findByRole('heading', { name: 'Collection indisponible' })
  for (const text of ['Pikachu', 'Secret', 'Note privée']) expect(screen.queryByText(text)).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const key of [collectionContentKey('viewer', id), collectionItemOrderKey('viewer', id), physicalCopiesKey('viewer', 'real-owner', bigId)]) expect(client.getQueryData(key)).toBeUndefined()
})

test('logout and viewer switch never show previous private rows', async () => {
  const { rerender } = setup(); await screen.findByText('Pikachu')
  auth.isAuthorized = false; rerender()
  expect(screen.queryByText('Pikachu')).not.toBeInTheDocument()
  auth.user = { id: 'next-viewer' }; auth.isAuthorized = true
  get.mockReturnValue(new Promise(() => {})); rerender()
  expect(screen.queryByText('Pikachu')).not.toBeInTheDocument()
  expect(content).toHaveBeenCalledTimes(1)
})
