import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { saveUserPreferences } from '../../services/view-preferences'
import { BINDER_FORMATS, type UserPreferences } from '../../types/view-preferences'
import { useAuth } from '../auth/auth-context'
import { BinderFormatGrid } from '../view-preferences/BinderFormatGrid'
import { confirmUserPreferences, userPreferencesKey, userPreferencesOptions } from '../view-preferences/view-preferences-query'
import './settings.css'

type DisplayField = 'catalogDefaultView' | 'collectionDefaultView' | 'binderDefaultFormat'
const viewChoices = [
  { value: 'list', label: 'Liste' }, { value: 'cards', label: 'Cartes' },
] as const
const lastUsed = { value: 'last_used', label: 'Dernier choix utilisé' } as const

function PreferenceRow<K extends DisplayField>({ viewerId, field, label, description, preferences, choices }: {
  viewerId: string | undefined; field: K; label: string; description: string; preferences: UserPreferences | undefined
  choices: readonly { value: UserPreferences[K]; label: string; icon?: ReactNode }[]
}) {
  const id = useId()
  const client = useQueryClient()
  const live = useRef<object | null>(null)
  const running = useRef(false)
  const focusTarget = useRef<HTMLInputElement | null>(null)
  useEffect(() => { live.current = {}; return () => { live.current = null } }, [])
  const mutation = useMutation({
    retry: false,
    mutationFn: (request: { viewerId: string; value: UserPreferences[K]; lifetime: object }) =>
      saveUserPreferences(request.viewerId, { [field]: request.value }),
    onSuccess: async (saved, request) => {
      if (live.current !== request.lifetime) return
      await client.cancelQueries({ queryKey: userPreferencesKey(request.viewerId), exact: true })
      if (live.current === request.lifetime) confirmUserPreferences(client, request.viewerId, saved, [field])
    },
    onSettled: () => { running.current = false },
  })
  function choose(value: UserPreferences[K], input: HTMLInputElement) {
    if (!viewerId || !preferences || !live.current || running.current || preferences[field] === value) return
    focusTarget.current = document.activeElement === input ? input : null
    running.current = true
    mutation.mutate({ viewerId, value, lifetime: live.current })
  }
  const busy = mutation.isPending
  useEffect(() => {
    if (busy) return
    const target = focusTarget.current
    focusTarget.current = null
    // Native disabled radios lose focus. Restore it after confirmation/failure
    // only if the user has not moved to another control while saving.
    if (target && document.activeElement === document.body && !target.matches(':disabled')) target.focus({ preventScroll: true })
  }, [busy])
  return <fieldset className="settings-row" disabled={!preferences || busy} aria-busy={busy}
    aria-describedby={`${id}-description${mutation.isError ? ` ${id}-error` : ''}`}>
    <legend className="visually-hidden">{label}</legend>
    <div className="settings-row-text">
      <h3 aria-hidden="true">{label}</h3>
      <p id={`${id}-description`} className="hint">{description}</p>
    </div>
    <div className="settings-row-control">
      <div className="settings-choices">
        {choices.map(choice => <label className="settings-choice" key={choice.value}>
          <input type="radio" name={id} value={choice.value} checked={preferences?.[field] === choice.value}
            aria-describedby={`${id}-description${mutation.isError ? ` ${id}-error` : ''}`}
            onChange={event => choose(choice.value, event.currentTarget)} />
          <span className="settings-choice-content">
            <span className="settings-choice-mark" aria-hidden="true">✓</span>
            {choice.icon}{choice.label}
          </span>
        </label>)}
      </div>
      <span className="settings-save-status" role="status">{busy ? 'Enregistrement…' : ''}</span>
      {mutation.isError && <p className="settings-save-error error" id={`${id}-error`} role="alert">
        Modification non confirmée. Réessayez.
      </p>}
    </div>
  </fieldset>
}

export function SettingsPage() {
  const { user, isAuthorized } = useAuth()
  const viewerId = isAuthorized ? user?.id : undefined
  const query = useQuery(userPreferencesOptions(viewerId))
  const preferences = viewerId && query.isSuccess ? query.data : undefined
  return <section className="authenticated-page settings-page" aria-labelledby="page-title">
    <h1 id="page-title" tabIndex={-1}>Paramètres</h1>
    <p className="intro">Personnalisez l’affichage de votre catalogue et de vos collections.</p>
    <section className="profile-section settings-display" aria-labelledby="display-title">
      <h2 id="display-title">Affichage</h2>
      {!preferences && (query.isError || !viewerId
        ? <div className="feedback" role="alert">
          Impossible de charger vos préférences.
          {viewerId && <button className="button secondary" type="button" disabled={query.isFetching}
            onClick={() => { void query.refetch() }}>Réessayer</button>}
        </div>
        : <p className="settings-loading" role="status">Chargement des préférences…</p>)}
      <PreferenceRow key={`catalog:${viewerId}`} viewerId={viewerId} preferences={preferences} field="catalogDefaultView"
        label="Vue catalogue par défaut" description="À l’ouverture du catalogue. « Dernier choix utilisé » reprend la dernière vue que vous avez choisie."
        choices={[...viewChoices, lastUsed]} />
      <PreferenceRow key={`collection:${viewerId}`} viewerId={viewerId} preferences={preferences} field="collectionDefaultView"
        label="Vue collection par défaut" description="Pour les prochaines ouvertures. « Dernier choix utilisé » reprend la dernière vue que vous avez choisie."
        choices={[...viewChoices, { value: 'binder', label: 'Classeur' }, lastUsed]} />
      <PreferenceRow key={`binder:${viewerId}`} viewerId={viewerId} preferences={preferences} field="binderDefaultFormat"
        label="Format Classeur par défaut" description="Format utilisé par les collections qui n’ont pas de préférence spécifique."
        choices={BINDER_FORMATS.map(format => ({ value: format, label: format.replace('x', '×'), icon: <BinderFormatGrid format={format} /> }))} />
    </section>
  </section>
}
