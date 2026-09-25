import { useState } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'

export function CollectionContentRow({ item, readOnly, onCopies }: {
  item: CollectionContentItem; readOnly: boolean; onCopies: () => void
}) {
  const name = item.cardNameFr || 'Nom indisponible'
  const metadata = [item.setNameFr, item.localId].filter(Boolean).join(' · ')
  return <div className={`collection-content-row${item.owned ? '' : ' is-missing'}`}>
    <CardImage key={item.imageUrl} url={item.imageUrl} name={name} />
    <div className="collection-content-info">
      <p className="collection-content-name">{name}</p>
      {metadata && <p className="collection-content-meta">{metadata}</p>}
      {item.variantLabel && <p className="collection-content-variant">{item.variantLabel}</p>}
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
    </div>
  </div>
}

function CardImage({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return <div className="collection-content-image">
    {url && !failed ? <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />
      : <svg viewBox="0 0 48 67" role="img" aria-label="Image indisponible" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="5" width="38" height="57" rx="3" /><path d="m12 43 9-11 6 7 5-5 5 9H12Z" /><circle cx="31" cy="22" r="4" />
      </svg>}
  </div>
}
