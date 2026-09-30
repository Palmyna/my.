import { AppProviders } from './AppProviders'
import { AppRoutes } from './AppRoutes'
import { createBrowserRouter, RouterProvider } from 'react-router'

// One router for the SPA lifetime, outside StrictMode's component initializers.
// The data router allows the deletion dialog to block SPA/back navigation while sending.
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }])

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
