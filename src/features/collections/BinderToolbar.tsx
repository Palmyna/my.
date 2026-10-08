import { useId, useRef, useState } from 'react'
import { BINDER_FORMATS } from '../../types/view-preferences'
import { BinderFormatGrid } from '../view-preferences/BinderFormatGrid'
import { parseBinderPage } from './binder-pagination'
import type { BinderNavigation } from './useBinderNavigation'
import type { useBinderFormat } from './useBinderFormat'

export function BinderToolbar({ preferences, navigation }: {
  preferences: ReturnType<typeof useBinderFormat>; navigation: BinderNavigation
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const { format, override, choose, busy, ready } = preferences
  const { currentPage, pages, goTo } = navigation
  const value = draft ?? String(currentPage)
  function submitPage() {
    const target = parseBinderPage(value, pages.length)
    if (target !== null) goTo(target)
    setDraft(null)
  }
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  return <div className="binder-toolbar">
    <div className="binder-format-control" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); close() }
    }}>
      <button ref={trigger} type="button" className="binder-format-trigger" aria-label={`Format du classeur : ${format.replace('x', '×')}`}
        aria-expanded={open} aria-controls={id} disabled={!ready || busy} onClick={() => setOpen(!open)}>
        <BinderFormatGrid format={format} /><span>{format.replace('x', '×')}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && <div id={id} className="binder-format-popover" role="group" aria-label="Choisir le format du classeur">
        {BINDER_FORMATS.map(choice => <button type="button" key={choice} aria-pressed={format === choice}
          disabled={busy} onClick={() => { choose(choice); close() }}>
          <BinderFormatGrid format={choice} />{choice.replace('x', '×')}
        </button>)}
        {override != null && <button type="button" className="binder-format-default" disabled={busy}
          onClick={() => { choose(null); close() }}>Utiliser le format par défaut</button>}
      </div>}
    </div>
    {ready && pages.length > 0 && <form className="binder-page-control" onSubmit={event => { event.preventDefault(); submitPage() }}>
      <label htmlFor={`${id}-page`}>Page</label>
      <input id={`${id}-page`} aria-label="Numéro de page" type="text" inputMode="numeric" autoComplete="off"
        value={value} onChange={event => setDraft(event.target.value)} onBlur={submitPage}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setDraft(null) } }} />
      <span>/ {pages.length}</span>
    </form>}
    {preferences.error && <span role="alert">Format indisponible. <button type="button" onClick={preferences.retry}>Réessayer</button></span>}
    {preferences.saveError && <span role="alert">Le format n’a pas pu être confirmé. Réessayez.</span>}
  </div>
}

export function BinderOccurrences({ navigation }: { navigation: BinderNavigation }) {
  if (!navigation.searching) return null
  if (navigation.occurrenceCount === 0) return <span className="binder-search-empty" role="status">Aucune carte ne correspond à cette recherche.</span>
  const index = navigation.occurrence
  return <div className="binder-occurrences" role="group" aria-label="Occurrences de recherche">
    <button type="button" aria-label="Occurrence précédente" disabled={index <= 0} onClick={() => navigation.moveOccurrence(-1)}>‹</button>
    <output aria-live="polite" aria-label="Occurrence courante">{index < 0 ? 0 : index + 1} / {navigation.occurrenceCount}</output>
    <button type="button" aria-label="Occurrence suivante" disabled={index < 0 || index >= navigation.occurrenceCount - 1}
      onClick={() => navigation.moveOccurrence(1)}>›</button>
  </div>
}
