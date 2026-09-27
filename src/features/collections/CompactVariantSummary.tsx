import type { CatalogVariantForAdd } from '../../types/catalog-search'
import type { CollectionContentItem } from '../../types/collection-content'
import { CardImage } from './CardImage'

export function CompactVariantSummary({ variant, origin }: {
  variant: CatalogVariantForAdd; origin?: CollectionContentItem['origin'] | undefined
}) {
  const name = variant.cardNameFr || 'Nom indisponible'
  const label = [name, variant.setAbbreviation, variant.localId].filter(Boolean).join(' · ')
  return <>
    <CardImage key={variant.imageUrl} url={variant.imageUrl} name={name} />
    <span className="collection-content-info">
      <span className="collection-content-title">
        <span className="collection-content-name" title={label}>{label}</span>
        {origin && <span className="collection-content-origin"><span className="visually-hidden">Origine : </span>{origin === 'automatic' ? 'Auto' : 'Perso'}</span>}
      </span>
      {variant.variantLabel && <span className="collection-content-variant" title={variant.variantLabel}>{variant.variantLabel}</span>}
    </span>
  </>
}
