import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { CollectionsError, getCollectionOverview } from '../../services/collections'
import { useAuth } from '../auth/auth-context'
import { CollectionProgress } from './CollectionProgress'
import { collectionPresentation } from './collection-presentation'
import { collectionOverviewKey } from './collection-query'

export function CollectionPage() {
  const { collectionId = '' } = useParams()
  const { user, isAuthorized } = useAuth()
  const overview = useQuery({
    queryKey: collectionOverviewKey(user?.id, collectionId),
    queryFn: () => getCollectionOverview(collectionId),
    enabled: isAuthorized && !!user,
    retry: false,
  })
  const unavailable = overview.error instanceof CollectionsError
    && (overview.error.code === 'collection_unavailable' || overview.error.code === 'not_authorized')
  // Never retain cached private content on a failed read (including revoked shares).
  const collection = overview.isSuccess ? overview.data : undefined
  const presentation = collection ? collectionPresentation(collection) : undefined
  const title = collection?.name ?? (unavailable ? 'Collection indisponible' : 'Collection')

  // AppRoutes focuses this persistent h1 on navigation. Updating its text/title after
  // loading must not steal focus if the user has already moved to another control.
  useEffect(() => { document.title = `${title} — MY.` }, [title])

  return <section className="authenticated-page collection-page" aria-labelledby="page-title">
    <Link className="collection-back" to="/dashboard">Retour au Dashboard</Link>
    <div className={`collection-overview ${presentation?.colorClassName ?? ''}`} style={presentation?.style}>
      <h1 id="page-title" tabIndex={-1}>{title}</h1>
      {collection && <>
        <div className="collection-overview-meta">
          <p className="collection-type">{presentation?.typeLabel}</p>
          <p className="collection-access">{collection.access === 'shared' ? 'Partagée · Lecture seule' : 'Votre collection'}</p>
        </div>
        {collection.collectionType === 'automatic' && collection.targetName && <p className="collection-target">{collection.targetName}</p>}
        <CollectionProgress collection={collection} />
      </>}
      {overview.isPending && <>
        <p className="collection-page-status" role="status">Chargement de la collection…</p>
        <div className="collection-skeleton" aria-hidden="true"><span /><span /><span /></div>
      </>}
      {overview.isError && (unavailable
        ? <p className="collection-page-status" role="alert">Cette collection n’existe pas ou vous n’y avez plus accès.</p>
        : <div className="collection-page-error">
          <p role="alert">Impossible de charger la collection. Veuillez réessayer.</p>
          <button className="button" disabled={overview.isFetching} onClick={() => void overview.refetch()}>
            {overview.isFetching ? 'Nouvel essai…' : 'Réessayer'}
          </button>
        </div>)}
    </div>
  </section>
}
