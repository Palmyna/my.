import { useQueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { Link, useLocation } from 'react-router'
import { expect, test, vi } from 'vitest'
import { App } from './App'
import { AppProviders } from './AppProviders'

test('affiche MY. sur la route initiale sans configuration Supabase ni appel réseau', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  const fetchSpy = vi.fn(() => {
    throw new Error('Aucun appel réseau attendu pendant le bootstrap.')
  })
  vi.stubGlobal('fetch', fetchSpy)

  render(<StrictMode><App /></StrictMode>)

  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'MY.' })).toBeVisible()
  expect(screen.getByText('Application initialisée')).toBeVisible()
  expect(fetchSpy).not.toHaveBeenCalled()
})

function InfrastructureProbe() {
  const queryClient = useQueryClient()
  const location = useLocation()

  return (
    <>
      <button onClick={() => queryClient.setQueryData(['bootstrap-test'], 'Cache conservé')}>
        Préparer le cache
      </button>
      <Link to="/verification">Changer de route</Link>
      <p>{location.pathname}</p>
      <p>{queryClient.getQueryData<string>(['bootstrap-test'])}</p>
    </>
  )
}

test('fournit le routeur et conserve le cache Query entre les rendus et la navigation', () => {
  const { rerender } = render(<AppProviders><InfrastructureProbe /></AppProviders>)

  fireEvent.click(screen.getByRole('button', { name: 'Préparer le cache' }))
  rerender(<AppProviders><InfrastructureProbe /></AppProviders>)
  expect(screen.getByText('Cache conservé')).toBeVisible()

  fireEvent.click(screen.getByRole('link', { name: 'Changer de route' }))
  expect(screen.getByText('/verification')).toBeVisible()
  expect(screen.getByText('Cache conservé')).toBeVisible()
})
