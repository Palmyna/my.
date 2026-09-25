import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { CollectionOverview } from '../../types/collections'

const ContentList = lazy(() => import('./CollectionContentList').then(module => ({ default: module.CollectionContentList })))

// Keep DnD and copy management out of the initial app bundle. A failed chunk
// download must leave the overview usable, with an explicit recovery action.
export class CollectionContentLoader extends Component<{ collection: CollectionOverview; viewerId: string }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }

  override render(): ReactNode {
    if (this.state.failed) return <div className="collection-page-error">
      <p role="alert">Impossible de charger la liste. Veuillez recharger la page.</p>
      <button className="button" onClick={() => window.location.reload()}>Recharger la page</button>
    </div>
    return <Suspense fallback={<p role="status">Chargement des cartes…</p>}>
      <ContentList {...this.props} />
    </Suspense>
  }
}
