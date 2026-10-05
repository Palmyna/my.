import { useEffect, useId, useRef, useState } from 'react'
import { isValidCollectionName } from '../../lib/collection-name'
import { CollectionsError } from '../../services/collections'
import { CollectionItemDialog } from '../collections/CollectionItemDialog'

export function CreatePokemonCollectionDialog({ name: pokemonName, busy, error, opener, onClose, onCreate, onReset }: {
  name: string; busy: boolean; error: Error | null; opener: HTMLElement
  onClose: () => void; onCreate: (name: string) => void; onReset: () => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState(false)
  const code = error instanceof CollectionsError ? error.code : null
  const nameError = invalid || code === 'invalid_name'
  useEffect(() => { if (nameError && !busy) input.current?.focus() }, [nameError, busy])
  const message = !error || nameError ? null : code === 'not_authorized'
    ? 'Votre session ne permet pas cette action. Reconnectez-vous pour créer une collection.'
    : code === 'target_not_found' || code === 'empty_automatic_target' || code === 'invalid_target'
      ? 'Ce Pokémon n’est plus disponible dans le catalogue.'
      : 'La création n’a pas pu être confirmée. Veuillez réessayer.'
  return <CollectionItemDialog title="Nouvelle collection" description={`Crée automatiquement une collection à partir de ${pokemonName}.`}
    busy={busy} error={message} opener={opener} onClose={onClose} pendingMessage="Création en cours…">
    <p className="catalog-creation-context">{pokemonName}</p>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      if (busy) return
      if (!isValidCollectionName(name)) { setInvalid(true); input.current?.focus(); return }
      setInvalid(false); onCreate(name)
    }}>
      <label className="field" htmlFor={`${id}-name`}>Nom de la collection</label>
      <input ref={input} data-initial-focus id={`${id}-name`} required autoComplete="off" value={name} disabled={busy}
        aria-invalid={nameError || undefined} aria-describedby={`${id}-hint`}
        onChange={event => { setName(event.target.value); setInvalid(false); onReset() }} />
      <p id={`${id}-hint`} className={nameError ? 'error collection-name-error' : 'hint'} role={nameError ? 'alert' : undefined}>
        {nameError ? 'Saisissez au moins 3 caractères hors espaces en début et fin de nom.'
          : 'Au moins 3 caractères, sans compter les espaces au début et à la fin.'}
      </p>
      <div className="collection-dialog-actions">
        <button type="button" className="button collection-cancel" disabled={busy} onClick={onClose}>Annuler</button>
        <button type="submit" className="button catalog-primary" disabled={busy}>Créer la collection</button>
      </div>
    </form>
  </CollectionItemDialog>
}
