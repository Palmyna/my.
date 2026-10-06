import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { getCollectionContent } from '../../services/collection-content'
import { deleteCollectionViewOverride, getCollectionViewOverride, getUserPreferences, saveCollectionViewOverride } from '../../services/view-preferences'
import { getVariantDetail } from '../../services/variant-detail'
import { listPhysicalCopies } from '../../services/physical-copies'
import { listCollectionItemOrder, moveCollectionItem } from '../../services/collection-items'
import type { CollectionContentItem } from '../../types/collection-content'
import type { BinderFormat, CollectionView } from '../../types/view-preferences'
import { CollectionContentView } from './CollectionContentView'
import { binderFormatKey } from './useBinderFormat'
import { userPreferencesKey } from '../view-preferences/view-preferences-query'
import { collectionContentKey } from './collection-query'

const auth = vi.hoisted(() => ({ user: { id: 'recipient' }, isAuthorized: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => auth }))
vi.mock('../../services/collection-content', () => ({ getCollectionContent: vi.fn() }))
vi.mock('../../services/view-preferences', () => ({ getUserPreferences: vi.fn(), getCollectionViewOverride: vi.fn(),
  saveCollectionViewOverride: vi.fn(), deleteCollectionViewOverride: vi.fn() }))
vi.mock('../../services/variant-detail', () => ({ getVariantDetail: vi.fn() }))
vi.mock('../../services/physical-copies', async original => ({ ...await original<typeof import('../../services/physical-copies')>(), listPhysicalCopies: vi.fn() }))
vi.mock('../../services/collection-items', async original => ({ ...await original<typeof import('../../services/collection-items')>(), listCollectionItemOrder: vi.fn(), moveCollectionItem: vi.fn() }))

const items: CollectionContentItem[] = Array.from({ length: 49 }, (_, index) => ({
  collectionItemId: `item-${index}`, variantId: String(9007199254740995n + BigInt(index)),
  cardNameFr: [10, 12, 27, 46].includes(index) ? 'Pikachu' : `Évoli ${index}`,
  setNameFr: 'Extension', setAbbreviationFr: null, setAbbreviation: 'EXT', seriesNameFr: 'Soleil et Lune', seriesNameSource: null,
  localId: String(index), variantLabel: 'Holo', imageUrl: index === 0 ? '/remote.webp' : null, origin: 'manual', owned: index % 2 === 0,
}))
let wide = true
let listeners: Set<() => void>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
beforeEach(() => {
  wide = true; listeners = new Set(); auth.user = { id: 'recipient' }
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: (_event: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_event: string, fn: () => void) => listeners.delete(fn) }))
  vi.mocked(getCollectionContent).mockReset().mockResolvedValue(items)
  vi.mocked(getUserPreferences).mockReset().mockResolvedValue(DEFAULT_USER_PREFERENCES)
  vi.mocked(getCollectionViewOverride).mockReset().mockResolvedValue(null)
  vi.mocked(saveCollectionViewOverride).mockReset().mockImplementation((_viewer, _collection, format) => Promise.resolve(format))
  vi.mocked(deleteCollectionViewOverride).mockReset().mockResolvedValue(undefined)
  vi.mocked(listCollectionItemOrder).mockReset().mockResolvedValue(items.map(item => item.collectionItemId))
  vi.mocked(moveCollectionItem).mockReset()
  vi.mocked(listPhysicalCopies).mockReset().mockResolvedValue([])
  vi.mocked(getVariantDetail).mockReset().mockResolvedValue({ variantId: items[0]!.variantId, sourceCardId: '25', setId: '73', pokemon: [], cardNameFr: 'Nom catalogue', imageUrl: null,
    localId: null, setNameFr: null, setNameSource: null, setAbbreviationFr: null, setAbbreviation: null,
    seriesNameFr: null, seriesNameSource: null, rarity: null, category: null, variantLabel: null, variantType: null,
    variantSubtype: null, variantSize: null, variantFoil: null, variantStamps: [], effectiveReleaseDate: null, dateOrigin: 'unknown' })
})
afterEach(() => { vi.useRealTimers() })

