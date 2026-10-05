import { Link } from 'react-router'
import { formatFrSource } from '../../lib/format-fr-source'
import type { CatalogPokemonVariant, CatalogSetSummary, CatalogSetVariant } from '../../types/catalog'
import type { CatalogView } from '../../types/view-preferences'
import { CardImage } from '../collections/CardImage'

export function CatalogVariants({ variants, set, view, onDetail }: {
  variants: (CatalogPokemonVariant | CatalogSetVariant)[]; set?: CatalogSetSummary | undefined; view: CatalogView
  onDetail: (variantId: string, opener: HTMLButtonElement) => void
}) {
  return <ul className={`catalog-variants catalog-variants-${view}`} aria-label="Versions du catalogue">
    {variants.map(variant => {
      const name = variant.cardNameFr || 'Nom indisponible'
      const abbreviation = 'setAbbreviationFr' in variant
        ? formatFrSource(variant.setAbbreviationFr, variant.setAbbreviation)
        : formatFrSource(set?.abbreviationFr ?? null, set?.abbreviation ?? null)
      const context = [abbreviation, variant.localId].filter(Boolean).join(' · ')
      const label = variant.variantLabel || 'Variante indisponible'
      return <li key={variant.variantId}><article className="catalog-variant">
        {/* Main surface and Pokémon links are siblings, never nested controls. */}
        <button type="button" className="catalog-detail-trigger" aria-haspopup="dialog"
          aria-label={`Voir le détail de ${[name, context, label].filter(Boolean).join(' · ')}`}
          onClick={event => onDetail(variant.variantId, event.currentTarget)} />
        <CardImage url={variant.imageUrl} name={name} />
        <div className="catalog-variant-info">
          <div className="catalog-variant-summary"><span className="catalog-card-name">{name}</span>
            {context && <span className="catalog-card-context">{context}</span>}</div>
          <span className="catalog-variant-label">{label}</span>
          {'pokemon' in variant && variant.pokemon.length > 0 && <div className="catalog-pokemon-links" role="group" aria-label="Pokémon associés">
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
