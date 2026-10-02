import type { CollectionView } from '../../types/view-preferences'
import { availableCollectionViews } from './collection-views'

export function CollectionViewSelector({ currentView, onChange }: {
  currentView: CollectionView; onChange: (view: CollectionView) => Promise<boolean>
}) {
  const labels = { list: 'Liste', cards: 'Cartes', binder: 'Classeur' }
  return <div className="collection-view-selector" role="group" aria-label="Vue de la collection">
    {availableCollectionViews.map(view => <button key={view} type="button" aria-label={labels[view]}
      title={labels[view]} aria-pressed={currentView === view}
      onClick={() => { if (view !== currentView) void onChange(view) }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {view === 'list' ? <path d="M3 5h2m3 0h9M3 10h2m3 0h9M3 15h2m3 0h9" />
          : view === 'cards' ? <><rect x="3" y="2.5" width="5.5" height="7" rx="1" /><rect x="11.5" y="2.5" width="5.5" height="7" rx="1" /><rect x="3" y="12" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="12" width="5.5" height="5.5" rx="1" /></>
            : <><path d="M10 3v14M2 3h6l2 1 2-1h6v14h-6l-2 1-2-1H2z" /><path d="M4 6h3v3H4zM13 6h3v3h-3zM4 11h3v3H4zM13 11h3v3h-3z" /></>}
      </svg>
    </button>)}
  </div>
}
