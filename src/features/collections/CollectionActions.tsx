import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { isValidCollectionName } from '../../lib/collection-name'
import { CollectionsError, deleteCollection, renameCollection } from '../../services/collections'
import type { DashboardCollection } from '../../types/collections'
import { dashboardCollectionsKey } from '../dashboard/dashboard-query'
import { collectionOverviewKey } from './collection-query'

type Action = 'rename' | 'delete'
type Props = { collection: DashboardCollection; userId: string; unavailable: () => void }

function CollectionActionDialog({ collection, userId, unavailable, action, trigger, close }: Props & {
  action: Action; trigger: RefObject<HTMLButtonElement | null>; close: () => void
}) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const errorNode = useRef<HTMLParagraphElement>(null)
  const running = useRef(false)
  const active = useRef(true)
  const [name, setName] = useState(collection.name)
  const [invalidName, setInvalidName] = useState(false)
  const rename = action === 'rename'
  const detail = { queryKey: collectionOverviewKey(userId, collection.collectionId), exact: true }
  const dashboard = { queryKey: dashboardCollectionsKey(userId), exact: true }
  const mutation = useMutation({
    mutationFn: () => rename ? renameCollection(collection.collectionId, name) : deleteCollection(collection.collectionId),
    retry: false,
    onSuccess: async () => {
      if (!active.current) return
      // Prevent an older read from restoring the previous name or deleted overview.
      await Promise.all([client.cancelQueries(detail), client.cancelQueries(dashboard)])
      if (!active.current) return
      if (rename) {
        client.setQueryData<DashboardCollection>(detail.queryKey, current => current ? { ...current, name } : undefined)
        client.setQueryData<DashboardCollection[]>(dashboard.queryKey, current => current?.map(row =>
          row.collectionId === collection.collectionId ? { ...row, name } : row))
        close()
        // The confirmed write is shown immediately; subsequent reads remain authoritative.
        void client.invalidateQueries(detail)
      } else {
        client.removeQueries(detail)
        client.setQueryData<DashboardCollection[]>(dashboard.queryKey, current => current?.filter(row => row.collectionId !== collection.collectionId))
        void navigate('/dashboard', { replace: true })
      }
      void client.invalidateQueries(dashboard)
    },
    onError: error => {
      if (active.current && error instanceof CollectionsError && error.code === 'collection_unavailable') unavailable()
    },
    onSettled: () => { running.current = false },
  })
  const nameError = rename && (invalidName || (mutation.error instanceof CollectionsError && mutation.error.code === 'invalid_name'))
  const generalError = mutation.isError && !nameError
    ? mutation.error instanceof CollectionsError && mutation.error.code === 'not_authorized'
      ? 'Votre session ou vos droits ne permettent pas cette action. Reconnectez-vous pour réessayer.'
      : rename ? 'Le renommage n’a pas pu être confirmé. Vérifiez le nom de votre collection avant de réessayer.'
        : 'La suppression n’a pas pu être confirmée. Vérifiez vos collections avant de réessayer.'
    : null

  useEffect(() => {
    active.current = true
    const node = dialog.current!
    const opener = trigger.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    if (rename) input.current?.focus()
    else cancel.current?.focus()
    return () => {
      active.current = false
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [rename, trigger])

  useEffect(() => {
    if (mutation.isPending) heading.current?.focus()
    else if (nameError) input.current?.focus()
    else if (generalError) errorNode.current?.focus()
  }, [mutation.isPending, nameError, generalError])

  function dismiss() { if (!running.current) close() }

  return <dialog ref={dialog} className="collection-dialog collection-action-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
      const first = controls[0], last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return }
      const onControl = controls.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!onControl || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }}>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{rename ? 'Renommer la collection' : 'Supprimer la collection'}</h2>
    <p id={`${id}-description`}>{rename ? 'Modifiez le nom de votre collection.'
      : 'Cette suppression est définitive. La collection, ses éléments et ses partages seront supprimés. Les destinataires perdront leur accès. Les exemplaires physiques du propriétaire seront conservés.'}</p>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      if (running.current) return
      if (rename && !isValidCollectionName(name)) { setInvalidName(true); input.current?.focus(); return }
      running.current = true
      setInvalidName(false)
      mutation.mutate()
    }}>
      {rename && <>
        <label className="field" htmlFor={`${id}-name`}>Nom de la collection</label>
        <input ref={input} id={`${id}-name`} value={name} required autoComplete="off" disabled={mutation.isPending}
          aria-invalid={nameError || undefined} aria-describedby={nameError ? `${id}-name-error` : `${id}-hint`}
          onChange={event => { setName(event.target.value); setInvalidName(false); mutation.reset() }} />
        {nameError ? <p className="error collection-name-error" id={`${id}-name-error`} role="alert">Saisissez au moins 3 caractères hors espaces en début et fin de nom.</p>
          : <p className="hint" id={`${id}-hint`}>Au moins 3 caractères, sans compter les espaces au début et à la fin.</p>}
      </>}
      {generalError && <p ref={errorNode} className="feedback error" tabIndex={-1} role="alert">{generalError}</p>}
      {mutation.isPending && <p className="collection-pending" role="status">{rename ? 'Enregistrement…' : 'Suppression…'}</p>}
      <div className="collection-dialog-actions">
        <button ref={cancel} className="button collection-cancel" type="button" disabled={mutation.isPending} onClick={dismiss}>Annuler</button>
        <button className={`button ${rename ? 'collection-accent-action' : 'collection-danger-action'}`} type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? rename ? 'Enregistrement…' : 'Suppression…' : rename ? 'Enregistrer' : 'Supprimer la collection'}
        </button>
      </div>
    </form>
  </dialog>
}

export function CollectionActions(props: Props) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLDivElement>(null)
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
    if (open && event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} className="collection-actions-trigger" type="button" aria-label="Actions de la collection"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <span className="collection-actions-icon" aria-hidden="true"><span /><span /><span /></span>
    </button>
    {open && <div className="collection-actions-panel" id={id} role="group" aria-label="Actions de la collection">
      <button ref={first} type="button" onClick={() => { setOpen(false); setAction('rename') }}>Renommer</button>
      <hr />
      <button className="collection-delete-option" type="button" onClick={() => { setOpen(false); setAction('delete') }}>Supprimer la collection</button>
    </div>}
    {action && <CollectionActionDialog {...props} action={action} trigger={trigger} close={() => setAction(null)} />}
  </div>
}
