import { useState } from 'react'
import cardPlaceholder from '../../assets/placeholders/card-placeholder.webp'

export function CardImage({ url, name, size = 'compact' }: { url: string | null; name: string; size?: 'compact' | 'detail' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const placeholder = !url || failedUrl === url
  return <div className={`collection-content-image${size === 'detail' ? ' variant-detail-image' : ''}`}>
    <img src={placeholder ? cardPlaceholder : url} alt={placeholder ? 'Image indisponible' : name}
      loading="lazy" onError={placeholder ? undefined : () => setFailedUrl(url)} />
  </div>
}
