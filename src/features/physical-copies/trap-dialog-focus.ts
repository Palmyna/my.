import type { KeyboardEvent } from 'react'

// Includes note disclosures and inline form controls in both copy surfaces.
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary'))
  const first = controls[0], last = controls[controls.length - 1]
  if (!first || !last) { event.preventDefault(); event.currentTarget.querySelector<HTMLElement>('h2')?.focus(); return }
  const onControl = controls.includes(document.activeElement as HTMLElement)
  if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (!onControl || document.activeElement === last)) { event.preventDefault(); first.focus() }
}
