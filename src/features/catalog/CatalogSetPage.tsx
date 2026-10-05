import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { resolveFunctionalIdentity } from '../../lib/catalog-identity'
import { formatFrSource } from '../../lib/format-fr-source'
import { CatalogError, getCatalogSet } from '../../services/catalog'
import type { CatalogSet } from '../../types/catalog'
import { useAuth } from '../auth/auth-context'
import { CatalogCollectionAction } from './CatalogCollectionAction'
import { CatalogContent } from './CatalogContent'
import { catalogSetKey } from './catalog-query'
import { formatCatalogDate } from './format-catalog-date'
import { useCatalogView } from './useCatalogView'
import './catalog.css'

export function CatalogSetPage() {
  const { setId = '' } = useParams()
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  return <SetPage key={`${user.id}:${setId}`} viewerId={user.id} setId={setId} />
}

function SetPage({ viewerId, setId }: { viewerId: string; setId: string }) {
  const set = useQuery({ queryKey: catalogSetKey(viewerId, setId), queryFn: () => getCatalogSet(setId), retry: false })
  const view = useCatalogView(`set:${setId}`)
  useEffect(() => { document.title = `${set.data?.nameFr || set.data?.nameSource || 'Extension'} — MY.` }, [set.data?.nameFr, set.data?.nameSource])
  return <section className="catalog-page" aria-label="Catalogue Extension">
    {set.isPending && <><h1 tabIndex={-1}>Extension</h1><p role="status">Chargement de l’Extension…</p></>}
    {set.isError && <><h1 tabIndex={-1}>Extension</h1>
      {set.error instanceof CatalogError && set.error.code === 'catalog_unavailable'
        ? <><p role="status">Cette Extension n’est pas disponible dans le catalogue.</p><Link to="/dashboard">Revenir aux collections</Link></>
        : <><p role="alert">Impossible de charger cette Extension.</p><button type="button" className="button secondary catalog-retry"
          disabled={set.isFetching} onClick={() => void set.refetch()}>Réessayer</button></>}
    </>}
    {set.isSuccess && <SetContent set={set.data} viewerId={viewerId} view={view} />}
  </section>
}

function SetContent({ set, viewerId, view }: { set: CatalogSet; viewerId: string; view: ReturnType<typeof useCatalogView> }) {
  const name = set.nameFr || set.nameSource || 'Nom indisponible'
  const abbreviation = formatFrSource(set.abbreviationFr, set.abbreviation)
  const series = set.series.nameFr || set.series.nameSource
  const releaseDate = formatCatalogDate(set.releaseDate)
  return <CatalogContent name={name} viewerId={viewerId} identity={resolveFunctionalIdentity('set')} variants={set.variants} set={set} view={view}>
    <header className="catalog-set-header">
      <div className="catalog-set-identity">
        <div className="catalog-set-text">
          <p className="catalog-eyebrow">Extension</p>
          <h1 tabIndex={-1}>{name}</h1>
          {set.nameSource && set.nameSource !== name && <p className="catalog-set-source">{set.nameSource}</p>}
          <div className="catalog-set-abbreviation">
            {abbreviation && <span>{abbreviation}</span>}
            <HeaderImage url={set.symbolUrl} className="catalog-set-symbol" />
          </div>
          {(series || releaseDate) && <p className="catalog-set-metadata">
            {series && <span>{series}</span>}
            {releaseDate && <time dateTime={set.releaseDate!}>{releaseDate}</time>}
          </p>}
          <p className="catalog-count">{set.variantCount} {set.variantCount === 1 ? 'version' : 'versions'}</p>
        </div>
        <HeaderImage url={set.logoUrl} className="catalog-set-logo" />
      </div>
      <CatalogCollectionAction viewerId={viewerId} targetType="set" targetId={set.setId} targetName={name} />
    </header>
  </CatalogContent>
}

// Identity is already named in the header; optional assets add no redundant announcement.
function HeaderImage({ url, className }: { url: string | null; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) return null
  return <img src={url} alt="" className={className} onError={() => setFailedUrl(url)} />
}
