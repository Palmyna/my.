import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type PropsWithChildren } from 'react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../features/auth/AuthProvider'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider><BrowserRouter>{children}</BrowserRouter></AuthProvider>
    </QueryClientProvider>
  )
}
