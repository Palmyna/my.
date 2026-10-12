import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CollectionContentError, getCollectionContentV2 } from '../../services/collection-content'
import { CollectionUpdateError } from '../../services/collection-update'
import { CollectionItemsError } from '../../services/collection-items'
import { getVariantDetail } from '../../services/variant-detail'
import type { CatalogVariantForAdd } from '../../types/catalog-search'
import type { CollectionContentItemV2 } from '../../types/collection-content'
import type { CollectionUpdatePreview as Preview } from '../../types/collection-update'
import { CollectionItemDialog } from './CollectionItemDialog'
import { CollectionUpdatePreview, UPDATE_PREVIEW_PAGE_SIZE } from './CollectionUpdatePreview'
import { collectionContentKey, collectionStructureMutationKey, collectionUpdatePreviewKey } from './collection-query'
import { collectionUpdatePreviewOptions, collectionUpdateStatusOptions } from './collection-update-query'
import { useCollectionUpdateMutation } from './useCollectionUpdateMutation'
import { manualItemErrorMessage } from './useManualCollectionItems'
import { usePresentedCollectionNotification } from '../notifications/usePresentedCollectionNotification'

type Plan = { preview: Preview; currentItems: CollectionContentItemV2[]; variants: Map<string, CatalogVariantForAdd> }
type Phase = 'status' | 'current' | 'legacy' | 'preview' | 'ready' | 'error' | 'recovery' | 'success'

function inaccessible(error: unknown) {
  return error instanceof CollectionUpdateError && error.code === 'not_authorized'
    || error instanceof CollectionContentError && ['not_authorized', 'collection_unavailable'].includes(error.code)
}

