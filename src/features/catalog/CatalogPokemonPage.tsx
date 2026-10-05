import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { resolveCatalogIdentity } from '../../lib/catalog-identity'
import { CatalogError, getCatalogPokemon } from '../../services/catalog'
import type { CatalogPokemon } from '../../types/catalog'
import { POKEMON_TYPE_LABELS } from '../../types/pokemon'
import { useAuth } from '../auth/auth-context'
import { catalogPokemonKey } from './catalog-query'
import { CatalogContent } from './CatalogContent'
import { CatalogCollectionAction } from './CatalogCollectionAction'
import { useCatalogView } from './useCatalogView'
import './catalog.css'

export function CatalogPokemonPage() {
  const { pokemonId = '' } = useParams()
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  return <PokemonPage key={`${user.id}:${pokemonId}`} viewerId={user.id} pokemonId={pokemonId} />
}

function PokemonPage({ viewerId, pokemonId }: { viewerId: string; pokemonId: string }) {
  const pokemon = useQuery({ queryKey: catalogPokemonKey(viewerId, pokemonId),
    queryFn: () => getCatalogPokemon(pokemonId), retry: false })
  const view = useCatalogView(`pokemon:${pokemonId}`)
  useEffect(() => {
    document.title = `${pokemon.data?.nameFr || 'Pokémon'} — MY.`
  }, [pokemon.data?.nameFr])
  return <section className="catalog-page" aria-label="Catalogue Pokémon">
    {pokemon.isPending && <><h1 tabIndex={-1}>Pokémon</h1><p role="status">Chargement du Pokémon…</p></>}
    {pokemon.isError && <><h1 tabIndex={-1}>Pokémon</h1>
      {pokemon.error instanceof CatalogError && pokemon.error.code === 'catalog_unavailable'
        ? <><p role="status">Ce Pokémon n’est pas disponible dans le catalogue.</p><Link to="/dashboard">Revenir aux collections</Link></>
        : <><p role="alert">Impossible de charger ce Pokémon.</p><button type="button" className="button secondary catalog-retry"
          disabled={pokemon.isFetching} onClick={() => void pokemon.refetch()}>Réessayer</button></>}
    </>}
    {pokemon.isSuccess && <PokemonContent pokemon={pokemon.data} viewerId={viewerId} view={view} />}
  </section>
}

function PokemonContent({ pokemon, viewerId, view }: {
  pokemon: CatalogPokemon; viewerId: string; view: ReturnType<typeof useCatalogView>
}) {
  const name = pokemon.nameFr || 'Nom indisponible'
  const identity = resolveCatalogIdentity(pokemon.primaryType, pokemon.secondaryType)
  return <CatalogContent name={name} viewerId={viewerId} identity={identity} variants={pokemon.variants} view={view}>
    <header className="catalog-pokemon-header">
      <div className="catalog-pokemon-identity">
        <p className="catalog-eyebrow">Pokémon <span>#{String(pokemon.dexNumber).padStart(4, '0')}</span></p>
        <h1 tabIndex={-1}>{name}</h1>
        <div className="catalog-types">
          {pokemon.primaryType && <span className="catalog-type-primary">{POKEMON_TYPE_LABELS[pokemon.primaryType]}</span>}
          {pokemon.secondaryType && <span className="catalog-type-secondary">{POKEMON_TYPE_LABELS[pokemon.secondaryType]}</span>}
        </div>
        <p className="catalog-count">{pokemon.variantCount} {pokemon.variantCount === 1 ? 'version' : 'versions'}</p>
      </div>
      <CatalogCollectionAction viewerId={viewerId} targetType="pokemon" targetId={pokemon.pokemonId} targetName={name} />
    </header>
  </CatalogContent>
}
