import { CardImage } from './CardImage'
import { CollectionItemMenu } from './CollectionItemMenu'
import type { CollectionContentItem } from '../../types/collection-content'

export function CollectionContentRow({ item, readOnly, onCopies, automatic = false, busy = false, onRemove }: {
  item: CollectionContentItem; readOnly: boolean; onCopies: () => void; automatic?: boolean; busy?: boolean
  onRemove?: (opener: HTMLElement) => void
}) {
  const name = item.cardNameFr || 'Nom indisponible'
  const metadata = [item.setNameFr, item.localId].filter(Boolean).join(' · ')
  return <div className={`collection-content-row${item.owned ? '' : ' is-missing'}`}>
    <CardImage key={item.imageUrl} url={item.imageUrl} name={name} />
    <div className="collection-content-info">
      <p className="collection-content-name">{name}</p>
      {metadata && <p className="collection-content-meta">{metadata}</p>}
      {item.variantLabel && <p className="collection-content-variant">{item.variantLabel}</p>}
      {automatic && <p className="collection-content-origin"><span className="visually-hidden">Origine : </span>{item.origin === 'automatic' ? 'Auto' : 'Perso'}</p>}
      <span className="visually-hidden">{item.owned ? 'Carte possédée' : 'Carte manquante'}</span>
    </div>
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
