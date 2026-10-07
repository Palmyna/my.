import { act, fireEvent, render, screen } from '@testing-library/react'
import { createBrowserRouter, RouterProvider, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { PageBackButton } from './PageBackButton'

const routers: ReturnType<typeof createBrowserRouter>[] = []
function Page() {
  return <><output aria-label="Route">{useLocation().pathname}</output><PageBackButton /></>
}
function setup() {
  const router = createBrowserRouter([{ path: '*', element: <Page /> }])
  routers.push(router)
  return { router, ...render(<RouterProvider router={router} />) }
}
beforeEach(() => window.history.replaceState(null, '', '/catalog/cards/123'))
afterEach(() => {
  routers.splice(0).forEach(router => router.dispose())
  window.history.replaceState(null, '', '/')
})

test('one semantic keyboard-accessible control returns to the previous internal entry', async () => {
  window.history.replaceState(null, '', '/collections/abc')
  const { router } = setup()
  await act(async () => { await router.navigate('/catalog/cards/123') })
  const back = screen.getByRole('button', { name: '← Retour' })
  expect(screen.getAllByRole('button', { name: '← Retour' })).toHaveLength(1)
  expect(back).toHaveAttribute('type', 'button')
  expect(back.tabIndex).toBe(0)
  back.focus(); expect(back).toHaveFocus()
  fireEvent.click(back, { detail: 0 }) // Native keyboard activation dispatches a click.
  await screen.findByText('/collections/abc')
})

test('direct entry falls back to Dashboard despite older browser history', async () => {
  window.history.pushState(null, '', '/catalog/cards/123')
  setup()
  fireEvent.click(screen.getByRole('button', { name: '← Retour' }))
  await screen.findByText('/dashboard')
})

test('recreating the browser router after refresh preserves a usable internal return', async () => {
  window.history.replaceState(null, '', '/catalog/pokemon/25')
  const first = setup()
  await act(async () => { await first.router.navigate('/catalog/cards/123') })
  first.unmount(); first.router.dispose()
  setup()
  fireEvent.click(screen.getByRole('button', { name: '← Retour' }))
  await screen.findByText('/catalog/pokemon/25')
})
