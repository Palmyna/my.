import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../features/auth/auth-context'
import type { CollectionUpdateIntent } from '../features/collections/collection-update-navigation'
import { AuthenticatedHeader } from './AuthenticatedHeader'
import { SiteFooter } from './SiteFooter'

export function AuthenticatedLayout() {
  const { user, isAuthorized } = useAuth()
  const navigate = useNavigate(), location = useLocation()
  const [intent, setIntent] = useState<CollectionUpdateIntent | null>(null)
  const consume = useCallback((observed: CollectionUpdateIntent) => setIntent(current => current === observed ? null : current), [])
  useEffect(() => {
    let cancelled = false
    if (intent && (!isAuthorized || intent.viewerId !== user?.id || location.pathname !== `/collections/${intent.collectionId}`)) queueMicrotask(() => { if (!cancelled) consume(intent) })
    return () => { cancelled = true }
  }, [intent, isAuthorized, user?.id, location.pathname, consume])
  function openCollectionUpdate(collectionId: string, opener: HTMLElement | null) {
    if (!user || !isAuthorized) return
    setIntent({ viewerId: user.id, collectionId, opener })
    const destination = `/collections/${collectionId}`
    if (location.pathname !== destination) void navigate(destination)
  }
  return <div className="authenticated-shell">
    <AuthenticatedHeader onCollectionUpdate={openCollectionUpdate} />
    <main className="authenticated-content">
      <Outlet context={{ intent: isAuthorized && intent?.viewerId === user?.id ? intent : null, consume }} />
    </main>
    <SiteFooter />
  </div>
}
