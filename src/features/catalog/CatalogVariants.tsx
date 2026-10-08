import { Link } from 'react-router'
import { formatFrSource } from '../../lib/format-fr-source'
import type { CatalogCard, CatalogPokemonVariant, CatalogSetSummary, CatalogSetVariant, CatalogVariant } from '../../types/catalog'
import type { CatalogView } from '../../types/view-preferences'
import { CardImage } from '../collections/CardImage'
import { formatCatalogDate } from './format-catalog-date'

export function CatalogVariants({ variants, set, card, view, onDetail }: {
  variants: (CatalogVariant | CatalogPokemonVariant | CatalogSetVariant)[]
  set?: CatalogSetSummary | undefined; card?: CatalogCard | undefined; view: CatalogView
  onDetail: (variantId: string, opener: HTMLButtonElement) => void
}) {
  return <ul className={`catalog-variants catalog-variants-${view}`} aria-label="Versions du catalogue">
    {variants.map(variant => {
      const name = 'cardNameFr' in variant ? variant.cardNameFr || 'Nom indisponible' : card?.nameFr || 'Carte'
      const abbreviation = 'setAbbreviationFr' in variant
        ? formatFrSource(variant.setAbbreviationFr, variant.setAbbreviation)
        : formatFrSource((set ?? card?.set)?.abbreviationFr ?? null, (set ?? card?.set)?.abbreviation ?? null)
      const extension = 'setId' in variant ? abbreviation || variant.setNameFr || variant.setNameSource : abbreviation
      const context = 'localId' in variant ? [extension, variant.localId].filter(Boolean).join(' · ') : ''
      const label = variant.variantLabel || 'Variante indisponible'
      const number = 'localId' in variant ? variant.localId : card?.localId
      const cardExtension = 'setId' in variant ? extension : abbreviation
      const cardContext = [cardExtension, number].filter(Boolean).join(' · ')
      const releaseDate = card && variant.effectiveReleaseDate !== card.effectiveReleaseDate
        ? formatCatalogDate(variant.effectiveReleaseDate) : null
      return <li key={variant.variantId}><article className="catalog-variant">
        {/* Detail surface and Catalogue links are siblings, never nested controls. */}
        <button type="button" className="catalog-detail-trigger" aria-haspopup="dialog"
          aria-label={`Voir le détail de ${[name, view === 'cards' ? cardContext : context, label].filter(Boolean).join(' · ')}`}
          onClick={event => onDetail(variant.variantId, event.currentTarget)} />
        <CardImage url={variant.imageUrl} name={name} />
        <div className="catalog-variant-info">
          {view === 'cards' ? <div className="catalog-card-line">
            {'sourceCardId' in variant ? <Link to={`/catalog/cards/${variant.sourceCardId}`}>{name}</Link> : <span>{name}</span>}
            {cardExtension && <><span aria-hidden="true"> · </span>{'setId' in variant
              ? <Link to={`/catalog/extensions/${variant.setId}`}>{cardExtension}</Link> : <span>{cardExtension}</span>}</>}
            {number && <><span aria-hidden="true"> · </span><span>{number}</span></>}
          </div> : 'sourceCardId' in variant && <div className="catalog-variant-summary">
            <Link className="catalog-card-name" to={`/catalog/cards/${variant.sourceCardId}`}>{name}</Link>
            {context && <span className="catalog-card-context">
              {'setId' in variant && extension
                ? <><Link to={`/catalog/extensions/${variant.setId}`}>{extension}</Link>{variant.localId && ` · ${variant.localId}`}</>
                : context}
            </span>}
          </div>}
          <span className="catalog-variant-label">{label}</span>
          {view === 'list' && releaseDate && <time className="catalog-variant-date" dateTime={variant.effectiveReleaseDate!}>{releaseDate}</time>}
          {view === 'list' && 'pokemon' in variant && variant.pokemon.length > 0 && <div className="catalog-pokemon-links" role="group" aria-label="Pokémon">
            {variant.pokemon.map((pokemon, index) => <span key={pokemon.pokemonId}>
              {index > 0 && <span className="catalog-link-separator" aria-hidden="true"> · </span>}
              <Link to={`/catalog/pokemon/${pokemon.pokemonId}`}>{pokemon.nameFr || 'Nom indisponible'}</Link>
            </span>)}
          </div>}
        </div>
      </article></li>
    })}
  </ul>
}
