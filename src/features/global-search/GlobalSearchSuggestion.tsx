import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { resolveCardIdentity, resolveFunctionalIdentity, resolvePokemonIdentity } from '../../lib/catalog-identity'
import { formatFrSource } from '../../lib/format-fr-source'
import type { GlobalNavigationSuggestion } from '../../types/global-search'
import { resolveCollectionIdentity } from '../dashboard/collection-color'
import { CardImage } from '../collections/CardImage'

function presentation(suggestion: GlobalNavigationSuggestion) {
  switch (suggestion.kind) {
    case 'pokemon': return {
      to: `/catalog/pokemon/${suggestion.pokemonId}`, name: suggestion.nameFr || 'Nom indisponible',
      secondary: `#${String(suggestion.dexNumber).padStart(4, '0')}`, category: 'Pokémon',
      identity: resolvePokemonIdentity(suggestion.primaryType, suggestion.secondaryType),
    }
    case 'set': return {
      to: `/catalog/extensions/${suggestion.setId}`, name: suggestion.nameFr || suggestion.nameSource || 'Nom indisponible',
      secondary: formatFrSource(suggestion.abbreviationFr, suggestion.abbreviation), category: 'Extension',
      identity: resolveFunctionalIdentity('set'),
    }
    case 'collection': return {
      to: `/collections/${suggestion.collectionId}`, name: suggestion.name,
      secondary: suggestion.access === 'shared' ? 'Partagée · Lecture seule'
        : suggestion.collectionType === 'free' ? 'Personnalisée'
          : [suggestion.targetType === 'pokemon' ? 'Pokémon' : 'Extension', suggestion.targetName].filter(Boolean).join(' · '),
      category: 'Collection', identity: resolveCollectionIdentity(suggestion),
    }
    case 'card': return {
      to: `/catalog/cards/${suggestion.sourceCardId}`, name: suggestion.nameFr || 'Nom indisponible',
      secondary: [suggestion.localId, suggestion.setNameFr,
        formatFrSource(suggestion.setAbbreviationFr, suggestion.setAbbreviation)].filter(Boolean).join(' · '),
      category: 'Carte', identity: resolveCardIdentity(suggestion.pokemon),
    }
  }
}

export function GlobalSearchSuggestion({ suggestion, onNavigate }: {
  suggestion: GlobalNavigationSuggestion; onNavigate: () => void
}) {
  const { to, name, secondary, category, identity } = presentation(suggestion)
  return <Link to={to} className="global-search-suggestion" onClick={onNavigate} style={{
    '--search-accent': identity.primaryAccent, '--search-border': identity.border,
    '--search-text': identity.textAccent,
  } as CSSProperties}>
    {suggestion.kind === 'card' && <CardImage url={suggestion.imageUrl} name="" placeholderAlt="" />}
    {suggestion.kind === 'set' && <SetLogo url={suggestion.logoUrl} />}
    <span className="global-search-info"><span className="global-search-name">{name}</span>
      {secondary && <span className="global-search-secondary">{secondary}</span>}
    </span>
    <span className="global-search-category">{category}</span>
  </Link>
}

function SetLogo({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) return null
  return <img className="global-search-logo" src={url} alt="" onError={() => setFailedUrl(url)} />
}
