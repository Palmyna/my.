import { useEffect, useId, useRef, type ReactNode } from 'react'

// Same native modal, scroll lock and focus restoration as collection/copy actions.
export function CollectionItemDialog({ title, description, busy, error, opener, onClose, children }: {
  title: string; description: string; busy: boolean; error: string | null; opener: HTMLElement | null
  onClose: () => void; children: ReactNode
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorNode = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const node = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    node.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [opener])
  useEffect(() => {
    if (busy) heading.current?.focus()
    else if (error) errorNode.current?.focus()
  }, [busy, error])
  return <dialog ref={dialog} className="collection-dialog collection-item-dialog" aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
        .filter(control => !control.closest('[hidden]') && (!(control instanceof HTMLInputElement) || control.type !== 'radio' || control.checked))
      const first = controls[0], last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return }
      const onControl = controls.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (!onControl || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }}>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2>
    <p id={`${id}-description`}>{description}</p>
    {children}
    {error && <p ref={errorNode} tabIndex={-1} role="alert" className="feedback error">{error}</p>}
    {busy && <p role="status">Modification en cours…</p>}
  </dialog>
}
