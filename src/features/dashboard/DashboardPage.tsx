import { useQuery } from '@tanstack/react-query'
import { listDashboardCollections } from '../../services/collections'
import { useAuth } from '../auth/auth-context'
import { CollectionTile } from './CollectionTile'

const sections = [
  { access: 'owned', title: 'Mes collections', empty: 'Vous n’avez pas encore de collection.' },
  { access: 'shared', title: 'Collections partagées avec moi', empty: 'Aucune collection ne vous est partagée pour le moment.' },
] as const

export function DashboardPage() {
  const { user, isAuthorized, passwordChanged } = useAuth()
  const collections = useQuery({
    queryKey: ['collections', 'dashboard', user?.id],
    queryFn: listDashboardCollections,
    enabled: isAuthorized && !!user,
    retry: false,
  })
  return <section className="authenticated-page dashboard-page" aria-labelledby="page-title">
    <h1 id="page-title" tabIndex={-1}>Dashboard</h1>
    <p className="intro">Vos collections, leur progression et celles partagées avec vous.</p>
    {passwordChanged && <p className="feedback" role="status">Mot de passe modifié. Vous êtes connecté.</p>}
    {collections.isPending && <p className="dashboard-status" role="status">Chargement des collections…</p>}
    {collections.isError && <div className="dashboard-error">
      <p role="alert">Impossible de charger les collections. Veuillez réessayer.</p>
      <button className="button" disabled={collections.isFetching} onClick={() => void collections.refetch()}>
        {collections.isFetching ? 'Nouvel essai…' : 'Réessayer'}
      </button>
    </div>}
    {sections.map(section => {
      const entries = collections.data?.filter(collection => collection.access === section.access)
      return <section className="dashboard-section" key={section.access} aria-labelledby={`collections-${section.access}`}>
        <h2 id={`collections-${section.access}`}>{section.title}</h2>
        {collections.isPending ? <div className="collection-grid" aria-hidden="true">
          {[0, 1, 2].map(index => <div className="collection-skeleton" key={index}><span /><span /><span /></div>)}
        </div> : !collections.isError && (entries?.length ? <ul className="collection-grid">
          {entries.map(collection => <li key={collection.collectionId}><CollectionTile collection={collection} /></li>)}
        </ul> : <p className="dashboard-empty">{section.empty}</p>)}
      </section>
    })}
  </section>
}
