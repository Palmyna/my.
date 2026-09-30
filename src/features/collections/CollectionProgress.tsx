import type { DashboardCollection } from '../../types/collections'

export function CollectionProgress({ collection }: { collection: Pick<DashboardCollection, 'ownedCount' | 'totalCount'> }) {
  const percentage = collection.totalCount > 0 ? Math.round(collection.ownedCount / collection.totalCount * 100) : null
  return <div className="collection-progress">
    <p className="collection-progress-label">Progression</p>
    <div className="collection-progress-values">
      <span className="collection-count">{collection.ownedCount} / {collection.totalCount}</span>
      <span className="collection-percentage">{percentage === null ? 'Collection vide' : `${percentage} %`}</span>
    </div>
    <div className="collection-progress-track" aria-hidden="true">
      <span style={{ width: `${percentage ?? 0}%` }} />
    </div>
  </div>
}
