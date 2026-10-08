import type { CatalogPokemonMetadata, CatalogSetSummary } from './catalog'
import type { DashboardCollection } from './collections'

export type GlobalNavigationSuggestion =
  | ({ kind: 'pokemon' } & CatalogPokemonMetadata)
  | ({ kind: 'set'; logoUrl: string | null } & CatalogSetSummary)
  | ({ kind: 'collection' } & Pick<DashboardCollection, 'collectionId' | 'name' | 'access' | 'collectionType'
    | 'targetType' | 'targetName' | 'targetPrimaryType' | 'targetSecondaryType'>)
  | { kind: 'card'; sourceCardId: string; nameFr: string | null; localId: string | null
    setNameFr: string | null; setAbbreviationFr: string | null; setAbbreviation: string | null
    imageUrl: string | null; pokemon: CatalogPokemonMetadata[] }
