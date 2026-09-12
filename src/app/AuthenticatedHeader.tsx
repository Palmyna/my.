import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import logo from '../assets/brand/my-logo.svg'
import { useAuth } from '../features/auth/auth-context'
import { useAuthTask } from '../features/auth/auth-ui'

const pageNames: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/profile': 'Profil',
  '/settings': 'Paramètres',
}

function UserMenu() {
  const { actions, user } = useAuth()
  const task = useAuthTask()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const firstFocus = useRef<'first' | 'last'>('first')

  useEffect(() => {
    if (!open) return
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    items?.[firstFocus.current === 'last' ? items.length - 1 : 0]?.focus()
    function closeOutside(event: Event) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
        setOpen(true)
      }
      return
    }
    if (event.key === 'Tab') {
      // Tab keeps its native navigation after focus returns to the trigger.
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const current = items.findIndex(item => item === document.activeElement)
    let next: number
    switch (event.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break
      case 'ArrowUp': next = current <= 0 ? items.length - 1 : current - 1; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    event.preventDefault()
    items[next]?.focus()
  }

  return <div className="user-menu" ref={containerRef}>
    <button className="button user-menu-trigger" ref={buttonRef} type="button" id={`${menuId}-trigger`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onKeyDown={handleKeyDown}
      onClick={() => { firstFocus.current = 'first'; setOpen(!open) }}>
      <span className="user-menu-avatar" aria-hidden="true">
        {user?.email?.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="user-menu-label">Mon compte</span>
      <svg className="user-menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div className="user-menu-popover">
      <div id={menuId} ref={menuRef} role="menu" aria-labelledby={`${menuId}-trigger`} onKeyDown={handleKeyDown}>
        <NavLink className="user-menu-item" role="menuitem" tabIndex={-1} to="/profile" onClick={() => setOpen(false)}>Profil</NavLink>
        <NavLink className="user-menu-item" role="menuitem" tabIndex={-1} to="/settings" onClick={() => setOpen(false)}>Paramètres</NavLink>
        <button className="button user-menu-signout" role="menuitem" tabIndex={-1} type="button" aria-disabled={task.busy}
          onClick={() => task.run(() => actions.signOut())}>{task.busy ? 'Déconnexion…' : 'Déconnexion'}</button>
      </div>
      {task.error && <p className="user-menu-error" role="alert">{task.error}</p>}
    </div>}
  </div>
}

export function AuthenticatedHeader() {
  const searchId = useId()
  const location = useLocation()
  const pageName = pageNames[location.pathname.replace(/\/+$/, '')]
  return <header className="site-header authenticated-header">
    <div className="header-identity">
      <Link className="brand" to="/dashboard" aria-label="MY. — Dashboard"><img src={logo} alt="" /></Link>
      {pageName && <span className="header-page-name" aria-current="page">{pageName}</span>}
    </div>
    <div className="header-search" role="search" aria-label="Recherche MY.">
      <label className="visually-hidden" htmlFor={searchId}>Rechercher sur MY.</label>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input id={searchId} type="search" placeholder="Rechercher une carte, une extension…" autoComplete="off" spellCheck={false} />
    </div>
    <UserMenu key={location.key} />
  </header>
}
