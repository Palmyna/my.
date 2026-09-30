import { useState } from 'react'

export function CardImage({ url, name, size = 'compact' }: { url: string | null; name: string; size?: 'compact' | 'detail' }) {
  const [failed, setFailed] = useState(false)
  return <div className={`collection-content-image${size === 'detail' ? ' variant-detail-image' : ''}`}>
    {url && !failed ? <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />
      : <svg viewBox="0 0 48 67" role="img" aria-label="Image indisponible" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="5" width="38" height="57" rx="3" /><path d="m12 43 9-11 6 7 5-5 5 9H12Z" /><circle cx="31" cy="22" r="4" />
      </svg>}
  </div>
}