function setup({ initialView = 'binder', globalFormat = '3x3', owned = false, viewer = 'recipient' }: {
  initialView?: CollectionView; globalFormat?: BinderFormat; owned?: boolean; viewer?: string
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(userPreferencesKey(viewer), { ...DEFAULT_USER_PREFERENCES, binderDefaultFormat: globalFormat })
  function Workspace({ identity }: { identity: string }) {
    const [query, setQuery] = useState('')
    const [view, setView] = useState(initialView)
    return <CollectionContentView key={identity} viewerId={identity} query={query} setQuery={setQuery}
      currentView={view} setCurrentView={choice => { setView(choice); return Promise.resolve(true) }}
      collection={{ collectionId: 'collection', ownerId: owned ? identity : 'real-owner', name: 'Favoris', collectionType: 'free',
        access: owned ? 'owned' : 'shared', targetType: null, targetName: null, targetPrimaryType: null, targetSecondaryType: null, ownedCount: 25, totalCount: items.length }} />
  }
  const tree = (identity: string) => <QueryClientProvider client={client}><Workspace key={identity} identity={identity} /></QueryClientProvider>
  const result = render(tree(viewer))
  return { ...result, client, changeViewer: (identity: string) => result.rerender(tree(identity)) }
}
const book = () => screen.getByRole('region', { name: 'Classeur' })
const pages = () => Array.from(book().querySelectorAll('.binder-page')).map(page => page.getAttribute('aria-label'))
function direct(value: string) {
  const input = screen.getByRole('textbox', { name: 'Numéro de page' })
  fireEvent.change(input, { target: { value } }); fireEvent.submit(input.closest('form')!)
}
function search(value: string) { fireEvent.change(screen.getByRole('searchbox'), { target: { value } }) }

test.each([['2x2', 4, 13], ['3x3', 9, 6], ['4x3', 12, 5]] as const)('global %s sets real page total and exact pocket count', async (format, slots, total) => {
  setup({ globalFormat: format }); await screen.findByRole('region', { name: 'Classeur' })
  expect(pages()).toEqual(['Page 1'])
  expect(book().querySelector('.binder-page')).toHaveClass('is-right')
  expect(book().querySelectorAll('.binder-pocket')).toHaveLength(slots)
  expect(screen.getByText(`/ ${total}`)).toBeVisible()
  expect(getCollectionViewOverride).toHaveBeenCalledExactlyOnceWith('recipient', 'collection')
  expect(getUserPreferences).not.toHaveBeenCalled()
})

test.each([
  ['2x2', ['opens-right', 'opens-left']],
  ['3x3', ['opens-right', 'opens-right', 'opens-left']],
  ['4x3', ['opens-right', 'opens-right', 'opens-left', 'opens-left']],
] as const)('%s pocket openings converge on every row of both leaves', async (format, row) => {
  setup({ globalFormat: format }); await screen.findByRole('region', { name: 'Classeur' })
  direct('2')
  expect(pages()).toEqual(['Page 2', 'Page 3'])
  for (const page of book().querySelectorAll('.binder-page')) {
    const pockets = Array.from(page.querySelectorAll('.binder-pocket'))
    pockets.forEach((pocket, slot) => {
      const side = row[slot % row.length]!
      expect(pocket).toHaveClass(side)
      expect(pocket).not.toHaveClass(side === 'opens-right' ? 'opens-left' : 'opens-right')
    })
  }
})

test('desktop height anchor follows layout, resize and scroll; reserves toolbar space and cleans up', async () => {
  let stageTop = 300, toolbarTop = 226
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { top: this.classList.contains('binder-stage') ? stageTop : toolbarTop } as DOMRect
  })
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  let reflow!: () => void
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { reflow = callback }
    observe = vi.fn()
    disconnect = disconnect
  })
  const { unmount } = setup()
  await screen.findByRole('region', { name: 'Classeur' })
  const anchor = () => book().style.getPropertyValue('--binder-top')
  expect(anchor()).toBe('300px')
  stageTop = 250
  act(() => { fireEvent(window, new Event('resize')); frame!(0) })
  expect(anchor()).toBe('250px')
  stageTop = 320
  act(() => { reflow(); frame!(0) })
  expect(anchor()).toBe('320px')
  stageTop = -26; toolbarTop = -100
  act(() => { fireEvent.scroll(window); frame!(0) })
  expect(anchor()).toBe('74px')
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenLastCalledWith(1)
  frame = undefined
  fireEvent.scroll(window)
  expect(frame).toBeUndefined()
})

