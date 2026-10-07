import type { CatalogVariantForAdd } from '../../types/catalog-search'
import type { CollectionContentItem } from '../../types/collection-content'
import { CardImage } from './CardImage'
import { formatFrSource } from '../../lib/format-fr-source'
import { Link } from 'react-router'

export function CompactVariantSummary({ variant, origin, showVariantFallback = false, catalogLinks }: {
  variant: CatalogVariantForAdd; origin?: CollectionContentItem['origin'] | undefined
  showVariantFallback?: boolean
  catalogLinks?: Pick<CollectionContentItem, 'sourceCardId' | 'setId'>
}) {
  const name = variant.cardNameFr || 'Nom indisponible'
  const extension = formatFrSource(variant.setAbbreviationFr, variant.setAbbreviation)
  const label = [name, extension, variant.localId].filter(Boolean).join(' · ')
  return <>
    <CardImage key={variant.imageUrl} url={variant.imageUrl} name={name} />
    <span className="collection-content-info">
      <span className="collection-content-title">
        <span className="collection-content-name" title={label}>{catalogLinks ? <>
          <Link to={`/catalog/cards/${catalogLinks.sourceCardId}`}>{name}</Link>
          {extension && <> · <Link to={`/catalog/extensions/${catalogLinks.setId}`}>{extension}</Link></>}
          {variant.localId && <> · <span>{variant.localId}</span></>}
        </> : label}</span>
        {origin && <span className="collection-content-origin"><span className="visually-hidden">Origine : </span>{origin === 'automatic' ? 'Auto' : 'Perso'}</span>}
      </span>
      {(variant.variantLabel || showVariantFallback) && <span className="collection-content-variant" title={variant.variantLabel || 'Variante indisponible'}>{variant.variantLabel || 'Variante indisponible'}</span>}
    </span>
  </>
}
