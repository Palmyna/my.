import { useId, type Ref } from 'react'
import type { CatalogVariantForAdd } from '../../types/catalog-search'
import type { CollectionContentItemV2 } from '../../types/collection-content'
import type { CollectionUpdatePreview as Preview } from '../../types/collection-update'
import { CompactVariantSummary } from './CompactVariantSummary'
import './collection-content.css'
import './collection-update-preview.css'

export type CollectionUpdatePreviewState = { status: 'loading' } | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: Preview; currentItems: readonly CollectionContentItemV2[];
    variants: ReadonlyMap<string,CatalogVariantForAdd> }

// Pure presentation, never a reader/writer. Caller supplies the complete current
// order and catalogue metadata, including additions and removed variants.
export function CollectionUpdatePreview({ state, headingRef, onRetry }: {
  state: CollectionUpdatePreviewState
  headingRef?: Ref<HTMLHeadingElement>
  onRetry?: () => void
}) {
  const heading = useId()
  function content() {
    if (state.status === 'loading') return <p role="status">Chargement de l’aperçu…</p>
    if (state.status === 'unavailable') return <p role="status">Aperçu indisponible pour cette collection.</p>
    if (state.status === 'error') return <><p role="alert">{state.message}</p>
      {onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>Réessayer</button>}</>
    const { preview,currentItems,variants } = state
    const current = new Map(currentItems.map((item,index) => [item.collectionItemId,{ item,position: index+1 }]))
    const currentVariants = new Map(currentItems.map(item => [item.variantId,item]))
    const converted = new Set(preview.converted.map(item => item.collectionItemId))
    function summary(variantId: string) {
      const metadata = variants.get(variantId) ?? currentVariants.get(variantId)
      return metadata ? <><CompactVariantSummary variant={metadata} showVariantFallback />
        <span className="collection-update-extension">{metadata.setNameFr || 'Extension indisponible'}</span></>
        : <span>Informations catalogue indisponibles · Version {variantId}</span>
    }
    return <>
      <p role="status">{preview.updateAvailable ? 'Changements proposés pour votre collection.' : 'Aucun changement structurel utile. Votre collection est à jour.'}</p>
      {preview.targetEmpty && <p className="collection-update-empty">Cette cible ne contient plus de carte automatique.
        {preview.removed.length > 0 && ' Toutes les cartes automatiques ci-dessous seraient retirées.'}
        {preview.finalOrder.length > 0 ? ' Vos cartes personnelles seraient conservées.' : ' Votre collection serait conservée, vide.'}</p>}
      {preview.updateAvailable && <>
        <ul className="collection-update-counts" aria-label="Résumé des changements">
          <li>{preview.added.length} ajout(s)</li><li>{preview.removed.length} retrait(s)</li>
          <li>{preview.converted.length} conversion(s)</li><li>{preview.rankChanges.length} changement(s) de rang</li>
        </ul>
        {([
          ['Cartes ajoutées',preview.added,'Nouvelle carte automatique'],
          ['Cartes retirées',preview.removed,'Carte automatique retirée · Exemplaires et notes conservés'],
          ['Cartes personnelles devenant automatiques',preview.converted,'Carte existante conservée · Visible par défaut'],
        ] as const).map(([title,items,label]) => items.length > 0 && <section key={title}>
          <h3>{title}</h3><ul className="collection-update-list">{items.map(item => <li key={item.variantId}>
            <div className="collection-update-variant">{summary(item.variantId)}</div><p>{label}</p>
          </li>)}</ul>
        </section>)}
        {preview.rankChanges.length > 0 && <section><h3>Rangs dans le catalogue</h3>
          <ul className="collection-update-list">{preview.rankChanges.map(item => <li key={item.variantId}>
            <div className="collection-update-variant">{summary(item.variantId)}</div>
            <p>Place {item.previousRank} → {item.nextRank} dans l’ordre du catalogue · Carte existante conservée</p>
          </li>)}</ul>
        </section>}
        <details className="collection-update-order"><summary>Ordre complet proposé ({preview.finalOrder.length} cartes)</summary>
          <ol className="collection-update-list">{preview.finalOrder.map((item,index) => {
            const previous = item.collectionItemId === null ? undefined : current.get(item.collectionItemId)
            return <li key={item.variantId}><div className="collection-update-variant">{summary(item.variantId)}</div>
              <p>{item.collectionItemId === null ? 'Nouvelle carte automatique' : converted.has(item.collectionItemId)
                ? 'Carte existante devenue automatique' : 'Carte existante conservée'}
                {item.isHidden && ' · Masquée'}{item.origin === 'manual' && ' · Personnelle'}</p>
              {previous && previous.position !== index+1 && <p>Position {previous.position} → {index+1}</p>}
            </li>
          })}</ol>
        </details>
      </>}
    </>
  }
  return <section className="collection-update-preview" aria-labelledby={heading} aria-busy={state.status === 'loading'}>
    <h2 id={heading} ref={headingRef} tabIndex={-1}>Aperçu de l’actualisation</h2>
    {content()}
  </section>
}
