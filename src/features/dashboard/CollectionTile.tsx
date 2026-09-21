import { useId } from 'react'
import { Link } from 'react-router'
import type { DashboardCollection } from '../../types/collections'
import { collectionPresentation } from '../collections/collection-presentation'
import { CollectionProgress } from '../collections/CollectionProgress'

export function CollectionTile({ collection }: { collection: DashboardCollection }) {
  const titleId = useId()
  const { typeLabel, colorClassName, style } = collectionPresentation(collection)

  return <article className={`collection-card ${colorClassName}`} style={style} aria-labelledby={titleId}>
    <Link className="collection-tile" to={`/collections/${encodeURIComponent(collection.collectionId)}`} aria-labelledby={titleId}>
      <p className="collection-type">{typeLabel}</p>
      <h3 id={titleId}>{collection.name}</h3>
      {collection.targetName && <p className="collection-target">{collection.targetName}</p>}
      {collection.access === 'shared' && <p className="collection-access">Partagée · Lecture seule</p>}
      <CollectionProgress collection={collection} />
    </Link>
  </article>
}