test('book sides, direct mapping and partial even last page; invalid input restores value', async () => {
  setup(); await screen.findByRole('region', { name: 'Classeur' })
  expect(screen.getByRole('button', { name: 'Ouverture précédente' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Ouverture suivante' })); expect(pages()).toEqual(['Page 2', 'Page 3'])
  fireEvent.click(screen.getByRole('button', { name: 'Ouverture suivante' })); expect(pages()).toEqual(['Page 4', 'Page 5'])
  direct('6'); expect(pages()).toEqual(['Page 6'])
  expect(book().querySelector('.binder-page')).toHaveClass('is-left')
  expect(book().querySelectorAll('.is-empty')).toHaveLength(5)
  expect(book().querySelector('.is-empty img')).toBeNull()
  expect(screen.getByRole('button', { name: 'Ouverture suivante' })).toBeDisabled()
  for (const value of ['', 'abc', '0', '7']) {
    direct(value); expect(pages()).toEqual(['Page 6']); expect(screen.getByRole('textbox')).toHaveValue('6')
  }
  direct('3'); expect(pages()).toEqual(['Page 2', 'Page 3'])
  expect(screen.getByRole('textbox')).toHaveValue('2')
})

test.each([false, true])('owned=%s has distinct possession states, real detail and no pocket actions or reorder', async owned => {
  setup({ owned }); await screen.findByRole('region', { name: 'Classeur' })
  const pockets = book().querySelectorAll('.binder-pocket')
  expect(pockets[0]).not.toHaveClass('is-missing'); expect(pockets[1]).toHaveClass('is-missing')
  expect(pockets[0]).toHaveClass('opens-right'); expect(pockets[1]).toHaveClass('opens-right'); expect(pockets[2]).toHaveClass('opens-left'); expect(pockets[3]).toHaveClass('opens-right')
  expect(within(book()).queryByRole('button', { name: /Exemplaires|Actions de|Déplacer/i })).not.toBeInTheDocument()
  expect(listCollectionItemOrder).not.toHaveBeenCalled(); expect(moveCollectionItem).not.toHaveBeenCalled()
  const opener = within(book()).getByRole('button', { name: /Voir le détail de Évoli 0.*Carte possédée/ })
  opener.focus(); fireEvent.click(opener)
  await screen.findByRole('heading', { name: 'Nom catalogue' }); await screen.findByText('Aucun exemplaire.')
  expect(getVariantDetail).toHaveBeenCalledExactlyOnceWith(items[0]!.variantId)
  expect(listPhysicalCopies).toHaveBeenCalledExactlyOnceWith(owned ? 'recipient' : 'real-owner', items[0]!.variantId)
  if (!owned) expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Ajouter|Modifier|Supprimer/ })).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' }); expect(pages()).toEqual(['Page 1'])
  fireEvent.click(screen.getByRole('button', { name: 'Fermer le détail' })); expect(opener).toHaveFocus()
})

test('keyboard acts only in binder context; mobile exact pages and swipes preserve vertical scroll and taps', async () => {
  setup(); await screen.findByRole('region', { name: 'Classeur' })
  book().focus(); fireEvent.keyDown(book(), { key: 'ArrowRight' }); expect(pages()).toEqual(['Page 2', 'Page 3'])
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowRight' }); expect(pages()).toEqual(['Page 2', 'Page 3'])
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' }); expect(pages()).toEqual(['Page 2', 'Page 3'])
  fireEvent.keyDown(within(book()).getAllByRole('button')[1]!, { key: 'ArrowRight' }); expect(pages()).toEqual(['Page 2', 'Page 3'])
  act(() => { wide = false; listeners.forEach(fn => fn()) })
  direct('3'); expect(pages()).toEqual(['Page 3'])
  const swipe = (x: number, y: number) => {
    fireEvent.touchStart(book(), { touches: [{ clientX: 200, clientY: 200 }] })
    fireEvent.touchMove(book(), { touches: [{ clientX: 200 + x, clientY: 200 + y }] })
    fireEvent.touchEnd(book())
  }
  swipe(-100, 5); expect(pages()).toEqual(['Page 4'])
  swipe(100, 5); expect(pages()).toEqual(['Page 3'])
  swipe(3, -100); expect(pages()).toEqual(['Page 3'])
  direct('1'); swipe(100, 0); expect(pages()).toEqual(['Page 1'])
  direct('6'); swipe(-100, 0); expect(pages()).toEqual(['Page 6'])
})

