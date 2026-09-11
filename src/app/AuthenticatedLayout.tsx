import { Link, NavLink, Outlet } from 'react-router'
import logo from '../assets/brand/my-logo.svg'
import { SignOutButton } from '../features/auth/SignOutButton'

export function AuthenticatedLayout() {
  return <div className="authenticated-shell">
    <header className="site-header">
      <Link className="brand" to="/dashboard" aria-label="MY. — Dashboard"><img src={logo} alt="" /></Link>
    </header>
    <main className="authenticated-content">
      <nav className="authenticated-nav" aria-label="Navigation de l’espace MY.">
        <NavLink to="/dashboard" end>Dashboard</NavLink>
        <NavLink to="/profile" end>Profil</NavLink>
        <NavLink to="/settings" end>Paramètres</NavLink>
      </nav>
      <Outlet />
      <div className="authenticated-actions"><SignOutButton /></div>
    </main>
    <footer className="site-footer">Conditions d’utilisation</footer>
  </div>
}
