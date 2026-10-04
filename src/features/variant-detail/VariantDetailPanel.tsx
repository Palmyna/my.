import { useEffect, useId, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getVariantDetail, VariantDetailError } from '../../services/variant-detail'
import type { VariantDetail } from '../../types/variant-detail'
import { variantIdString, type VariantIdInput } from '../../lib/variant-id'
import { formatFrSource } from '../../lib/format-fr-source'
import { useAuth } from '../auth/auth-context'
import { CardImage } from '../collections/CardImage'
import { PhysicalCopiesContent, type PhysicalCopiesContentHandle } from '../physical-copies/PhysicalCopiesContent'
import { trapDialogFocus } from '../physical-copies/trap-dialog-focus'
import '../collections/collection-content.css'
import './variant-detail.css'

type Props = {
  variantId: VariantIdInput; ownerId: string; readOnly?: boolean; opener: HTMLElement | null; onClose: () => void
}

export function VariantDetailPanel(props: Props) {
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  const variantId = variantIdString(props.variantId)
  return <DetailPanel key={`${user.id}:${props.ownerId}:${variantId}`} {...props} variantId={variantId} viewerId={user.id} />
}

function DetailPanel({ variantId, ownerId, readOnly, opener, onClose, viewerId }: Props & { variantId: string; viewerId: string }) {
  const detail = useQuery({ queryKey: ['variant-detail', viewerId, variantId],
    queryFn: () => getVariantDetail(variantId), retry: false })
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLSpanElement>(null)
  const copies = useRef<PhysicalCopiesContentHandle>(null)
  const id = useId()
  useEffect(() => {
    const node = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    title.current?.focus({ preventScroll: true })
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [opener])

  return <dialog ref={dialog} className="collection-dialog collection-action-dialog variant-detail-panel"
    aria-labelledby={`${id}-title`} onKeyDown={trapDialogFocus}
    onCancel={event => { event.preventDefault(); if (copies.current) copies.current.dismiss(); else onClose() }}>
    <span ref={title} tabIndex={-1} id={`${id}-title`} className="visually-hidden">
      {detail.data?.cardNameFr || 'Informations de la carte'}
    </span>
    <button type="button" className="collection-copies-trigger variant-detail-close" aria-label="Fermer le détail"
      onClick={() => { if (copies.current) copies.current.close(); else onClose() }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
    </button>
    <div className="variant-detail-body">
      {detail.isPending && <p role="status">Chargement de la version…</p>}
      {detail.isError && <div>
        <p role="alert">{detail.error instanceof VariantDetailError && detail.error.code === 'variant_unavailable'
          ? 'Cette version n’est pas disponible.' : 'Impossible de charger les informations de cette version.'}</p>
        <button type="button" className="button" disabled={detail.isFetching} onClick={() => void detail.refetch()}>Réessayer</button>
      </div>}
      {detail.isSuccess && <CatalogDetail detail={detail.data} />}
      {/* Independent reads: a catalogue refresh must never unmount an in-flight copy form. */}
      <PhysicalCopiesContent ref={copies} titleId={`${id}-copies`} ownerId={ownerId} variantId={variantId}
        viewerId={viewerId} readOnly={readOnly} onClose={onClose} showPossession />
    </div>
  </dialog>
}

function releaseDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function CatalogDetail({ detail }: { detail: VariantDetail }) {
  const name = detail.cardNameFr || 'Nom indisponible'
  const extension = formatFrSource(detail.setNameFr, detail.setNameSource)
  const fields = [
    ['Extension', extension], ['Abréviation', formatFrSource(detail.setAbbreviationFr, detail.setAbbreviation)],
    ['Série', detail.seriesNameFr || detail.seriesNameSource], ['Numéro', detail.localId],
    ['Rareté', detail.rarity], ['Catégorie', detail.category], ['Date de sortie', releaseDate(detail.effectiveReleaseDate)],
  ].filter(([, value]) => value?.trim())
  const characteristics = [
    ['Sous-type', detail.variantSubtype],
    ['Finition', detail.variantFoil], ['Stamps', detail.variantStamps.filter(value => value.trim()).join(', ')],
    ['Taille', detail.variantSize === 'standard' ? null : detail.variantSize],
  ].filter(([, value]) => value?.trim())
  return <>
    <div className="variant-detail-intro">
      <CardImage key={detail.imageUrl} url={detail.imageUrl} name={name} size="detail" />
      <div><h3>{name}</h3>{detail.variantLabel && <p className="variant-detail-version">{detail.variantLabel}</p>}
        {(extension || detail.localId) && <p>{[extension, detail.localId].filter(Boolean).join(' · ')}</p>}</div>
    </div>
    {fields.length > 0 && <dl className="variant-detail-metadata">
      {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>}
    {characteristics.length > 0 && <section className="variant-detail-characteristics" aria-label="Caractéristiques">
      <h3>Caractéristiques</h3>
      <dl className="variant-detail-metadata">
        {detail.variantType?.trim() && <div><dt>Type</dt><dd>{detail.variantType}</dd></div>}
        {characteristics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>}
  </>
}
