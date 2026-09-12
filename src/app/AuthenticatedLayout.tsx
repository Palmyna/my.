import { Outlet } from 'react-router'
import { AuthenticatedHeader } from './AuthenticatedHeader'

export function AuthenticatedLayout() {
  return <div className="authenticated-shell">
    <AuthenticatedHeader />
    <main className="authenticated-content">
      <Outlet />
    </main>
    <footer className="site-footer">Conditions d’utilisation</footer>
  </div>
}
