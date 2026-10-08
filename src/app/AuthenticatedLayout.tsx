import { Outlet } from 'react-router'
import { AuthenticatedHeader } from './AuthenticatedHeader'
import { SiteFooter } from './SiteFooter'

export function AuthenticatedLayout() {
  return <div className="authenticated-shell">
    <AuthenticatedHeader />
    <main className="authenticated-content">
      <Outlet />
    </main>
    <SiteFooter />
  </div>
}
