import { useId } from 'react'
import { Link } from 'react-router'
import type { DashboardCollection } from '../../types/collections'
import { collectionPresentation } from '../collections/collection-presentation'
import { CollectionProgress } from '../collections/CollectionProgress'

export function CollectionTile({ collection }: { collection: DashboardCollection }) {
  const titleId = useId()
  const { typeLabel, style } = collectionPresentation(collection)

  return <article className="collection-card" style={style} aria-labelledby={titleId}>
    <Link className="collection-tile" to={`/collections/${encodeURIComponent(collection.collectionId)}`} aria-labelledby={titleId}>
      <h2 id={titleId}>{collection.name}</h2>
      <div className="collection-tile-meta">
        <p className="collection-access">{collection.access === 'owned' ? 'Personnelle' : <>Partagée<span className="collection-readonly"> · Lecture seule</span></>}</p>
        <p className="collection-type">{typeLabel}</p>
      </div>
      {collection.collectionType === 'automatic' && collection.targetName && collection.targetName !== collection.name
        && <p className="collection-target">{collection.targetName}</p>}
      <CollectionProgress collection={collection} />
    </Link>
  </article>
}
