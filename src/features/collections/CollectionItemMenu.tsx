import { useEffect, useId, useRef, useState } from 'react'

// Disclosure menu matching CollectionActions: normal Tab order, Escape, outside dismissal.
export function CollectionItemMenu({ name, busy, onRemove }: { name: string; busy: boolean; onRemove: (opener: HTMLElement) => void }) {
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
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} type="button" className="collection-actions-trigger" aria-label={`Actions de ${name}`}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-disabled={busy}
      onClick={() => { if (!busy) setOpen(value => !value) }}><span aria-hidden="true">…</span></button>
    {open && <div id={id} className="collection-actions-panel" role="group" aria-label={`Actions de ${name}`}>
      <button ref={first} type="button" className="collection-delete-option" disabled={busy}
        onClick={() => { setOpen(false); onRemove(trigger.current!) }}>Retirer de la collection</button>
    </div>}
  </div>
}
