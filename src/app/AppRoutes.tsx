import { Route, Routes } from 'react-router'
import { BootstrapPage } from './BootstrapPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<BootstrapPage />} />
    </Routes>
  )
}