test('search keeps pages/slots, jumps once, navigates occurrences without loop and targets only one halo', async () => {
  setup(); await screen.findByRole('region', { name: 'Classeur' })
  vi.useFakeTimers()
  search('Pikachu soleil EXT')
  expect(pages()).toEqual(['Page 2', 'Page 3'])
  expect(book().querySelectorAll('.binder-pocket')).toHaveLength(18)
  expect(book().querySelectorAll('.is-search-muted')).toHaveLength(16)
  expect(book().querySelector('.has-search-halo')).toHaveAttribute('data-item-id', 'item-10')
  expect(screen.getByLabelText('Occurrence courante')).toHaveTextContent('1 / 4')
  expect(screen.getByRole('button', { name: 'Occurrence précédente' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence suivante' }))
  expect(pages()).toEqual(['Page 2', 'Page 3'])
  expect(book().querySelectorAll('.has-search-halo')).toHaveLength(1)
  expect(book().querySelector('.has-search-halo')).toHaveAttribute('data-item-id', 'item-12')
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence suivante' }))
  expect(pages()).toEqual(['Page 4', 'Page 5'])
  expect(book().querySelector('.has-search-halo')).toHaveAttribute('data-item-id', 'item-27')
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence suivante' }))
  expect(pages()).toEqual(['Page 6'])
  expect(screen.getByRole('button', { name: 'Occurrence suivante' })).toBeDisabled()
  expect(book().querySelectorAll('.is-empty')).toHaveLength(5)
  expect(book().querySelector('.is-empty')).not.toHaveClass('is-search-muted')
  act(() => { vi.advanceTimersByTime(1400) }); expect(book().querySelector('.has-search-halo')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence précédente' })); expect(pages()).toEqual(['Page 4', 'Page 5'])
  direct('1'); expect(pages()).toEqual(['Page 1']) // free navigation is not recentered
  search(' PÍKACHU  soleil EXT '); expect(pages()).toEqual(['Page 1']) // same effective query
  search('inconnu'); expect(pages()).toEqual(['Page 1'])
  expect(screen.getByText('Aucune carte ne correspond à cette recherche.')).toBeVisible()
  expect(book().querySelectorAll('.is-search-muted')).toHaveLength(9)
  expect(screen.queryByLabelText('Occurrence courante')).not.toBeInTheDocument()
  search('pikachu'); expect(pages()).toEqual(['Page 2', 'Page 3'])
  direct('6'); fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
  expect(pages()).toEqual(['Page 6']); expect(book().querySelector('.has-search-halo')).toBeNull()
  expect(book().querySelector('.is-search-muted')).toBeNull()
  expect(screen.queryByLabelText('Occurrence courante')).not.toBeInTheDocument()
  expect(getCollectionContent).toHaveBeenCalledOnce()
})

test('override is lazy, viewer-specific and authoritative; format change resets page/search/occurrence/halo; reset deletes', async () => {
  vi.mocked(getCollectionViewOverride).mockImplementation(viewer => Promise.resolve(viewer === 'recipient' ? '2x2' : '4x3'))
  const { client, changeViewer } = setup({ initialView: 'list' })
  await screen.findByText('Évoli 0 · EXT · 0')
  expect(getCollectionViewOverride).not.toHaveBeenCalled()
  search('pikachu'); fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
  expect(getCollectionViewOverride).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Classeur' })); await screen.findByRole('region', { name: 'Classeur' })
  expect(screen.getByRole('searchbox')).toHaveValue('pikachu')
  expect(screen.getByRole('button', { name: 'Format du classeur : 2×2' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 2×2' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '3×3' }), { key: 'ArrowRight' })
  expect(pages()).toEqual(['Page 2', 'Page 3'])
  fireEvent.click(screen.getByRole('button', { name: '3×3' }))
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  expect(pages()).toEqual(['Page 1'])
  expect(screen.queryByLabelText('Occurrence courante')).not.toBeInTheDocument()
  expect(book().querySelector('.has-search-halo')).toBeNull()
  expect(saveCollectionViewOverride).toHaveBeenCalledExactlyOnceWith('recipient', 'collection', '3x3')
  expect(client.getQueryData(binderFormatKey('recipient', 'collection'))).toBe('3x3')
  search('pikachu'); direct('6')
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 3×3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Utiliser le format par défaut' }))
  await waitFor(() => expect(client.getQueryData(binderFormatKey('recipient', 'collection'))).toBeNull())
  expect(deleteCollectionViewOverride).toHaveBeenCalledExactlyOnceWith('recipient', 'collection')
  expect(screen.getByRole('searchbox')).toHaveValue('pikachu'); expect(pages()).toEqual(['Page 6']) // effective format unchanged
  client.setQueryData(userPreferencesKey('other'), { ...DEFAULT_USER_PREFERENCES })
  changeViewer('other'); fireEvent.click(screen.getByRole('button', { name: 'Classeur' }))
  await screen.findByRole('region', { name: 'Classeur' })
  expect(screen.getByRole('button', { name: 'Format du classeur : 4×3' })).toBeVisible()
  expect(getCollectionViewOverride).toHaveBeenLastCalledWith('other', 'collection')
  expect(getCollectionContent).toHaveBeenCalledTimes(2) // one read per viewer, never per renderer/format
})

test('reset to a different global format resets search; failed write retains confirmed format', async () => {
  vi.mocked(getCollectionViewOverride).mockResolvedValue('2x2')
  setup(); await screen.findByRole('region', { name: 'Classeur' })
  search('pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 2×2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Utiliser le format par défaut' }))
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  expect(pages()).toEqual(['Page 1']); expect(book().querySelector('.has-search-halo')).toBeNull()
  vi.mocked(saveCollectionViewOverride).mockRejectedValueOnce(new Error('private error'))
  vi.mocked(getCollectionViewOverride).mockResolvedValue(null)
  search('pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 3×3' }))
  fireEvent.click(screen.getByRole('button', { name: '4×3' }))
  await screen.findByText('Le format n’a pas pu être confirmé. Réessayez.')
  expect(screen.getByRole('searchbox')).toHaveValue('pikachu'); expect(pages()).toEqual(['Page 2', 'Page 3'])
  expect(screen.getByRole('button', { name: 'Format du classeur : 3×3' })).toBeVisible()
})

test('empty collection uses existing empty state with no synthetic pages or page input', async () => {
  vi.mocked(getCollectionContent).mockResolvedValue([])
  setup(); await screen.findByText('Cette collection ne contient encore aucune carte.')
  expect(screen.queryByRole('region', { name: 'Classeur' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Numéro de page' })).not.toBeInTheDocument()
})

test('pending format write leaves confirmed context intact and cannot update a departed viewer cache', async () => {
  let resolve!: (format: BinderFormat) => void
  vi.mocked(saveCollectionViewOverride).mockReturnValue(new Promise(yes => { resolve = yes }))
  const { client, changeViewer } = setup()
  await screen.findByRole('region', { name: 'Classeur' })
  search('pikachu'); direct('6')
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 3×3' }))
  fireEvent.click(screen.getByRole('button', { name: '4×3' }))
  expect(screen.getByRole('searchbox')).toHaveValue('pikachu')
  expect(pages()).toEqual(['Page 6'])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Format du classeur : 3×3' })).toBeDisabled())
  changeViewer('other')
  client.removeQueries({ queryKey: binderFormatKey('recipient', 'collection'), exact: true })
  await screen.findByRole('region', { name: 'Classeur' })
  await act(async () => { resolve('4x3'); await Promise.resolve() })
  expect(client.getQueryData(binderFormatKey('recipient', 'collection'))).toBeUndefined()
  expect(screen.getByRole('button', { name: 'Format du classeur : 3×3' })).toBeVisible()
})

test('override read error retries safely; an ambiguous committed write reconciles and resets the effective format', async () => {
  vi.mocked(getCollectionViewOverride).mockRejectedValueOnce(new Error('private data')).mockResolvedValue(null)
  setup(); await screen.findByText('Format indisponible.')
  expect(screen.queryByRole('region', { name: 'Classeur' })).not.toBeInTheDocument()
  expect(screen.queryByText('private data')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  await screen.findByRole('region', { name: 'Classeur' })
  search('pikachu'); direct('6')
  vi.mocked(saveCollectionViewOverride).mockRejectedValueOnce(new Error('lost response after commit'))
  vi.mocked(getCollectionViewOverride).mockResolvedValue('4x3')
  fireEvent.click(screen.getByRole('button', { name: 'Format du classeur : 3×3' }))
  fireEvent.click(screen.getByRole('button', { name: '4×3' }))
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
  expect(pages()).toEqual(['Page 1'])
  expect(screen.queryByLabelText('Occurrence courante')).not.toBeInTheDocument()
  expect(book().querySelector('.has-search-halo')).toBeNull()
  expect(getCollectionContent).toHaveBeenCalledOnce()
})

test('authoritative removal keeps free navigation and repairs the current occurrence without a new search jump', async () => {
  const { client } = setup(); await screen.findByRole('region', { name: 'Classeur' })
  search('pikachu')
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence suivante' }))
  direct('6')
  await act(async () => {
    client.setQueryData(collectionContentKey('recipient', 'collection'), items.filter(item => item.collectionItemId !== 'item-12'))
    await Promise.resolve()
  })
  expect(pages()).toEqual(['Page 6'])
  await waitFor(() => expect(screen.getByLabelText('Occurrence courante')).toHaveTextContent('1 / 3'))
  expect(book().querySelector('.has-search-halo')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Occurrence suivante' }))
  expect(book().querySelector('.has-search-halo')).toHaveAttribute('data-item-id', 'item-27')
})
