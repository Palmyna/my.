import { useState, type CSSProperties, type ReactNode } from 'react'
import type { CatalogIdentity } from '../../lib/catalog-identity'
import type { CatalogCard, CatalogPokemonVariant, CatalogSetSummary, CatalogSetVariant } from '../../types/catalog'
import { VariantDetailPanel } from '../variant-detail/VariantDetailPanel'
import { CatalogToolbar } from './CatalogToolbar'
import { CatalogVariants } from './CatalogVariants'
import { filterCatalogVariants } from './filter-catalog-variants'
import type { useCatalogView } from './useCatalogView'

type Props = {
  name: string; viewerId: string; identity: CatalogIdentity
  view: ReturnType<typeof useCatalogView>; children: ReactNode
} & ({ card: CatalogCard; variants?: never; set?: never } | {
  card?: never; variants: (CatalogPokemonVariant | CatalogSetVariant)[]; set?: CatalogSetSummary
})

export function CatalogContent({ name, viewerId, identity, variants: loadedVariants, set, card, view, children }: Props) {
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ variantId: string; opener: HTMLElement } | null>(null)
  const theme = { '--catalog-accent': identity.primaryAccent, '--catalog-secondary': identity.secondaryAccent ?? identity.primaryAccent,
    '--catalog-gradient': identity.gradient, '--focus': identity.primaryAccent } as CSSProperties
  const variants = card ? card.variants : filterCatalogVariants(loadedVariants, query)
  return <div className="catalog-themed" style={theme}>
    {children}
    <section aria-label={card ? 'Versions' : 'Résultats du catalogue'}>
      <CatalogToolbar {...(card ? { heading: 'Versions' } : { search: { name, query, onSearch: setQuery } })}
        view={view.currentView} onView={view.setCurrentView} />
      {!card && variants.length === 0 && <p role="status">Aucune carte ne correspond à cette recherche.</p>}
      <CatalogVariants variants={variants} set={set} card={card} view={view.currentView}
        onDetail={(variantId, opener) => setDetail({ variantId, opener })} />
    </section>
    {detail && <VariantDetailPanel variantId={detail.variantId} ownerId={viewerId} opener={detail.opener} onClose={() => setDetail(null)} />}
  </div>
}
