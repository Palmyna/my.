import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CatalogIdentity } from '../../lib/catalog-identity'
import type { CatalogPokemonVariant, CatalogSetSummary, CatalogSetVariant } from '../../types/catalog'
import { VariantDetailPanel } from '../variant-detail/VariantDetailPanel'
import { CatalogToolbar } from './CatalogToolbar'
import { CatalogVariants } from './CatalogVariants'
import { filterCatalogVariants } from './filter-catalog-variants'
import type { useCatalogView } from './useCatalogView'

export function CatalogContent({ name, viewerId, identity, variants: loadedVariants, set, view, children }: {
  name: string; viewerId: string; identity: CatalogIdentity
  variants: (CatalogPokemonVariant | CatalogSetVariant)[]; set?: CatalogSetSummary
  view: ReturnType<typeof useCatalogView>; children: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ variantId: string; opener: HTMLElement } | null>(null)
  const theme = { '--catalog-accent': identity.primaryAccent, '--catalog-secondary': identity.secondaryAccent ?? identity.primaryAccent,
    '--catalog-gradient': identity.gradient, '--focus': identity.primaryAccent } as CSSProperties
  const variants = filterCatalogVariants(loadedVariants, query)
  return <div className="catalog-themed" style={theme}>
    {children}
    <CatalogToolbar name={name} query={query} onSearch={setQuery} view={view.currentView} onView={view.setCurrentView} />
    {variants.length === 0 && <p role="status">Aucune carte ne correspond à cette recherche.</p>}
    <CatalogVariants variants={variants} set={set} view={view.currentView} onDetail={(variantId, opener) => setDetail({ variantId, opener })} />
    {detail && <VariantDetailPanel variantId={detail.variantId} ownerId={viewerId} opener={detail.opener} onClose={() => setDetail(null)} />}
  </div>
}
