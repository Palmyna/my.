import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthenticatedHeader } from './AuthenticatedHeader'

const actions = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../features/auth/auth-context', () => ({ useAuth: () => ({ actions, user: { email: 'alice@example.test' } }) }))
beforeEach(() => { actions.signOut.mockReset().mockResolvedValue(undefined) })

function PageProbe() {
  return <main><p data-testid="path">{useLocation().pathname}</p><Link to="/settings">Navigation extérieure</Link><button>Action de la page</button></main>
}
function setup(initialEntry = '/dashboard') {
  return render(<StrictMode><MemoryRouter initialEntries={[initialEntry]}><AuthenticatedHeader /><PageProbe /></MemoryRouter></StrictMode>)
}
const trigger = () => screen.getByRole('button', { name: 'Mon compte' })
function openMenu() { fireEvent.click(trigger()); return screen.getByRole('menu') }

test('conserve le logo et fournit une recherche visuelle sans action ni requête', () => {
  setup()
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  expect(screen.getByRole('link', { name: 'MY. — Dashboard' })).toHaveAttribute('href', '/dashboard')
  expect(within(screen.getByRole('banner')).getByText('Dashboard')).toHaveAttribute('aria-current', 'page')
  const search = screen.getByRole('searchbox', { name: 'Rechercher sur MY.' })
  expect(within(screen.getByRole('banner')).getByRole('search')).toContainElement(search)
  expect(search).toHaveAttribute('placeholder', 'Rechercher une carte, une extension…')
  fireEvent.change(search, { target: { value: 'Pikachu' } })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(search).toHaveValue('Pikachu')
  expect(screen.getByTestId('path')).toHaveTextContent('/dashboard')
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(actions.signOut).not.toHaveBeenCalled()
  expect(within(trigger()).getByText('A')).toHaveAttribute('aria-hidden', 'true')
  expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test.each([['/profile', 'Profil'], ['/settings/?tab=account#details', 'Paramètres']])('affiche la page à côté du logo dès l’arrivée sur %s', (path, name) => {
  setup(path)
  expect(within(screen.getByRole('banner')).getByText(name)).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'MY. — Dashboard' })).toHaveAttribute('href', '/dashboard')
})

test('ouvre au clic avec le focus sur Profil et se ferme au second clic', () => {
  setup()
  expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  const menu = openMenu()
  expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  expect(trigger()).toHaveAttribute('aria-controls', menu.id)
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Profil', 'Paramètres', 'Déconnexion'])
  expect(screen.getByRole('menuitem', { name: 'Profil' })).toHaveFocus()
  fireEvent.click(trigger())
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger()).toHaveAttribute('aria-expanded', 'false')
})

test('ferme au clic extérieur et lorsque le focus quitte le menu', () => {
  setup()
  openMenu()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  openMenu()
  const outside = screen.getByRole('button', { name: 'Action de la page' })
  act(() => outside.focus())
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(outside).toHaveFocus()
})

test.each(['ArrowDown', 'ArrowUp'])('ouvre avec %s et gère flèches, Home, End et Escape', key => {
  setup()
  fireEvent.keyDown(trigger(), { key })
  const first = screen.getByRole('menuitem', { name: 'Profil' })
  const second = screen.getByRole('menuitem', { name: 'Paramètres' })
  const last = screen.getByRole('menuitem', { name: 'Déconnexion' })
  expect(key === 'ArrowUp' ? last : first).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  expect(first).toHaveFocus()
  fireEvent.keyDown(first, { key: 'ArrowDown' })
  expect(second).toHaveFocus()
  fireEvent.keyDown(second, { key: 'End' })
  expect(last).toHaveFocus()
  fireEvent.keyDown(last, { key: 'ArrowDown' })
  expect(first).toHaveFocus()
  fireEvent.keyDown(first, { key: 'ArrowUp' })
  expect(last).toHaveFocus()
  fireEvent.keyDown(last, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger()).toHaveFocus()
})

test.each([false, true])('Tab ferme et laisse le navigateur poursuivre le focus (shift=%s)', shiftKey => {
  setup()
  openMenu()
  const event = createEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })
  fireEvent(document.activeElement!, event)
  expect(event.defaultPrevented).toBe(false)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger()).toHaveFocus()
})

test('Escape ferme aussi lorsque l’événement vient du document', () => {
  setup()
  openMenu()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger()).toHaveFocus()
})

test('ferme sur navigation vers Profil/Paramètres et indique la page active', () => {
  setup()
  const header = screen.getByRole('banner')
  for (const [name, path] of [['Profil', '/profile'], ['Paramètres', '/settings']] as const) {
    fireEvent.click(within(openMenu()).getByRole('menuitem', { name }))
    expect(screen.getByTestId('path')).toHaveTextContent(path)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toBe(header)
    expect(within(header).getByText(name)).toHaveAttribute('aria-current', 'page')
    expect(within(openMenu()).getByRole('menuitem', { name })).toHaveAttribute('aria-current', 'page')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  }
  fireEvent.click(screen.getByRole('link', { name: 'MY. — Dashboard' }))
  expect(within(header).getByText('Dashboard')).toHaveAttribute('aria-current', 'page')
  openMenu()
  fireEvent.click(screen.getByRole('link', { name: 'Navigation extérieure' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(within(header).getByText('Paramètres')).toHaveAttribute('aria-current', 'page')
})

test('appelle la déconnexion existante une seule fois et affiche les erreurs sans détail sensible', async () => {
  let reject!: (error: Error) => void
  actions.signOut.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  setup()
  const signOut = within(openMenu()).getByRole('menuitem', { name: 'Déconnexion' })
  fireEvent.click(signOut)
  fireEvent.click(signOut)
  expect(actions.signOut).toHaveBeenCalledOnce()
  expect(signOut).toHaveAttribute('aria-disabled', 'true')
  await act(() => { reject(new Error('sensitive server detail')); return Promise.resolve() })
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de terminer cette action')
  expect(screen.queryByText(/sensitive server/)).not.toBeInTheDocument()
  expect(signOut).toHaveAttribute('aria-disabled', 'false')
})

test('nettoie les listeners extérieurs à la fermeture et au démontage', () => {
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const { unmount } = setup()
  for (const finish of [() => fireEvent.click(trigger()), unmount]) {
    openMenu()
    const listeners = add.mock.calls.filter(([type]) => ['pointerdown', 'focusin', 'keydown'].includes(type)).slice(-3)
    expect(listeners.map(([type]) => type)).toEqual(['pointerdown', 'focusin', 'keydown'])
    finish()
    for (const [event, listener] of listeners) expect(remove).toHaveBeenCalledWith(event, listener)
  }
})
