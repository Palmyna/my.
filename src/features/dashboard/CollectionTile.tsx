import { useId, type CSSProperties } from 'react'
import type { DashboardCollection } from '../../types/collections'
import { collectionColor } from './collection-color'

export function CollectionTile({ collection }: { collection: DashboardCollection }) {
  const titleId = useId()
  const color = collectionColor(collection)
  const percentage = collection.totalCount > 0 ? Math.round(collection.ownedCount / collection.totalCount * 100) : null
  const typeLabel = collection.collectionType === 'free' ? 'Personnalisée'
    : collection.targetType === 'pokemon' ? 'Automatique · Pokémon' : 'Automatique · Extension'
  const style = {
    '--collection-accent': color.accent,
    '--collection-surface': color.surface,
    '--collection-border': color.border,
  } as CSSProperties

  return <article className={`collection-tile collection-color-${color.name}`} style={style} aria-labelledby={titleId}>
    <p className="collection-type">{typeLabel}</p>
    <h3 id={titleId}>{collection.name}</h3>
    {collection.targetName && <p className="collection-target">{collection.targetName}</p>}
    {collection.access === 'shared' && <p className="collection-access">Partagée · Lecture seule</p>}
    <div className="collection-progress">
      <p className="collection-progress-label">Progression</p>
      <div className="collection-progress-values">
        <span className="collection-count">{collection.ownedCount} / {collection.totalCount}</span>
        <span className="collection-percentage">{percentage === null ? 'Collection vide' : `${percentage} %`}</span>
      </div>
      <div className="collection-progress-track" aria-hidden="true">
        <span style={{ width: `${percentage ?? 0}%` }} />
      </div>
    </div>
  </article>
}
