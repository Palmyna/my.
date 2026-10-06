import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import type { CatalogPokemonSummary, CatalogSeries, CatalogSetSummary } from '../../types/catalog'
import { formatCatalogDate } from './format-catalog-date'
import './catalog-card-metadata.css'

/** Shared reference fields, order and labels for the Card page and Variant panel. */
export function CatalogCardMetadata({ set, rarity, category, series, effectiveReleaseDate, pokemon, onNavigate }: {
  set: Pick<CatalogSetSummary, 'setId' | 'nameFr' | 'nameSource'>
  rarity: string | null; category: string | null
  series: Pick<CatalogSeries, 'nameFr' | 'nameSource'>
  effectiveReleaseDate: string | null; pokemon: readonly CatalogPokemonSummary[]
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const setName = set.nameFr?.trim() || set.nameSource?.trim()
  const seriesName = series.nameFr?.trim() || series.nameSource?.trim()
  const releaseDate = formatCatalogDate(effectiveReleaseDate)
  const namedPokemon = pokemon.filter(entry => entry.nameFr?.trim())
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    // Let Link own routing, including keyboard activation and modified clicks.
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) onNavigate?.(event)
  }
  return <>
    {(setName || rarity?.trim() || category?.trim() || seriesName || releaseDate) && <dl className="catalog-card-metadata">
      {setName && <div><dt>Extension</dt><dd><Link to={`/catalog/extensions/${set.setId}`} onClick={navigate}>{setName}</Link></dd></div>}
      {rarity?.trim() && <div><dt>Rareté</dt><dd>{rarity}</dd></div>}
      {category?.trim() && <div><dt>Catégorie</dt><dd>{category}</dd></div>}
      {seriesName && <div><dt>Série</dt><dd>{seriesName}</dd></div>}
      {releaseDate && <div><dt>Date de sortie</dt><dd><time dateTime={effectiveReleaseDate!}>{releaseDate}</time></dd></div>}
    </dl>}
    {namedPokemon.length > 0 && <div className="catalog-card-pokemon">
      <p>Pokémon</p>
      <div className="catalog-pokemon-links" role="group" aria-label="Pokémon">
        {namedPokemon.map((entry, index) => <span key={entry.pokemonId}>
          {index > 0 && <span className="catalog-link-separator" aria-hidden="true"> · </span>}
          <Link to={`/catalog/pokemon/${entry.pokemonId}`} onClick={navigate}>{entry.nameFr}</Link>
        </span>)}
      </div>
    </div>}
  </>
}
