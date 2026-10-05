import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { resolveFunctionalIdentity } from '../../lib/catalog-identity'
import { formatFrSource } from '../../lib/format-fr-source'
import { CatalogError, getCatalogCard } from '../../services/catalog'
import type { CatalogCard } from '../../types/catalog'
import { useAuth } from '../auth/auth-context'
import { CardImage } from '../collections/CardImage'
import { catalogCardKey } from './catalog-query'
import { CatalogContent } from './CatalogContent'
import { formatCatalogDate } from './format-catalog-date'
import { useCatalogView } from './useCatalogView'
import './catalog.css'

export function CatalogCardPage() {
  const { cardId = '' } = useParams()
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  return <CardPage key={`${user.id}:${cardId}`} viewerId={user.id} cardId={cardId} />
}

function CardPage({ viewerId, cardId }: { viewerId: string; cardId: string }) {
  const card = useQuery({ queryKey: catalogCardKey(viewerId, cardId), queryFn: () => getCatalogCard(cardId), retry: false })
  const view = useCatalogView(`card:${cardId}`)
  useEffect(() => { document.title = `${card.data?.nameFr || 'Carte'} — MY.` }, [card.data?.nameFr])
  return <section className="catalog-page" aria-label="Catalogue Carte">
    {card.isPending && <><h1 tabIndex={-1}>Carte</h1><p role="status">Chargement de la carte…</p></>}
    {card.isError && <><h1 tabIndex={-1}>Carte</h1>
      {card.error instanceof CatalogError && card.error.code === 'catalog_unavailable'
        ? <><p role="status">Cette carte n’est pas disponible dans le catalogue.</p><Link to="/dashboard">Revenir aux collections</Link></>
        : <><p role="alert">Impossible de charger cette carte.</p><button type="button" className="button secondary catalog-retry"
          disabled={card.isFetching} onClick={() => void card.refetch()}>Réessayer</button></>}
    </>}
    {card.isSuccess && <CardContent card={card.data} viewerId={viewerId} view={view} />}
  </section>
}

function CardContent({ card, viewerId, view }: { card: CatalogCard; viewerId: string; view: ReturnType<typeof useCatalogView> }) {
  const name = card.nameFr || 'Carte'
  const context = [formatFrSource(card.set.abbreviationFr, card.set.abbreviation), card.localId].filter(Boolean).join(' · ')
  const setName = card.set.nameFr || card.set.nameSource
  const series = card.series.nameFr || card.series.nameSource
  const releaseDate = formatCatalogDate(card.effectiveReleaseDate)
  const pokemon = card.pokemon.filter(entry => entry.nameFr)
  return <CatalogContent name={name} viewerId={viewerId} identity={resolveFunctionalIdentity('set')} card={card} view={view}>
    <header className="catalog-card-header">
      <CardImage url={card.imageUrl} name={name} placeholderAlt={`${name} — image indisponible`} />
      <div className="catalog-card-reference">
        <p className="catalog-eyebrow">Carte</p>
        <h1 tabIndex={-1}>{name}</h1>
        {context && <p className="catalog-card-reference-context">{context}</p>}
        {(setName || card.rarity || card.category || series || releaseDate) && <dl className="catalog-card-metadata">
          {setName && <div><dt>Extension</dt><dd><Link to={`/catalog/extensions/${card.set.setId}`}>{setName}</Link></dd></div>}
          {card.rarity && <div><dt>Rareté</dt><dd>{card.rarity}</dd></div>}
          {card.category && <div><dt>Catégorie</dt><dd>{card.category}</dd></div>}
          {series && <div><dt>Série</dt><dd>{series}</dd></div>}
          {releaseDate && <div><dt>Date de sortie</dt><dd><time dateTime={card.effectiveReleaseDate!}>{releaseDate}</time></dd></div>}
        </dl>}
        {pokemon.length > 0 && <div className="catalog-card-pokemon">
          <p>Pokémon associés</p>
          <div className="catalog-pokemon-links" role="group" aria-label="Pokémon associés">
            {pokemon.map((entry, index) => <span key={entry.pokemonId}>
              {index > 0 && <span className="catalog-link-separator" aria-hidden="true"> · </span>}
              <Link to={`/catalog/pokemon/${entry.pokemonId}`}>{entry.nameFr}</Link>
            </span>)}
          </div>
        </div>}
        <p className="catalog-count">{card.variants.length} {card.variants.length === 1 ? 'version' : 'versions'}</p>
      </div>
    </header>
  </CatalogContent>
}
