import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ItemMove, ReorderAvailability } from '../../types/collection-items'
import { CollectionItemReorderList } from './CollectionItemReorderList'

const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }, { id: 'c', label: 'Charlie' }]
beforeEach(() => {
  // jsdom has no layout. Supply browser geometry, leaving all DnD sensors real.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('li')
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    return DOMRect.fromRect({ x: 0, y: index * 80, width: 300, height: row ? 80 : 240 })
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
})
function setup(availability: ReorderAvailability = { enabled: true }) {
  const onMove = vi.fn<(move: ItemMove) => Promise<boolean>>().mockResolvedValue(true)
  const action = vi.fn()
  const view = render(<CollectionItemReorderList collectionId="collection" items={items} availability={availability} onMove={onMove}
    renderItem={item => <><span>{item.label}</span><button onClick={action}>Actions de {item.label}</button></>} />)
  return { onMove, action, ...view }
}
function key(target: HTMLElement, value: string, keyCode: number) { fireEvent.keyDown(target, { key: value, keyCode, which: keyCode }) }
async function keyboardMove(label: string, direction: 'ArrowUp' | 'ArrowDown') {
  const handle = screen.getByRole('button', { name: `Déplacer ${label}` })
  handle.focus(); key(handle, ' ', 32)
  await waitFor(() => expect(screen.getByText(new RegExp(`${label} : carte sélectionnée`))).toBeInTheDocument())
  key(handle, direction, direction === 'ArrowUp' ? 38 : 40)
  await waitFor(() => expect(screen.getByText(new RegExp(`${label}, position`))).toBeInTheDocument())
  key(handle, ' ', 32)
  // Finish a native drop transition, which jsdom does not animate.
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
}

test('dedicated 44px handle, instructions, separate actions, no internal fields or reset', () => {
  const { action, onMove } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  expect(handle).toHaveAccessibleDescription(/Espace.*flèches.*Échap/)
  expect(getComputedStyle(handle).minHeight).toBe('44px')
  fireEvent.click(screen.getByRole('button', { name: 'Actions de Alpha' }))
  expect(action).toHaveBeenCalledOnce()
  expect(onMove).not.toHaveBeenCalled()
  expect(screen.queryByText(/sort_position|automatic_rank|Réinitialiser|Enregistrer l’ordre/)).not.toBeInTheDocument()
})
test('keyboard selects, moves, submits logical anchor and keeps handle focus', async () => {
  const { onMove } = setup()
  await keyboardMove('Alpha', 'ArrowDown')
  await waitFor(() => expect(onMove).toHaveBeenCalledExactlyOnceWith({ itemId: 'a', destination: { placement: 'after', anchorId: 'b' } }))
  expect(await screen.findByText('Carte déplacée.')).toHaveClass('visually-hidden')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveFocus())
})
test('Escape cancels without persistence', async () => {
  const { onMove } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Bravo' })
  handle.focus(); key(handle, ' ', 32)
  await screen.findByText(/Bravo : carte sélectionnée/)
  key(handle, 'Escape', 27)
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await screen.findByText('Déplacement annulé.')
  expect(onMove).not.toHaveBeenCalled()
})
test.each(['Effacez la recherche pour réorganiser la collection.', 'Cette collection est en lecture seule.'])('disabled reason remains keyboard-accessible: %s', async reason => {
  const { onMove } = setup({ enabled: false, reason })
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  handle.focus()
  expect(handle).toHaveFocus()
  expect(handle).toHaveAttribute('aria-disabled', 'true')
  expect(handle).toHaveAccessibleDescription(reason)
  key(handle, ' ', 32); key(handle, 'ArrowDown', 40); key(handle, ' ', 32)
  await act(() => Promise.resolve())
  expect(onMove).not.toHaveBeenCalled()
})
test('failed save keeps confirmed order and announces safe feedback', async () => {
  const { onMove } = setup()
  onMove.mockResolvedValue(false)
  await keyboardMove('Charlie', 'ArrowUp')
  await waitFor(() => expect(onMove).toHaveBeenCalledExactlyOnceWith({ itemId: 'c', destination: { placement: 'before', anchorId: 'b' } }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Déplacement non confirmé. Vérifiez l’ordre puis réessayez.')
  expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual(['AlphaActions de Alpha', 'BravoActions de Bravo', 'CharlieActions de Charlie'])
})
test('mouse drag starts only from handle, persists on drop', async () => {
  const { onMove } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  fireEvent.mouseDown(screen.getByText('Alpha'), { button: 0, clientX: 150, clientY: 40 })
  fireEvent.mouseMove(window, { clientX: 150, clientY: 130 })
  fireEvent.mouseUp(window)
  expect(onMove).not.toHaveBeenCalled()
  fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 40 })
  fireEvent.mouseMove(window, { clientX: 20, clientY: 50 })
  await screen.findByText(/Alpha : carte sélectionnée/)
  fireEvent.mouseMove(window, { clientX: 20, clientY: 135 })
  await screen.findByText(/Alpha, position 2/)
  fireEvent.mouseUp(window)
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(onMove).toHaveBeenCalledExactlyOnceWith({ itemId: 'a', destination: { placement: 'after', anchorId: 'b' } }))
})

