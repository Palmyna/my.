import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { contentFixture } from '../../test/collection-content'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getCollectionContentV2 } from '../../services/collection-content'
import { CollectionItemsError, listCollectionItemOrder, moveCollectionItem, setCollectionItemHidden } from '../../services/collection-items'
import type { CollectionContentItemV2 } from '../../types/collection-content'
import type { CollectionOverview } from '../../types/collections'
import type { CollectionView } from '../../types/view-preferences'
import { CollectionContentView } from './CollectionContentView'

const auth = vi.hoisted(() => ({ user: { id: 'a0000000-0000-0000-0000-000000000001' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collection-content', () => ({ getCollectionContentV2: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(),
  listCollectionItemOrder: vi.fn(), moveCollectionItem: vi.fn(), setCollectionItemHidden: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn().mockResolvedValue(DEFAULT_USER_PREFERENCES),
  getCollectionViewOverride: vi.fn().mockResolvedValue(null) }))

const collectionId = 'c0000000-0000-0000-0000-000000000001'
const cards: CollectionContentItemV2[] = ['Alpha', 'Hidden', 'Bravo', 'Charlie'].map((name, index) => ({
  collectionItemId: `d0000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`, variantId: String(index + 1),
  sourceCardId: '25', setId: '73', cardNameFr: name, setNameFr: 'Extension', setAbbreviationFr: null, setAbbreviation: 'EXT',
  seriesNameFr: null, seriesNameSource: null, localId: String(index), variantLabel: 'Holo', imageUrl: null,
  origin: 'automatic', owned: true, isHidden: index === 1,
}))
const result = (collectionItemId: string, operationId: string) => ({ collectionItemId, operationId, outcome: 'changed' as const, personalRevision: revision })
let server: CollectionContentItemV2[], revision: string
beforeEach(() => {
  sessionStorage.clear(); server = cards.map(item => ({ ...item })); revision = '0'
  vi.mocked(getCollectionContentV2).mockReset().mockImplementation(() => Promise.resolve(contentFixture(server, 2, revision)))
  vi.mocked(listCollectionItemOrder).mockReset().mockImplementation(() => Promise.resolve(server.map(item => item.collectionItemId)))
  vi.mocked(moveCollectionItem).mockReset().mockResolvedValue(undefined)
  vi.mocked(setCollectionItemHidden).mockReset().mockImplementation((_parent, id, hidden, operation) => {
    server = server.map(item => item.collectionItemId === id ? { ...item, isHidden: hidden } : item)
    revision = String(BigInt(revision) + 1n)
    return Promise.resolve(result(id, operation.operationId))
  })
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('li'), index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    return DOMRect.fromRect({ x: 0, y: index * 80, width: 300, height: row ? 80 : 240 })
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => { vi.restoreAllMocks() })
function setup(patch: Partial<CollectionOverview> = {}, initialView: CollectionView = 'list') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  function Workspace({ viewer, parent }: { viewer: string; parent: string }) {
    const [query, setQuery] = useState(''), [view, setView] = useState(initialView)
    return <CollectionContentView viewerId={viewer} query={query} setQuery={setQuery} currentView={view}
      setCurrentView={choice => { setView(choice); return Promise.resolve(true) }} collection={{ collectionId: parent, ownerId: viewer,
        collectionType: 'automatic', name: 'Collection', targetType: 'set', targetId: '73', targetName: 'Extension',
        targetPrimaryType: null, targetSecondaryType: null, access: 'owned', ownedCount: 3, totalCount: 3, ...patch }} />
  }
  const tree = (viewer: string, parent: string) => <QueryClientProvider client={client}><MemoryRouter>
    <Workspace key={`${viewer}:${parent}`} viewer={viewer} parent={parent} /></MemoryRouter></QueryClientProvider>
  const result = render(tree(auth.user.id, collectionId))
  return { ...result, client, changeScope: (viewer: string, parent = collectionId) => result.rerender(tree(viewer, parent)) }
}
const filter = () => screen.getByRole('combobox', { name: 'Afficher les cartes' })
const all = () => fireEvent.change(filter(), { target: { value: 'all' } })
const visible = () => fireEvent.change(filter(), { target: { value: 'visible' } })
const search = (value: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
const key = (target: HTMLElement, value: string, keyCode: number) => fireEvent.keyDown(target, { key: value, keyCode, which: keyCode })

test('default filter, manual visibility, search intersection, all three views and scope reset', async () => {
  server[3]!.origin = 'manual'
  const view = setup({ access: 'shared' })
  await screen.findByRole('link', { name: 'Alpha' })
  expect(filter()).toHaveValue('visible')
  expect(screen.queryByRole('link', { name: 'Hidden' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Charlie' })).toBeVisible()
  all(); expect(screen.getByRole('link', { name: 'Hidden' })).toBeVisible()
  search('Hidden'); expect(screen.getAllByRole('listitem')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cartes' })); expect(filter()).toHaveValue('all')
  fireEvent.click(screen.getByRole('button', { name: 'Classeur' }))
  await screen.findByRole('region', { name: 'Classeur' })
  expect(filter()).toHaveValue('all'); expect(screen.getByRole('searchbox')).toHaveValue('Hidden')
  expect(screen.getByRole('region', { name: 'Classeur' }).querySelectorAll('.binder-pocket[data-item-id]')).toHaveLength(4)
  visible(); expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  expect(screen.getByRole('region', { name: 'Classeur' }).querySelectorAll('.binder-pocket[data-item-id]')).toHaveLength(3)
  all(); view.changeScope(auth.user.id, 'c0000000-0000-0000-0000-000000000002')
  await screen.findByRole('link', { name: 'Alpha' }); expect(filter()).toHaveValue('visible')
  all(); view.changeScope('a0000000-0000-0000-0000-000000000002')
  await waitFor(() => expect(filter()).toHaveValue('visible'))
  expect(setCollectionItemHidden).not.toHaveBeenCalled()
})

test.each(['shared', 'free', 'legacy', 'binder'] as const)('no masking controls for %s', async mode => {
  if (mode === 'legacy') vi.mocked(getCollectionContentV2).mockResolvedValue(contentFixture(server, 1))
  setup(mode === 'shared' ? { access: 'shared' } : mode === 'free' ? { collectionType: 'free' } : {}, mode === 'binder' ? 'binder' : 'list')
  if (mode === 'binder') await screen.findByRole('region', { name: 'Classeur' })
  else await screen.findByRole('link', { name: 'Alpha' })
  all(); expect(screen.queryByRole('button', { name: /^(Masquer|Réafficher) / })).toBeNull()
})

test('pending action blocks double writes, success waits for reread, abandoned focus keeps scroll, reveal in Cards', async () => {
  server[3]!.origin = 'manual'
  let finish!: () => void
  vi.mocked(setCollectionItemHidden).mockImplementation(async (_parent, id, hidden, operation) => {
    await new Promise<void>(resolve => { finish = resolve })
    server = server.map(item => item.collectionItemId === id ? { ...item, isHidden: hidden } : item); revision = '1'
    return Promise.resolve(result(id, operation.operationId))
  })
  setup(); await screen.findByRole('link', { name: 'Alpha' })
  expect(screen.queryByRole('button', { name: 'Masquer Charlie' })).toBeNull()
  const opener = screen.getByRole('button', { name: 'Masquer Alpha' })
  opener.focus(); fireEvent.click(opener)
  await waitFor(() => expect(opener).toHaveAttribute('aria-busy', 'true'))
  expect(opener).toHaveAttribute('aria-disabled', 'true'); fireEvent.click(opener)
  expect(screen.queryByText('Carte masquée.')).toBeNull(); expect(screen.getByRole('link', { name: 'Alpha' })).toBeVisible()
  act(() => { finish() })
  await screen.findByText('Carte masquée.')
  expect(screen.queryByRole('link', { name: 'Alpha' })).toBeNull(); expect(filter()).toHaveFocus()
  expect(window.scrollY).toBe(0); expect(setCollectionItemHidden).toHaveBeenCalledTimes(1)
  expect(vi.mocked(setCollectionItemHidden).mock.calls[0]?.slice(0, 3)).toEqual([collectionId, cards[0]!.collectionItemId, true])
  expect(vi.mocked(setCollectionItemHidden).mock.calls[0]?.[3]).toMatchObject({ orderContractVersion: 2, expectedRevision: '0' })
  expect(vi.mocked(setCollectionItemHidden).mock.calls[0]?.[3].operationId).toMatch(/^[0-9a-f-]{36}$/)
  vi.mocked(setCollectionItemHidden).mockImplementation((_parent, id, hidden, operation) => { server = server.map(item => item.collectionItemId === id ? { ...item, isHidden: hidden } : item); revision = '2'; return Promise.resolve(result(id, operation.operationId)) })
  all(); fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Réafficher Alpha · Holo' }))
  await screen.findByText('Carte réaffichée.')
  expect(screen.getByRole('button', { name: 'Masquer Alpha · Holo' })).toHaveAttribute('data-state', 'success')
  expect(screen.getByRole('link', { name: 'Alpha' }).closest('.collection-content-row')).not.toHaveClass('is-missing')
})

test('uncertain committed hide can disappear; explicit recovery retains exact UUID, revision and requested state', async () => {
  vi.mocked(setCollectionItemHidden).mockImplementationOnce(() => {
    server[0]!.isHidden = true; revision = '1'; throw new CollectionItemsError('operation_uncertain')
  }).mockImplementation((_parent, id, _hidden, operation) => Promise.resolve(result(id, operation.operationId)))
  setup(); await screen.findByRole('button', { name: 'Masquer Alpha' })
  const opener = screen.getByRole('button', { name: 'Masquer Alpha' }); opener.focus(); fireEvent.click(opener)
  await screen.findByRole('alert'); expect(filter()).toHaveFocus()
  expect(screen.queryByText('Carte masquée.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Vérifier \/ réessayer le masquage de Alpha/ }))
  await screen.findByText('Carte masquée.')
  expect(vi.mocked(setCollectionItemHidden).mock.calls[1]).toEqual(vi.mocked(setCollectionItemHidden).mock.calls[0])
})

test('failed reread cannot announce success; recovery rereads without a second writer', async () => {
  vi.mocked(setCollectionItemHidden).mockImplementationOnce((_parent, id, _hidden, operation) => {
    server[0]!.isHidden = true; revision = '1'
    vi.mocked(getCollectionContentV2).mockRejectedValueOnce(new Error('read failure'))
    return Promise.resolve(result(id, operation.operationId))
  })
  setup(); await screen.findByRole('button', { name: 'Masquer Alpha' }); fireEvent.click(screen.getByRole('button', { name: 'Masquer Alpha' }))
  await screen.findByText('Impossible d’actualiser la collection. Actualisez son contenu avant de continuer.')
  expect(screen.queryByText('Carte masquée.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Vérifier \/ réessayer le masquage de Alpha/ }))
  await screen.findByText('Carte masquée.'); expect(setCollectionItemHidden).toHaveBeenCalledTimes(1)
})

test('conflict displays safe error, rereads and never automatically resubmits', async () => {
  vi.mocked(setCollectionItemHidden).mockRejectedValue(new CollectionItemsError('collection_structure_conflict'))
  setup(); await screen.findByRole('button', { name: 'Masquer Alpha' }); fireEvent.click(screen.getByRole('button', { name: 'Masquer Alpha' }))
  await screen.findByText('La collection a changé. Vérifiez son contenu puis réessayez.')
  expect(setCollectionItemHidden).toHaveBeenCalledTimes(1); expect(getCollectionContentV2).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('Carte masquée.')).toBeNull()
})

test('empty collection, all hidden and no search results are distinct in every view', async () => {
  server = server.map(item => ({ ...item, isHidden: true }))
  setup({ access: 'shared' }); await screen.findByText('Les cartes de cette collection sont masquées.')
  expect(screen.queryByText('Cette collection ne contient encore aucune carte.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Afficher toutes les cartes' })); expect(filter()).toHaveFocus()
  search('absent'); expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Classeur' })); await screen.findByRole('region', { name: 'Classeur' })
  visible(); expect(screen.queryByRole('region', { name: 'Classeur' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Numéro de page' })).toBeNull()
})

test.each(['', 'EXT'])('hidden-only filter and text matching every consulted card allow R2 keyboard before (%s)', async query => {
  setup(); await screen.findByRole('button', { name: 'Déplacer Charlie' }); search(query)
  const handle = screen.getByRole('button', { name: 'Déplacer Charlie' })
  await waitFor(() => expect(handle).toHaveAttribute('aria-disabled', 'false'))
  vi.mocked(moveCollectionItem).mockImplementation(() => { server = [cards[0]!, cards[1]!, cards[3]!, cards[2]!]; revision = '1'; return Promise.resolve() })
  handle.focus(); key(handle, ' ', 32); await screen.findByText(/Charlie : carte sélectionnée/)
  key(handle, 'ArrowUp', 38); await screen.findByText(/Charlie, position 2/)
  key(handle, ' ', 32); fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await screen.findByText('Carte déplacée.')
  expect(moveCollectionItem).toHaveBeenCalledWith(collectionId, { itemId: cards[3]!.collectionItemId,
    destination: { placement: 'before', anchorId: cards[2]!.collectionItemId } }, expect.any(Object))
  expect(screen.getByRole('button', { name: 'Déplacer Charlie' })).toHaveFocus()
  all(); expect(screen.getAllByRole('link').filter(link => ['Alpha','Hidden','Charlie','Bravo'].includes(link.textContent ?? '')).map(link => link.textContent)).toEqual(['Alpha','Hidden','Charlie','Bravo'])
})

test('partial search relative to mask filter disables DnD; clearing restores availability', async () => {
  setup(); await screen.findByRole('button', { name: 'Déplacer Alpha' }); search('Alpha')
  expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Cartes' })); expect(screen.queryByRole('button', { name: /Déplacer/ })).toBeNull()
  search('EXT'); await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveAttribute('aria-disabled', 'false'))
  expect(moveCollectionItem).not.toHaveBeenCalled()
})

test.each(['mouse', 'touch'] as const)('R2 %s uses after visible anchor with hidden items at start, middle and end', async sensor => {
  server = [{ ...cards[1]!, collectionItemId: 'd0000000-0000-0000-0000-000000000005', cardNameFr: 'Hidden start' },
    cards[0]!, cards[1]!, cards[2]!, cards[3]!, { ...cards[1]!, collectionItemId: 'd0000000-0000-0000-0000-000000000006', cardNameFr: 'Hidden end' }]
  const original = server
  setup(); await screen.findByRole('button', { name: 'Déplacer Alpha' })
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  await waitFor(() => expect(handle).toHaveAttribute('aria-disabled', 'false'))
  vi.mocked(moveCollectionItem).mockImplementation(() => { server = [original[0]!, original[2]!, original[3]!, original[1]!, original[4]!, original[5]!]; revision = '1'; return Promise.resolve() })
  if (sensor === 'mouse') {
    fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 40 }); fireEvent.mouseMove(window, { clientX: 20, clientY: 50 })
    await screen.findByText(/Alpha : carte sélectionnée/)
    fireEvent.mouseMove(window, { clientX: 20, clientY: 125 }); await screen.findByText(/Alpha, position 2/)
    fireEvent.mouseUp(window)
  } else {
    const point = (y: number) => ({ identifier: 1, target: handle, clientX: 20, clientY: y })
    fireEvent.touchStart(handle, { touches: [point(40)] }); await screen.findByText(/Alpha : carte sélectionnée/)
    fireEvent.touchMove(window, { touches: [point(125)] }); await screen.findByText(/Alpha, position 2/)
    fireEvent.touchEnd(window, { touches: [], changedTouches: [point(125)] })
  }
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' }); await screen.findByText('Carte déplacée.')
  expect(moveCollectionItem).toHaveBeenCalledWith(collectionId, { itemId: cards[0]!.collectionItemId,
    destination: { placement: 'after', anchorId: cards[2]!.collectionItemId } }, expect.any(Object))
  all(); expect(server.map(item => item.isHidden)).toEqual([true, true, false, false, false, true])
})
