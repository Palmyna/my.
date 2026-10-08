import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPhysicalCopy, deletePhysicalCopy, listPhysicalCopies, PHYSICAL_COPY_NOTE_MAX_LENGTH, PhysicalCopiesError, updatePhysicalCopy } from '../../services/physical-copies'
import { invalidateCopyPossession, physicalCopiesKey } from './physical-copies-query'
import './physical-copies.css'

type Action = { type: 'create' } | { type: 'edit' | 'delete'; copyId: string; label: string }

export type PhysicalCopiesContentHandle = { dismiss: () => void; close: () => boolean }

export function PhysicalCopiesContent({ ownerId, variantId, onClose, viewerId, readOnly: forcedReadOnly, titleId, ref, showPossession = false }: {
  ownerId: string; variantId: string; viewerId: string; readOnly?: boolean | undefined; onClose: () => void
  titleId: string; ref?: Ref<PhysicalCopiesContentHandle>; showPossession?: boolean
}) {
  const client = useQueryClient()
  const queryKey = physicalCopiesKey(viewerId, ownerId, variantId)
  const readOnly = forcedReadOnly || viewerId !== ownerId
  const copies = useQuery({ queryKey, queryFn: () => listPhysicalCopies(ownerId, variantId), retry: false })
  const [action, setAction] = useState<Action | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
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
    onSettled: async (_data, error, next) => {
      // A lost response may follow a committed write. Reread on both outcomes,
      // keeping dismissal/double submission blocked until these reads settle.
      try {
        await Promise.all([
          client.invalidateQueries({ queryKey, exact: true }),
          // Editing metadata cannot change possession; all IDs remain decimal strings.
          next.type !== 'edit' ? invalidateCopyPossession(client, viewerId, variantId) : Promise.resolve(),
        ])
        if (!error && active.current) setAction(null)
      } finally { running.current = false }
    },
  })

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (action?.type === 'delete') cancel.current?.focus()
    else if (action) input.current?.focus()
    else if (returnTarget.current) {
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

  const title = !action ? (readOnly ? 'Exemplaires' : 'Mes exemplaires') : action.type === 'create' ? 'Ajouter un exemplaire'
    : action.type === 'edit' ? 'Modifier l’exemplaire' : 'Supprimer l’exemplaire'
  const errorMessage = mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'not_authorized'
    ? 'Impossible d’effectuer cette action. Reconnectez-vous puis réessayez.'
    : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'copy_unavailable'
      ? 'Cet exemplaire n’est plus disponible. Actualisez la liste puis réessayez.'
      : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'variant_unavailable'
        ? 'Cette version n’est plus disponible.'
        : mutation.error instanceof PhysicalCopiesError && mutation.error.code === 'note_too_long'
          ? 'L’état / note ne peut pas dépasser 750 caractères.'
          : 'L’opération n’a pas pu être confirmée. Vérifiez vos exemplaires puis réessayez.'

  useImperativeHandle(ref, () => ({ dismiss, close: () => {
    if (running.current) return false
    onClose()
    return true
  } }))

  return <section className="physical-copies-content" aria-labelledby={titleId}>
    {showPossession && copies.isSuccess && <p className="variant-detail-possession" role="status">{copies.data.length ? 'Possédée' : 'Manquante'}</p>}
    <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
    {!action ? <>
      {readOnly && <p>Lecture seule</p>}
      {copies.isPending && <p role="status">Chargement des exemplaires…</p>}
      {copies.isError && <div>
        <p role="alert">Impossible de charger les exemplaires. Réessayez.</p>
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
        {!showPossession && <button className="button collection-cancel" onClick={dismiss}>Fermer</button>}
        {!readOnly && <button id={`${id}-add`} className="button" disabled={!copies.isSuccess}
          onClick={() => start({ type: 'create' }, '', `${id}-add`)}>Ajouter un exemplaire</button>}
      </div>
    </> : <form onSubmit={event => {
      event.preventDefault()
      if (running.current || readOnly) return
      running.current = true
      mutation.mutate(action)
    }}>
      {action.type === 'delete' ? <p>Supprimer « {action.label} » ? Cet exemplaire sera supprimé. La carte restera dans vos collections.</p> : <>
        <label className="field" htmlFor={`${id}-name`}>Nom (facultatif)</label>
        <input id={`${id}-name`} ref={input} value={name} autoComplete="off" disabled={mutation.isPending}
          aria-describedby={`${id}-hint`} onChange={event => setName(event.target.value)} />
        <p className="hint" id={`${id}-hint`}>Laissez vide pour utiliser « Exemplaire 1 », « Exemplaire 2 »…</p>
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
          {action.type === 'delete' ? 'Supprimer' : action.type === 'create' ? 'Ajouter' : 'Enregistrer'}
        </button>
      </div>
    </form>}
  </section>
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
      <button ref={first} type="button" onClick={edit}>Modifier</button><hr />
      <button className="collection-delete-option" type="button" onClick={remove}>Supprimer</button>
    </div>}
  </div>
}