test('touch scroll before long press cancels; deliberate hold can move and drop', async () => {
  const { onMove } = setup()
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  const touch = (y: number) => ({ identifier: 1, target: handle, clientX: 20, clientY: y, pageX: 20, pageY: y, screenX: 20, screenY: y })
  fireEvent.touchStart(handle, { touches: [touch(40)] })
  fireEvent.touchMove(window, { touches: [touch(80)] })
  fireEvent.touchEnd(window, { touches: [], changedTouches: [touch(80)] })
  expect(onMove).not.toHaveBeenCalled()
  fireEvent.touchStart(handle, { touches: [touch(40)] })
  await screen.findByText(/Alpha : carte sélectionnée/)
  fireEvent.touchMove(window, { touches: [touch(135)] })
  await screen.findByText(/Alpha, position 2/)
  fireEvent.touchEnd(window, { touches: [], changedTouches: [touch(135)] })
  fireEvent.transitionEnd(handle.closest('li')!, { propertyName: 'transform' })
  await waitFor(() => expect(onMove).toHaveBeenCalledExactlyOnceWith({ itemId: 'a', destination: { placement: 'after', anchorId: 'b' } }))
})

test('save in progress prevents a second drag until callback finishes', async () => {
  const { onMove } = setup()
  let finish!: (success: boolean) => void
  onMove.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve }))
  await keyboardMove('Alpha', 'ArrowDown')
  await waitFor(() => expect(onMove).toHaveBeenCalledOnce())
  const handle = screen.getByRole('button', { name: 'Déplacer Bravo' })
  expect(handle).toHaveAttribute('aria-disabled', 'true')
  expect(handle).toHaveAccessibleDescription(/Déplacement en cours/)
  expect(screen.getByText('Déplacement en cours…')).toHaveClass('visually-hidden')
  expect(screen.getByText('Enregistrement du déplacement…')).toHaveClass('visually-hidden')
  expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveAttribute('data-state', 'pending')
  expect(handle).toHaveAttribute('data-state', 'idle')
  key(handle, ' ', 32); key(handle, 'ArrowDown', 40); key(handle, ' ', 32)
  expect(onMove).toHaveBeenCalledOnce()
  await act(async () => { finish(true); await Promise.resolve() })
  expect(handle).toHaveAttribute('aria-disabled', 'false')
  expect(screen.getByRole('button', { name: 'Déplacer Alpha' })).toHaveTextContent('✓')
  expect(handle).not.toHaveTextContent('✓')
})

test('success is local, expires after two seconds and never replaces authoritative order', async () => {
  const { onMove } = setup()
  let finish!: (success: boolean) => void
  onMove.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await keyboardMove('Alpha', 'ArrowDown')
  vi.useFakeTimers()
  await act(async () => { finish(true); await Promise.resolve() })
  const handle = screen.getByRole('button', { name: 'Déplacer Alpha' })
  expect(handle).toHaveAttribute('data-state', 'success')
  expect(screen.getAllByRole('listitem').map(row => row.querySelector('button')?.getAttribute('aria-label')))
    .toEqual(['Déplacer Alpha', 'Déplacer Bravo', 'Déplacer Charlie'])
  expect(screen.getByRole('status')).toHaveClass('visually-hidden')
  expect(screen.getByRole('status')).toHaveTextContent('Carte déplacée.')
  await act(() => vi.advanceTimersByTimeAsync(1999))
  expect(handle).toHaveTextContent('✓')
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(handle).toHaveAttribute('data-state', 'idle')
  expect(handle.querySelector('svg')).toBeInTheDocument()
})

test.each(['drag', 'unmount', 'navigation'] as const)('reorder success timer cleanup: %s', async action => {
  const { onMove, unmount, rerender } = setup()
  let finish!: (success: boolean) => void
  onMove.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await keyboardMove('Alpha', 'ArrowDown')
  const schedule = vi.spyOn(window, 'setTimeout'), clear = vi.spyOn(window, 'clearTimeout')
  await act(async () => { finish(true); await Promise.resolve() })
  const index = schedule.mock.calls.findIndex(([, delay]) => delay === 2000)
  expect(index).toBeGreaterThanOrEqual(0)
  const timer: unknown = schedule.mock.results[index]!.value
  if (action === 'unmount') unmount()
  else if (action === 'navigation') rerender(<CollectionItemReorderList collectionId="next" items={items} availability={{ enabled: true }} onMove={onMove} renderItem={item => item.label} />)
  else {
    const handle = screen.getByRole('button', { name: 'Déplacer Bravo' })
    handle.focus(); key(handle, ' ', 32)
    await screen.findByText(/Bravo : carte sélectionnée/)
    key(handle, 'Escape', 27)
  }
  expect(clear).toHaveBeenCalledWith(timer)
})

test('unmounted pending move cannot schedule a success timer', async () => {
  const { onMove, unmount } = setup()
  let finish!: (success: boolean) => void
  onMove.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await keyboardMove('Alpha', 'ArrowDown')
  unmount()
  const schedule = vi.spyOn(window, 'setTimeout')
  await act(async () => { finish(true); await Promise.resolve() })
  expect(schedule.mock.calls.some(([, delay]) => delay === 2000)).toBe(false)
})

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
