import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_USER_PREFERENCES, resolveCollectionView } from '../../lib/view-preferences'
import { getUserPreferences, saveUserPreferences } from '../../services/view-preferences'
import type { CollectionView } from '../../types/view-preferences'
import { useAuth } from '../auth/auth-context'
import { userPreferencesKey } from '../view-preferences/view-preferences-query'
import { availableCollectionView, availableCollectionViews } from './collection-views'

type Choice = { view: CollectionView; token: object }
type ViewState = { resource: string; pending: Choice | null; confirmed: CollectionView | null }
type Lifetime = { resource: string }

export function useCollectionView(collectionId: string) {
  const { user, isAuthorized } = useAuth()
  const viewerId = isAuthorized ? user?.id : undefined
  const resource = `${viewerId}:${collectionId}`
  const client = useQueryClient()
  const live = useRef<Lifetime | null>(null)
  useEffect(() => {
    live.current = { resource }
    return () => { live.current = null }
  }, [resource])
  const preferences = useQuery({
    queryKey: userPreferencesKey(viewerId),
    queryFn: () => getUserPreferences(viewerId!),
    enabled: !!viewerId,
    retry: false,
  })
  const [state, setState] = useState<ViewState>({ resource, pending: null, confirmed: null })
  // Reset before rendering another viewer/collection, without an effect flash.
  if (state.resource !== resource) setState({ resource, pending: null, confirmed: null })
  const active = state.resource === resource ? state : null
  const resolved = availableCollectionView(resolveCollectionView(
    viewerId && preferences.isSuccess ? preferences.data : DEFAULT_USER_PREFERENCES,
  ))
  const mutation = useMutation({
    mutationKey: [...userPreferencesKey(viewerId), 'last-collection-view'],
    scope: { id: `last-collection-view:${viewerId}` },
    retry: false,
    mutationFn: (request: Choice & { viewerId: string; resource: string; lifetime: Lifetime }) =>
      saveUserPreferences(request.viewerId, { lastCollectionView: request.view }),
    onSuccess: async (data, request) => {
      if (live.current !== request.lifetime) return
      const queryKey = userPreferencesKey(request.viewerId)
      await client.cancelQueries({ queryKey, exact: true })
      if (live.current !== request.lifetime) return
      // Only the authoritative service response enters the preferences cache.
      client.setQueryData(queryKey, data)
      setState(previous => previous.resource === request.resource ? {
        ...previous, confirmed: request.view,
        pending: previous.pending?.token === request.token ? null : previous.pending,
      } : previous)
    },
    onError: async (_error, request) => {
      if (live.current !== request.lifetime) return
      setState(previous => previous.resource === request.resource && previous.pending?.token === request.token
        ? { ...previous, pending: null } : previous)
      // A transport failure may follow a committed write. Reconcile privately.
      const queryKey = userPreferencesKey(request.viewerId)
      await client.cancelQueries({ queryKey, exact: true })
      if (live.current === request.lifetime) await client.invalidateQueries({ queryKey, exact: true })
    },
  })

  async function setCurrentView(view: CollectionView): Promise<boolean> {
    const lifetime = live.current
    if (!viewerId || lifetime?.resource !== resource || !availableCollectionViews.includes(view)) return false
    const choice = { view, token: {} }
    setState(previous => ({
      resource, confirmed: previous.resource === resource ? previous.confirmed : null, pending: choice,
    }))
    try {
      await mutation.mutateAsync({ ...choice, viewerId, resource, lifetime })
      return true
    } catch { return false }
  }

  return {
    currentView: active?.pending?.view ?? active?.confirmed ?? resolved,
    setCurrentView,
    isPreferencesLoading: !!viewerId && preferences.isPending,
  }
}
