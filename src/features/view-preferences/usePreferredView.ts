import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_USER_PREFERENCES } from '../../lib/view-preferences'
import { saveUserPreferences } from '../../services/view-preferences'
import type { CollectionView, UserPreferences } from '../../types/view-preferences'
import { useAuth } from '../auth/auth-context'
import { confirmUserPreferences, userPreferencesKey, userPreferencesOptions } from '../view-preferences/view-preferences-query'

type Choice<View> = { view: View; token: object }
type ViewState<View> = { resource: string; pending: Choice<View> | null; confirmed: View | null }
type Lifetime = { resource: string }

export function usePreferredView<View extends CollectionView>(resourceId: string, config: {
  kind: 'catalog' | 'collection'; lastField: 'lastCatalogView' | 'lastCollectionView'
  available: readonly View[]; resolve: (preferences: UserPreferences) => View
}) {
  const { user, isAuthorized } = useAuth()
  const viewerId = isAuthorized ? user?.id : undefined
  const resource = `${viewerId}:${resourceId}`
  const client = useQueryClient()
  const live = useRef<Lifetime | null>(null)
  useEffect(() => {
    live.current = { resource }
    return () => { live.current = null }
  }, [resource])
  const preferences = useQuery(userPreferencesOptions(viewerId))
  const [state, setState] = useState<ViewState<View>>({ resource, pending: null, confirmed: null })
  // Reset before rendering another viewer/resource, without an effect flash.
  if (state.resource !== resource) setState({ resource, pending: null, confirmed: null })
  const active = state.resource === resource ? state : null
  const candidate = config.resolve(
    viewerId && preferences.isSuccess ? preferences.data : DEFAULT_USER_PREFERENCES,
  )
  const resolved = config.available.includes(candidate) ? candidate : config.available[0]!
  // Opening defaults initialize this consultation once. Global changes apply
  // to the next opening, without replacing an already open resource's view.
  if (state.resource === resource && state.confirmed === null && viewerId && (preferences.isSuccess || preferences.isError)) {
    setState({ ...state, confirmed: resolved })
  }
  const mutation = useMutation({
    mutationKey: [...userPreferencesKey(viewerId), `last-${config.kind}-view`],
    scope: { id: `last-${config.kind}-view:${viewerId}` },
    retry: false,
    mutationFn: (request: Choice<View> & { viewerId: string; resource: string; lifetime: Lifetime }) =>
      saveUserPreferences(request.viewerId, { [config.lastField]: request.view }),
    onSuccess: async (data, request) => {
      if (live.current !== request.lifetime) return
      const queryKey = userPreferencesKey(request.viewerId)
      await client.cancelQueries({ queryKey, exact: true })
      if (live.current !== request.lifetime) return
      // Only the authoritative service response enters the preferences cache.
      confirmUserPreferences(client, request.viewerId, data, [config.lastField])
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

  async function setCurrentView(view: View): Promise<boolean> {
    const lifetime = live.current
    if (!viewerId || lifetime?.resource !== resource || !config.available.includes(view)) return false
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
