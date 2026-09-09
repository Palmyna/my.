import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { getSupabaseClient } from '../../services/supabase'
import { mockAuthClient, session } from '../../test/auth-fixtures'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

vi.mock('../../services/supabase', () => ({ getSupabaseClient: vi.fn() }))

function Probe() {
  const auth = useAuth()
  return <p>{auth.status}:{auth.profile?.public_id}</p>
}

test('StrictMode garde un seul listener, expose le profil et efface le cache au logout', async () => {
  const mock = mockAuthClient()
  mock.authorize()
  vi.mocked(getSupabaseClient).mockReturnValue(mock.client)
  const queryClient = new QueryClient()
  const { unmount } = render(
    <StrictMode><QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider></StrictMode>,
  )
  expect(screen.getByText('initializing:')).toBeVisible()
  await waitFor(() => expect(screen.getByText(/^authorized:MY-/)).toBeVisible())
  expect(mock.listenerCount()).toBe(1)
  queryClient.setQueryData(['private'], 'private data')
  act(() => { mock.emit('SIGNED_OUT', null) })
  expect(screen.getByText('signed_out:')).toBeVisible()
  expect(queryClient.getQueryData(['private'])).toBeUndefined()
  unmount()
  expect(mock.listenerCount()).toBe(0)
  mock.emit('SIGNED_IN', session)
})
