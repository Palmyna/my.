import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CollectionsError, getCollectionOverview } from '../../services/collections'
import { useAuth } from '../auth/auth-context'
import { CollectionProgress } from './CollectionProgress'
import { collectionPresentation } from './collection-presentation'
import { collectionContentKey, collectionItemOrderKey, collectionOverviewKey } from './collection-query'
import { CollectionContentLoader } from './CollectionContentLoader'
import { CollectionActions } from './CollectionActions'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'

export function CollectionPage() {
  const { collectionId = '' } = useParams()
  const { user, isAuthorized } = useAuth()
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const [unavailableResource, setUnavailableResource] = useState<string | null>(null)
  const resource = `${user?.id}:${collectionId}`
  const mutationUnavailable = unavailableResource === resource
  const overview = useQuery({
    queryKey: collectionOverviewKey(user?.id, collectionId),
    queryFn: () => getCollectionOverview(collectionId),
    enabled: isAuthorized && !!user && !mutationUnavailable,
    retry: false,
  })
  const unavailable = mutationUnavailable || (overview.error instanceof CollectionsError
    && (overview.error.code === 'collection_unavailable' || overview.error.code === 'not_authorized'))
  // Never retain cached private content on a failed read (including revoked shares).
  const collection = isAuthorized && user && overview.isSuccess && !mutationUnavailable ? overview.data : undefined
  const presentation = collection ? collectionPresentation(collection) : undefined
  const title = collection?.name ?? (unavailable ? 'Collection indisponible' : 'Collection')

  // AppRoutes focuses this persistent h1 on navigation. Updating its text/title after
  // loading must not steal focus if the user has already moved to another control.
  useEffect(() => { document.title = `${title} — MY.` }, [title])
  useEffect(() => { if (mutationUnavailable) heading.current?.focus() }, [mutationUnavailable])
  useEffect(() => {
    if (isAuthorized && !overview.isError && !mutationUnavailable) return
    // Unmount private rows/dialogs immediately; cancel before clearing so late
    // responses cannot repopulate the revoked collection's cache.
    for (const queryKey of [collectionContentKey(user?.id, collectionId), collectionItemOrderKey(user?.id, collectionId)]) {
      void client.cancelQueries({ queryKey, exact: true })
      client.removeQueries({ queryKey, exact: true })
    }
    void client.cancelQueries({ queryKey: ['physical-copies', user?.id] })
    client.removeQueries({ queryKey: ['physical-copies', user?.id] })
  }, [client, collectionId, isAuthorized, mutationUnavailable, overview.isError, user?.id])

  function markUnavailable() {
    setUnavailableResource(resource)
    const detail = { queryKey: collectionOverviewKey(user?.id, collectionId), exact: true }
    void client.cancelQueries(detail)
    client.removeQueries(detail)
    void client.invalidateQueries({ queryKey: dashboardCollectionsKey(user?.id), exact: true })
  }

  return <section className="authenticated-page collection-page" aria-labelledby="page-title">
    <Link className="collection-back" to="/dashboard">Retour au Dashboard</Link>
    <div className={`collection-overview ${presentation?.colorClassName ?? ''}`} style={presentation?.style}>
      <header className="collection-heading">
        <h1 ref={heading} id="page-title" tabIndex={-1}>{title}</h1>
        {collection?.access === 'owned' && user && <CollectionActions key={resource} collection={collection} userId={user.id} unavailable={markUnavailable} />}
      </header>
      {collection && <>
        <div className="collection-overview-meta">
          <p className="collection-type">{presentation?.typeLabel}</p>
          {collection.access === 'shared' && <p className="collection-access">Partagée · Lecture seule</p>}
        </div>
        {collection.collectionType === 'automatic' && collection.targetName && <p className="collection-target">{collection.targetName}</p>}
        <CollectionProgress collection={collection} />
      </>}
      {overview.isPending && !mutationUnavailable && <>
        <p className="collection-page-status" role="status">Chargement de la collection…</p>
        <div className="collection-skeleton" aria-hidden="true"><span /><span /><span /></div>
      </>}
      {(overview.isError || mutationUnavailable) && (unavailable
        ? <p className="collection-page-status" role="alert">Cette collection n’existe pas ou vous n’y avez plus accès.</p>
        : <div className="collection-page-error">
          <p role="alert">Impossible de charger la collection. Veuillez réessayer.</p>
          <button className="button" disabled={overview.isFetching} onClick={() => void overview.refetch()}>
            {overview.isFetching ? 'Nouvel essai…' : 'Réessayer'}
          </button>
        </div>)}
    </div>
    {collection && user && <CollectionContentLoader key={resource} collection={collection} viewerId={user.id} />}
  </section>
}
