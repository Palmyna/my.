import { useQuery } from '@tanstack/react-query'
import { listDashboardCollections } from '../../services/collections'
import { useAuth } from '../auth/auth-context'
import { CollectionTile } from './CollectionTile'
import { CreateCollection } from './CreateCollection'
import { dashboardCollectionsKey } from './dashboard-query'

export function DashboardPage() {
  const { user, isAuthorized, passwordChanged } = useAuth()
  const collections = useQuery({
    queryKey: dashboardCollectionsKey(user?.id),
    queryFn: listDashboardCollections,
    enabled: isAuthorized && !!user,
    retry: false,
  })
  return <section className="authenticated-page dashboard-page" aria-labelledby="page-title">
    <div className="dashboard-heading">
      <h1 id="page-title" tabIndex={-1}>Collections</h1>
      {collections.isSuccess && <p className="dashboard-total">
        {collections.data.length} <span className="dashboard-total-word">{collections.data.length === 1 ? 'collection' : 'collections'}</span>
      </p>}
    </div>
    {isAuthorized && user && <CreateCollection key={user.id} userId={user.id} />}
    {passwordChanged && <p className="feedback" role="status">Mot de passe modifié. Vous êtes connecté.</p>}
    {collections.isPending && <p className="dashboard-status" role="status">Chargement des collections…</p>}
    {collections.isError && <div className="dashboard-error">
      <p role="alert">Impossible de charger les collections. Veuillez réessayer.</p>
      <button className="button" disabled={collections.isFetching} onClick={() => void collections.refetch()}>
        {collections.isFetching ? 'Nouvel essai…' : 'Réessayer'}
      </button>
    </div>}
    {collections.isPending && <div className="collection-grid" aria-hidden="true">
      {[0, 1, 2, 3].map(index => <div className="collection-skeleton" key={index}><span /><span /><span /></div>)}
    </div>}
    {collections.isSuccess && (collections.data.length ? <ul className="collection-grid" aria-label="Collections">
      {collections.data.map(collection => <li key={collection.collectionId}><CollectionTile collection={collection} /></li>)}
    </ul> : <p className="dashboard-empty">Aucune collection pour le moment.</p>)}
  </section>
}
