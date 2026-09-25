import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, PHYSICAL_COPY_NOTE_MAX_LENGTH, PhysicalCopiesError, updatePhysicalCopy } from '../../services/physical-copies'
import { useAuth } from '../auth/auth-context'
import { invalidateCopyPossession, physicalCopiesKey } from './physical-copies-query'
import './physical-copies.css'
import { variantIdString, type VariantIdInput } from '../../lib/variant-id'

type Props = { ownerId: string; variantId: VariantIdInput; variantName: string; readOnly?: boolean; onClose: () => void }
type Action = { type: 'create' } | { type: 'edit' | 'delete'; copyId: string; label: string }

// Reusable boundary for the future variant entry point; no collection content is invented here.
export function PhysicalCopiesDialog(props: Props) {
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  return <CopiesDialog key={`${user.id}:${props.ownerId}:${props.variantId}`} {...props} variantId={variantIdString(props.variantId)} viewerId={user.id} />
}

function CopiesDialog({ ownerId, variantId, variantName, onClose, viewerId, readOnly: forcedReadOnly }: Props & { viewerId: string; variantId: string }) {
  const client = useQueryClient()
  const queryKey = physicalCopiesKey(viewerId, ownerId, variantId)
  const readOnly = forcedReadOnly || viewerId !== ownerId
  const copies = useQuery({ queryKey, queryFn: () => listPhysicalCopies(ownerId, variantId), retry: false })
  const [action, setAction] = useState<Action | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const errorNode = useRef<HTMLParagraphElement>(null)
  const running = useRef(false)
  const active = useRef(false)
  const returnTarget = useRef<string | null>(null)
  const id = useId()

  const mutation = useMutation({
    mutationFn: async (next: Action) => {
      if (readOnly) throw new PhysicalCopiesError('not_authorized')
      if (next.type === 'create') await createPhysicalCopy(variantId, name, note)
      else if (next.type === 'edit') await updatePhysicalCopy(next.copyId, name, note)
      else await deletePhysicalCopy(next.copyId)
    },
    retry: false,
    onSuccess: async (_data, next) => {
      await Promise.all([
        client.invalidateQueries({ queryKey, exact: true }),
        // Editing metadata cannot change possession; all IDs remain decimal strings.
        next.type !== 'edit' ? invalidateCopyPossession(client, viewerId, variantId) : Promise.resolve(),
      ])
      if (active.current) setAction(null)
    },
    onSettled: () => { running.current = false },
  })

  useEffect(() => {
    active.current = true
    const node = dialog.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    heading.current?.focus()
    return () => {
      active.current = false
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (action?.type === 'delete') cancel.current?.focus()
    else if (action) input.current?.focus()
    else {
      const target = returnTarget.current ? document.getElementById(returnTarget.current) : null
      if (target) target.focus()
      else heading.current?.focus()
    }
  }, [action])

  useEffect(() => {
    if (mutation.isPending) heading.current?.focus()
    else if (mutation.isError && action) errorNode.current?.focus()
  }, [mutation.isPending, mutation.isError, action])

  function dismiss() {
    if (running.current) return
    if (action) {
      if (mutation.isError) void client.invalidateQueries({ queryKey, exact: true })
      mutation.reset()
      setAction(null)
    }
    else onClose()
  }

  function start(next: Action, value: string, target: string, noteValue = '') {
    returnTarget.current = target
    mutation.reset()
    setName(value)
    setNote(noteValue)
    setAction(next)
  }

  const title = !action ? 'Exemplaires physiques' : action.type === 'create' ? 'Ajouter un exemplaire'
    : action.type === 'edit' ? 'Éditer l’exemplaire' : 'Supprimer l’exemplaire'
  const errorMessage = mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'not_authorized'
    ? 'Votre session ou vos droits ne permettent pas cette action. Reconnectez-vous pour réessayer.'
    : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'copy_unavailable'
      ? 'Cet exemplaire n’existe plus ou vous n’y avez plus accès. Revenez à la liste pour la rafraîchir.'
      : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'variant_unavailable'
        ? 'Cette variante n’est plus disponible.'
        : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'note_too_long'
          ? 'L’état / note ne peut pas dépasser 750 caractères.'
          : 'L’opération n’a pas pu être confirmée. Revenez à la liste pour vérifier les exemplaires avant de réessayer.'

  return <dialog ref={dialog} className="collection-dialog collection-action-dialog physical-copies-dialog"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-variant`}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'))
      const first = controls[0], last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return }
      const onControl = controls.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!onControl || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }}>
    <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{title}</h2>
    <p id={`${id}-variant`}>{variantName}</p>
    {!action ? <>
      {readOnly && <p>Lecture seule</p>}
      {copies.isPending && <p role="status">Chargement des exemplaires…</p>}
      {copies.isError && <div>
        <p role="alert">Impossible de charger les exemplaires. Vérifiez votre accès puis réessayez.</p>
        <button className="button" disabled={copies.isFetching} onClick={() => void copies.refetch()}>Réessayer</button>
      </div>}
      {copies.isSuccess && (copies.data.length === 0 ? <p>Aucun exemplaire.</p> : <ul className="physical-copies-list">
        {copies.data.map((copy, index) => {
          const label = copy.name?.trim() || `Exemplaire ${index + 1}`
          return <li key={copy.id}><div className="physical-copy-row"><span>{label}</span>
            {copy.note?.trim() && <CopyNote note={copy.note} label={label} />}
            {!readOnly && <CopyActions label={label} buttonId={`${id}-${copy.id}`}
              edit={() => start({ type: 'edit', copyId: copy.id, label }, copy.name ?? '', `${id}-${copy.id}`, copy.note ?? '')}
              remove={() => start({ type: 'delete', copyId: copy.id, label }, '', `${id}-${copy.id}`)} />}</div></li>
        })}
      </ul>)}
      <div className="collection-dialog-actions">
        <button className="button collection-cancel" onClick={dismiss}>Fermer</button>
        {!readOnly && <button id={`${id}-add`} className="button" disabled={!copies.isSuccess}
          onClick={() => start({ type: 'create' }, '', `${id}-add`)}>Ajouter un exemplaire</button>}
      </div>
    </> : <form onSubmit={event => {
      event.preventDefault()
      if (running.current || readOnly) return
      running.current = true
      mutation.mutate(action)
    }}>
      {action.type === 'delete' ? <p>Supprimer « {action.label} » ? Cette suppression est définitive. Les variantes de vos collections seront conservées.</p> : <>
        <label className="field" htmlFor={`${id}-name`}>Nom personnalisé (facultatif)</label>
        <input id={`${id}-name`} ref={input} value={name} autoComplete="off" disabled={mutation.isPending}
          aria-describedby={`${id}-hint`} onChange={event => setName(event.target.value)} />
        <p className="hint" id={`${id}-hint`}>Sans nom, l’exemplaire reçoit un numéro d’affichage recalculé automatiquement.</p>
        <label className="field" htmlFor={`${id}-note`}>État / note (facultatif)</label>
        <textarea id={`${id}-note`} value={note} rows={4} disabled={mutation.isPending}
          aria-describedby={`${id}-note-count`} onChange={event => {
            if (Array.from(event.target.value).length <= PHYSICAL_COPY_NOTE_MAX_LENGTH) setNote(event.target.value)
          }} />
        <p className="hint physical-copy-note-count" id={`${id}-note-count`}>
          {Array.from(note).length} / {PHYSICAL_COPY_NOTE_MAX_LENGTH}
        </p>
      </>}
      {mutation.isError && <p ref={errorNode} className="feedback error" role="alert" tabIndex={-1}>{errorMessage}</p>}
      {mutation.isPending && <p role="status">{action.type === 'delete' ? 'Suppression…' : 'Enregistrement…'}</p>}
      <div className="collection-dialog-actions">
        <button ref={cancel} className="button collection-cancel" type="button" disabled={mutation.isPending} onClick={dismiss}>Annuler</button>
        <button className={`button ${action.type === 'delete' ? 'collection-danger-action' : ''}`} type="submit" disabled={mutation.isPending}>
          {action.type === 'delete' ? 'Supprimer' : action.type === 'create' ? 'Créer l’exemplaire' : 'Enregistrer'}
        </button>
      </div>
    </form>}
  </dialog>
}

function CopyNote({ note, label }: { note: string; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <>
    <button type="button" className="collection-actions-trigger physical-copy-note-trigger"
      aria-label={`${open ? 'Masquer' : 'Afficher'} l’état / note de ${label}`}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7" />
      </svg>
    </button>
    {open && <p id={id} className="physical-copy-note">{note}</p>}
  </>
}

function CopyActions({ label, buttonId, edit, remove }: { label: string; buttonId: string; edit: () => void; remove: () => void }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) { setOpen(false); trigger.current?.focus() }
    }
    const leave = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', leave)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', leave) }
  }, [open])
  return <div ref={container} className="collection-actions" onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <button id={buttonId} ref={trigger} className="collection-actions-trigger" type="button" aria-label={`Actions de ${label}`}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <span className="collection-actions-icon" aria-hidden="true"><span /><span /><span /></span>
    </button>
    {open && <div className="collection-actions-panel" id={id} role="group" aria-label={`Actions de ${label}`}>
      <button ref={first} type="button" onClick={edit}>Éditer</button><hr />
      <button className="collection-delete-option" type="button" onClick={remove}>Supprimer</button>
    </div>}
  </div>
}