export function CollectionUpdateDialog({ viewerId, collectionId, opener, onClose, unavailable }: {
  viewerId: string; collectionId: string; opener: HTMLElement | null; onClose: () => void; unavailable: () => void
}) {
  const client = useQueryClient()
  const mutation = useCollectionUpdateMutation(viewerId, collectionId)
  const status = useQuery(collectionUpdateStatusOptions(viewerId, collectionId))
  const preview = useQuery({ ...collectionUpdatePreviewOptions(viewerId, collectionId), notifyOnChangeProps: 'all' })
  const content = useQuery({ queryKey: collectionContentKey(viewerId, collectionId),
    queryFn: () => getCollectionContentV2(collectionId), retry: false })
  const [phase, setPhase] = useState<Phase>(mutation.recovery ? 'recovery' : 'status')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const running = useRef(false), active = useRef(false), started = useRef(false)
  const paging = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const confirmation = useRef<HTMLParagraphElement>(null)
  const { refetch: readStatus } = status, { refetch: readPreview } = preview, { refetch: readContent } = content
  const resetMutation = mutation.reset
  // Disabled observers intentionally do not refetch. Invalidation can leave
  // their public result unchanged, so observe this consent boundary directly.
  const subscribePreview = useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client])
  const isPreviewInvalidated = useCallback(() => client.getQueryState(collectionUpdatePreviewKey(viewerId, collectionId))?.isInvalidated ?? true,
    [client, viewerId, collectionId])
  const previewInvalidated = useSyncExternalStore(subscribePreview, isPreviewInvalidated)

  const metadata = useCallback(async (ids: string[], existing: ReadonlyMap<string, CatalogVariantForAdd>) => {
    const result = new Map(existing)
    const missing = [...new Set(ids)].filter(id => !result.has(id))
    // Only displayed pages, never the entire target. Reuse the detail cache and
    // reader; a fixed pool bounds requests even when a page contains many adds.
    let next = 0
    const results = await Promise.allSettled(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (next < missing.length && active.current) {
        const id = missing[next++]!
        const detail = await client.fetchQuery({ queryKey: ['variant-detail', viewerId, id],
          queryFn: () => getVariantDetail(id), retry: false, staleTime: 0 })
        result.set(id, detail)
      }
    }))
    for (const result of results) if (result.status === 'rejected') throw result.reason
    return result
  }, [client, viewerId])

  const consult = useCallback(async () => {
    if (running.current || client.isMutating({ mutationKey: collectionStructureMutationKey(viewerId, collectionId), exact: true })) return
    running.current = true
    setWorking(true); setMessage(null); setPhase('status'); resetMutation()
    try {
      const checked = (await readStatus({ throwOnError: true })).data!
      if (!active.current) return
      if (checked.orderContractVersion === 1) { setPhase('legacy'); return }
      if (!checked.updateAvailable) { setPhase('current'); return }
      setPhase('preview')
      const current = (await readContent({ throwOnError: true })).data!
      const proposed = (await readPreview({ throwOnError: true })).data!
      if (!active.current) return
      const variants = await metadata([
        ...proposed.added.slice(0, UPDATE_PREVIEW_PAGE_SIZE),
        ...proposed.finalOrder.slice(0, UPDATE_PREVIEW_PAGE_SIZE),
      ].map(item => item.variantId), new Map(current.items.map(item => [item.variantId, item])))
      if (!active.current) return
      // Keep the old plan until ALL reads for its replacement have succeeded.
      setPlan({ preview: proposed, currentItems: current.items, variants }); setPhase('ready')
    } catch (error) {
      if (!active.current) return
      if (inaccessible(error)) { unavailable(); return }
      setMessage('Impossible de consulter les mises à jour. Réessayez la consultation.'); setPhase('error')
    } finally {
      running.current = false
      if (active.current) setWorking(false)
    }
  }, [client, collectionId, viewerId, readStatus, readContent, readPreview, metadata, resetMutation, unavailable])

  useEffect(() => {
    active.current = true
    if (!started.current) {
      started.current = true
      if (!mutation.recovery) queueMicrotask(() => { if (active.current) void consult() })
    }
    return () => { active.current = false }
  }, [consult, mutation.recovery])

  const queryState = client.getQueryState<Preview>(collectionUpdatePreviewKey(viewerId, collectionId))
  const fresh = !!plan && queryState?.status === 'success' && queryState.fetchStatus === 'idle'
    && !previewInvalidated && queryState.data === plan.preview && content.isSuccess && !content.isFetching
    && content.data.orderContractVersion === 2 && content.data.personalRevision === plan.preview.token.personalRevision
  const stale = phase === 'ready' && (!fresh || mutation.previewStale)
  const notificationRead = usePresentedCollectionNotification(viewerId, collectionId,
    phase === 'ready' && fresh && plan ? plan.preview.token.targetVersion : null)
  const presentPreview = mutation.presentPreview
  useEffect(() => {
    if (phase === 'ready' && fresh && plan) presentPreview(plan.preview)
  }, [phase, fresh, plan, presentPreview])
  useEffect(() => {
    if (phase === 'success') confirmation.current?.focus({ preventScroll: true })
  }, [phase])

  const recovery = mutation.recovery
  const recovering = phase === 'recovery' || !!recovery
  useEffect(() => {
    if (inaccessible(mutation.error) || mutation.error instanceof CollectionItemsError
      && ['not_authorized', 'collection_action_unavailable'].includes(mutation.error.code)) unavailable()
  }, [mutation.error, unavailable])
  const busy = working || mutation.busy || mutation.pending
  const error = busy ? null : message ?? (recovering ? recovery?.type === 'unknown'
    ? 'La requête enregistrée ne peut pas être lue. Aucun nouveau geste ne peut être envoyé.'
    : recovery?.confirmed
    ? 'L’écriture est confirmée. La relecture de la collection reste à terminer.'
    : 'Résultat incertain. Vérifiez le reçu de l’opération enregistrée ; sa requête exacte est conservée dans cet onglet.'
    : stale ? 'La collection ou le catalogue a changé depuis l’aperçu. Consultez un nouvel aperçu avant de confirmer.'
      : mutation.error ? manualItemErrorMessage(mutation.error) : null)

  async function apply(retry = false) {
    if (running.current || busy || (!retry && (!fresh || stale || phase !== 'ready'))) return
    running.current = true; setWorking(true); setMessage(null)
    try {
      const confirmed = await (retry ? mutation.retry() : mutation.apply())
      if (!active.current) return
      if (confirmed) { setPhase('success'); setPlan(null) }
    } finally { running.current = false; if (active.current) setWorking(false) }
  }
  async function refresh() {
    if (running.current || busy) return
    running.current = true; setWorking(true); setMessage(null)
    try {
      if (await mutation.refresh() && active.current) { setPhase('success'); setPlan(null) }
    } finally { running.current = false; if (active.current) setWorking(false) }
  }
  async function more(ids: string[]) {
    if (!plan || running.current || paging.current || busy || stale) return false
    paging.current = true
    try {
      const variants = await metadata(ids, plan.variants)
      if (!active.current) return false
      setPlan(current => current ? { ...current, variants } : null)
      return true
    } catch (error) {
      if (active.current) {
        if (inaccessible(error)) unavailable()
        else { setMessage('Impossible de charger les variantes. Réessayez la consultation.'); setPhase('error') }
      }
      return false
    } finally { paging.current = false }
  }

  return <CollectionItemDialog title="Vérifier les mises à jour" description="Consultez les changements proposés avant de mettre à jour votre collection."
    opener={opener} onClose={() => { if ((!running.current || phase === 'status' || phase === 'preview') && !mutation.busy) onClose() }}
    busy={mutation.pending || working && (phase === 'ready' || recovering)} error={error}
    pendingMessage="Vérification de l’opération et relecture de la collection…">
    {phase === 'status' && <p role="status">Vérification des mises à jour…</p>}
    {phase === 'current' && <p role="status">Votre collection est à jour. Aucun changement utile.</p>}
    {phase === 'legacy' && <p role="status">Cette collection utilise encore l’ancien contrat. L’actualisation n’est pas disponible pour cette collection.</p>}
    {phase === 'preview' && <CollectionUpdatePreview state={{ status: 'loading' }} />}
    {plan && phase !== 'success' && <CollectionUpdatePreview key={plan.preview.token.planHash + plan.preview.token.personalRevision}
      state={{ status: 'ready', ...plan }} headingRef={heading} onVariantsNeeded={more} />}
    {phase === 'success' && <p ref={confirmation} tabIndex={-1} role="status">Opération confirmée. Votre collection a été mise à jour et son contenu relu.</p>}
    {notificationRead.error && <div className="notification-state">
      <p role="alert">L’aperçu reste consultable. Sa lecture n’a pas pu être confirmée dans les notifications.</p>
      <button type="button" className="button button-secondary" disabled={notificationRead.pending}
        onClick={() => void notificationRead.retry()}>Réessayer le suivi</button>
    </div>}
    <div className="collection-dialog-actions">
      <button type="button" className="button collection-cancel" disabled={mutation.pending || working && (phase === 'ready' || recovering)}
        onClick={() => { if (!running.current || phase === 'status' || phase === 'preview') onClose() }}>{phase === 'success' ? 'Fermer' : 'Annuler'}</button>
      {recovering ? <>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void refresh()}>Vérifier le résultat</button>
        {recovery?.type !== 'unknown' && !recovery?.confirmed && <button type="button" className="button collection-accent-action" disabled={busy}
          onClick={() => void apply(true)}>Reprendre l’opération enregistrée</button>}
      </> : phase === 'error' || stale ? <button type="button" className="button button-secondary" disabled={busy}
        onClick={() => void consult()}>{stale ? 'Consulter un nouvel aperçu' : 'Réessayer la consultation'}</button>
        : phase === 'ready' && plan?.preview.updateAvailable && <button type="button" className="button collection-accent-action"
          disabled={busy || !fresh || !!message} onClick={() => void apply()}>Mettre à jour la collection</button>}
    </div>
  </CollectionItemDialog>
}
