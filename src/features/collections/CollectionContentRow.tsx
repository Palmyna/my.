import { CompactVariantSummary } from './CompactVariantSummary'
import { CollectionItemMenu } from './CollectionItemMenu'
import type { CollectionContentItem } from '../../types/collection-content'

export function CollectionContentRow({ item, readOnly, onCopies, automatic = false, busy = false, onRemove }: {
  item: CollectionContentItem; readOnly: boolean; onCopies: () => void; automatic?: boolean; busy?: boolean
  onRemove?: (opener: HTMLElement) => void
}) {
  const name = item.cardNameFr || 'Nom indisponible'
  return <div className={`collection-content-row${item.owned ? '' : ' is-missing'}`}>
    <CompactVariantSummary variant={item} origin={automatic ? item.origin : undefined} />
    <span className="visually-hidden">{item.owned ? 'Carte possédée' : 'Carte manquante'}</span>
    <div className="collection-content-actions">
      <button type="button" className="collection-copies-trigger" onClick={onCopies}
        aria-label={`${readOnly ? 'Consulter' : 'Gérer'} les exemplaires de ${name}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M3 8h18v13H3z M3 8l3-5h12l3 5 M3 12h18 M10 10h4v5h-4z" />
        </svg>
        <span className="visually-hidden">Exemplaires</span>
      </button>
      {!readOnly && item.origin === 'manual' && onRemove && <CollectionItemMenu name={name} busy={busy} onRemove={onRemove} />}
    </div>
  </div>
}
