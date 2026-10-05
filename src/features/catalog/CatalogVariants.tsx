import { formatFrSource } from '../../lib/format-fr-source'
import type { CatalogPokemonVariant } from '../../types/catalog'
import type { CatalogView } from '../../types/view-preferences'
import { CardImage } from '../collections/CardImage'

export function CatalogVariants({ variants, view, onDetail }: {
  variants: CatalogPokemonVariant[]; view: CatalogView
  onDetail: (variantId: string, opener: HTMLButtonElement) => void
}) {
  return <ul className={`catalog-variants catalog-variants-${view}`} aria-label="Versions du catalogue">
    {variants.map(variant => {
      const name = variant.cardNameFr || 'Nom indisponible'
      const context = [formatFrSource(variant.setAbbreviationFr, variant.setAbbreviation), variant.localId].filter(Boolean).join(' · ')
      const label = variant.variantLabel || 'Variante indisponible'
      return <li key={variant.variantId}><article className="catalog-variant">
        {/* Sibling interaction surface leaves card/set text free for future independent links. */}
        <button type="button" className="catalog-detail-trigger" aria-haspopup="dialog"
          aria-label={`Voir le détail de ${[name, context, label].filter(Boolean).join(' · ')}`}
          onClick={event => onDetail(variant.variantId, event.currentTarget)} />
        <CardImage url={variant.imageUrl} name={name} />
        <div className="catalog-variant-info">
          <div className="catalog-variant-summary"><span className="catalog-card-name">{name}</span>
            {context && <span className="catalog-card-context">{context}</span>}</div>
          <span className="catalog-variant-label">{label}</span>
        </div>
      </article></li>
    })}
  </ul>
}
