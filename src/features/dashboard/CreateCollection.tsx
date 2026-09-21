import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { isValidCollectionName } from '../../lib/collection-name'
import { CollectionsError, createFree } from '../../services/collections'
import { dashboardCollectionsKey } from './dashboard-query'

const nameMessage = 'Saisissez au moins 3 caractères hors espaces en début et fin de nom.'

function FreeCollectionDialog({ userId, trigger, close, created }: {
  userId: string
  trigger: RefObject<HTMLButtonElement | null>
  close: () => void
  created: () => void
}) {
  const queryClient = useQueryClient()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const errorNode = useRef<HTMLParagraphElement>(null)
  const running = useRef(false)
  const [name, setName] = useState('')
  const [invalidName, setInvalidName] = useState(false)
  const mutation = useMutation({
    mutationFn: createFree,
    retry: false,
  })
  const nameError = invalidName || (mutation.error instanceof CollectionsError && mutation.error.code === 'invalid_name')
  const generalError = mutation.isError && !nameError
    ? mutation.error instanceof CollectionsError && mutation.error.code === 'not_authorized'
      ? 'Votre session ne permet pas cette action. Reconnectez-vous pour créer une collection.'
      : 'La création n’a pas pu être confirmée. Vérifiez vos collections avant de réessayer.'
    : null

  useEffect(() => {
    const node = dialog.current!
    const opener = trigger.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    input.current?.focus()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [trigger])

  useEffect(() => {
    if (mutation.isPending) heading.current?.focus()
    else if (nameError) input.current?.focus()
    else if (generalError) errorNode.current?.focus()
  }, [mutation.isPending, nameError, generalError])

  function dismiss() { if (!running.current) close() }

  return <dialog ref={dialog} className="collection-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return }
      const onControl = controls.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!onControl || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }}>
    <p className="collection-dialog-eyebrow">Nouvelle collection</p>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>Collection libre</h2>
    <p id={`${id}-description`}>Créez une collection vide et ajoutez-y ensuite les cartes de votre choix.</p>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      if (running.current) return
      if (!isValidCollectionName(name)) { setInvalidName(true); input.current?.focus(); return }
      running.current = true
      setInvalidName(false)
      mutation.mutate({ name }, {
        onSuccess: () => {
          created()
          // Only the current user's Dashboard. Its server read constructs the new tile.
          void queryClient.invalidateQueries({ queryKey: dashboardCollectionsKey(userId), exact: true })
        },
        onSettled: () => { running.current = false },
      })
    }}>
      <label className="field" htmlFor={`${id}-name`}>Nom de la collection</label>
      <input ref={input} id={`${id}-name`} value={name} required disabled={mutation.isPending} autoComplete="off"
        aria-invalid={nameError || undefined} aria-describedby={nameError ? `${id}-name-error` : `${id}-hint`}
        onChange={event => { setName(event.target.value); setInvalidName(false); mutation.reset() }} />
      {!nameError && <p className="hint" id={`${id}-hint`}>Au moins 3 caractères, sans compter les espaces au début et à la fin.</p>}
      {nameError && <p className="error collection-name-error" id={`${id}-name-error`} role="alert">{nameMessage}</p>}
      {generalError && <p className="feedback error" ref={errorNode} tabIndex={-1} role="alert">{generalError}</p>}
      {mutation.isPending && <p className="collection-pending" role="status">Création en cours…</p>}
      <div className="collection-dialog-actions">
        <button className="button collection-cancel" type="button" disabled={mutation.isPending} onClick={dismiss}>Annuler</button>
        <button className="button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Création…' : 'Créer la collection'}</button>
      </div>
    </form>
  </dialog>
}

export function CreateCollection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <div className="dashboard-create">
    <button ref={trigger} className="button" type="button" aria-haspopup="dialog"
      onClick={() => { setSuccess(false); setOpen(true) }}>Nouvelle collection</button>
    {success && <p className="collection-created" role="status">Collection créée.</p>}
    {open && <FreeCollectionDialog userId={userId} trigger={trigger} close={() => setOpen(false)}
      created={() => { setOpen(false); setSuccess(true) }} />}
  </div>
}
