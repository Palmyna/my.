import { CompactVariantSummary } from './CompactVariantSummary'
import { CollectionItemMenu } from './CollectionItemMenu'
import type { CollectionContentItem } from '../../types/collection-content'

export function CollectionContentRow({ item, readOnly, onCopies, onDetail, busy = false, onRemove, view = 'list' }: {
  item: CollectionContentItem; readOnly: boolean; onCopies: () => void; busy?: boolean
  onRemove?: (opener: HTMLElement) => void
  onDetail: (opener: HTMLElement) => void
  view?: 'list' | 'cards'
}) {
  const name = item.cardNameFr || 'Nom indisponible'
  const actionName = view === 'cards' ? `${name} · ${item.variantLabel || 'Variante indisponible'}` : name
  const actions = <div className="collection-content-actions">
    <button type="button" className="collection-copies-trigger" onClick={onCopies}
      aria-label={`${readOnly ? 'Consulter' : 'Gérer'} les exemplaires de ${actionName}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M3 8h18v13H3z M3 8l3-5h12l3 5 M3 12h18 M10 10h4v5h-4z" />
      </svg>
      <span className="visually-hidden">Exemplaires</span>
    </button>
    {!readOnly && item.origin === 'manual' && onRemove && <CollectionItemMenu name={actionName} busy={busy} onRemove={onRemove} />}
  </div>
  return <div className={`collection-content-row${view === 'cards' ? ' collection-content-card' : ''}${item.owned ? '' : ' is-missing'}`}>
    <div className="collection-detail-surface">
      {/* Same sibling surface/link pattern as CatalogVariants. Actions stay outside. */}
      <button type="button" className="collection-detail-trigger" aria-haspopup="dialog" aria-label={`Voir le détail de ${actionName}`}
        onClick={event => onDetail(event.currentTarget)} />
      <CompactVariantSummary variant={item} catalogLinks={item} showVariantFallback={view === 'cards'} />
    </div>
    <span className="visually-hidden">{item.owned ? 'Carte possédée' : 'Carte manquante'}</span>
    {view === 'cards' ? <div className="collection-card-image-overlay">{actions}</div> : actions}
  </div>
}
