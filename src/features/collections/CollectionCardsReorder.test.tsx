import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CollectionItemReorderList } from './CollectionItemReorderList'
import type { ItemMove } from '../../types/collection-items'

const items = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map(label => ({ id: label, label }))
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const group = this.closest('ul')
    const groupIndex = group ? Array.from(group.parentElement!.children).indexOf(group) : 0
    const tile = this.closest('li')
    const index = tile ? Array.from(tile.parentElement!.children).indexOf(tile) : 0
    return DOMRect.fromRect({ x: tile ? index * 200 : 0, y: groupIndex * 300, width: tile ? 180 : 400, height: group ? 280 : 600 })
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(900)
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
const key = (handle: HTMLElement, value: string, keyCode: number) => fireEvent.keyDown(handle, { key: value, keyCode, which: keyCode })
function setup(enabled = true) {
  const move = vi.fn<(move: ItemMove) => Promise<boolean>>().mockResolvedValue(true)
  const detail = vi.fn()
  const tree = (next = items) => <CollectionItemReorderList collectionId="cards" layout="cards" items={next}
    availability={enabled ? { enabled: true } : { enabled: false, reason: 'Effacez la recherche pour réorganiser la collection.' }}
    onMove={move} renderItem={item => <button onClick={detail}>Détail {item.label}</button>} />
  const view = render(tree())
  return { move, detail, update: (next: typeof items) => view.rerender(tree(next)), ...view }
}

test('dedicated grid handle, native keyboard crosses rows and saves one logical backend anchor', async () => {
  const { move, detail, update } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  expect(handle).toHaveAccessibleDescription(/gauche et droite, haut et bas entre les rangées/)
  fireEvent.click(screen.getByRole('button', { name: 'Détail Alpha' }))
  expect(detail).toHaveBeenCalledOnce(); expect(move).not.toHaveBeenCalled()
  handle.focus(); key(handle, ' ', 32)
  await screen.findByText(/Alpha : carte sélectionnée/)
  key(handle, 'ArrowDown', 40)
  await screen.findByText(/Alpha, position 2/)
  key(handle, 'ArrowRight', 39)
  await screen.findByText(/Alpha, position 3/)
  key(handle, ' ', 32)
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith({ itemId: 'Alpha', destination: { placement: 'after', anchorId: 'Charlie' } }))
  update([items[1]!, items[2]!, items[0]!, items[3]!])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveAttribute('data-state', 'success'))
  expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveFocus()
  // Native placeholder collapse has no layout/transition in jsdom.
  expect(screen.getAllByRole('listitem').filter(item => item.matches('.collection-card-dnd-item')).map(item => item.textContent))
    .toEqual(['Détail Bravo', 'Détail Charlie', '✓Détail Alpha', 'Détail Delta'])
})

test('filtered grid exposes no drag handle or DnD attributes on detail actions', () => {
  const { move } = setup(false)
  expect(screen.queryByRole('button', { name: /Déplacer/ })).not.toBeInTheDocument()
  const detail = screen.getByRole('button', { name: 'Détail Alpha' })
  expect(detail).not.toHaveAttribute('data-rfd-drag-handle-draggable-id')
  key(detail, ' ', 32); key(detail, 'ArrowRight', 39); key(detail, ' ', 32)
  expect(move).not.toHaveBeenCalled()
})

test('keyboard moving to an earlier row uses before anchor in the same global order', async () => {
  const { move, update } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Delta' })
  handle.focus(); key(handle, ' ', 32)
  await screen.findByText(/Delta : carte sélectionnée/)
  key(handle, 'ArrowUp', 38)
  await screen.findByText(/Delta, position 2/)
  key(handle, ' ', 32)
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith({ itemId: 'Delta', destination: { placement: 'before', anchorId: 'Bravo' } }))
  update([items[0]!, items[3]!, items[1]!, items[2]!])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Delta' })).toHaveAttribute('data-state', 'success'))
  expect(screen.getByRole('button', { name: 'Déplacer Delta' })).toHaveFocus()
})

test('grid mouse handle persists; touch movement before long press stays scroll', async () => {
  const { move } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  const touch = (y: number) => ({ identifier: 1, target: handle, clientX: 90, clientY: y })
  fireEvent.touchStart(handle, { touches: [touch(20)] })
  fireEvent.touchMove(window, { touches: [touch(60)] })
  fireEvent.touchEnd(window, { touches: [], changedTouches: [touch(60)] })
  expect(move).not.toHaveBeenCalled()
  fireEvent.mouseDown(handle, { button: 0, clientX: 90, clientY: 20 })
  fireEvent.mouseMove(window, { clientX: 100, clientY: 20 })
  await screen.findByText(/Alpha : carte sélectionnée/)
  fireEvent.mouseMove(window, { clientX: 290, clientY: 20 })
  await screen.findByText(/Alpha, position 2/)
  fireEvent.mouseUp(window)
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith({ itemId: 'Alpha', destination: { placement: 'after', anchorId: 'Bravo' } }))
})

test('grid deliberate touch hold can reorder, failure restores authoritative order without success', async () => {
  const { move } = setup()
  move.mockResolvedValue(false)
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  const touch = (x: number) => ({ identifier: 1, target: handle, clientX: x, clientY: 20 })
  fireEvent.touchStart(handle, { touches: [touch(90)] })
  await screen.findByText(/Alpha : carte sélectionnée/)
  fireEvent.touchMove(window, { touches: [touch(290)] })
  await screen.findByText(/Alpha, position 2/)
  fireEvent.touchEnd(window, { touches: [], changedTouches: [touch(290)] })
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await screen.findByRole('alert')
  expect(screen.queryByText('✓')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(items.map(item => `Détail ${item.label}`)))
  await act(async () => {})
})
