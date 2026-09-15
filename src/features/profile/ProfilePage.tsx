import { useEffect, useRef, useState } from 'react'
import { AuthForm, SubmitButton } from '../auth/AuthLayout'
import { authRedirectUrl } from '../auth/auth-callback'
import { useAuth } from '../auth/auth-context'
import { fieldValue, useAuthTask } from '../auth/auth-ui'

function membershipDate(createdAt: string | undefined) {
  if (!createdAt) return null
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(date)
}

function PublicIdentity({ publicId }: { publicId: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')
  const running = useRef(false)
  const feedback = copyState === 'success' ? 'Identifiant MY. copié !'
    : copyState === 'error' ? 'Copie automatique impossible. Sélectionnez l’identifiant dans le champ pour le copier manuellement.' : ''

  useEffect(() => {
    if (copyState !== 'success') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2200)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function copy() {
    if (running.current) return
    running.current = true
    setCopyState('copying')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponible')
      await navigator.clipboard.writeText(publicId)
      setCopyState('success')
    } catch {
      setCopyState('error')
    } finally {
      running.current = false
    }
  }

  return <div>
    <label className="profile-label" htmlFor="public-id">MY.ID</label>
    <div className="profile-copy">
      <input id="public-id" className="public-id" type="text" value={publicId} readOnly spellCheck={false} aria-describedby="public-id-hint" />
      <button className="button profile-copy-button" data-state={copyState} type="button" onClick={() => { void copy() }} disabled={copyState === 'copying'} aria-label="Copier l’identifiant MY.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {copyState === 'success' ? <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
        </svg>
      </button>
    </div>
    <p id="public-id-hint" className={`hint${copyState === 'error' ? ' error' : ''}`}>{copyState === 'error' ? feedback : 'Votre identifiant de partage, unique et permanent.'}</p>
    <span className="visually-hidden" role="status" aria-atomic="true">{feedback}</span>
  </div>
}

function EmailChange() {
  const { user, isAuthorized, actions } = useAuth()
  const task = useAuthTask()
  const [sent, setSent] = useState(false)

  function submit(data: FormData) {
    setSent(false)
    const email = fieldValue(data, 'email').trim()
    if (!email || email.toLowerCase() === user?.email?.toLowerCase()) {
      task.setError('Saisissez une nouvelle adresse différente de votre adresse actuelle.')
      return
    }
    task.run(async () => {
      await actions.requestEmailChange(email, authRedirectUrl('/auth/confirm-email-change'))
      setSent(true)
    })
  }

  return <section className="profile-section" aria-labelledby="email-title">
    <h2 id="email-title">Adresse email</h2>
    <dl className="profile-details">
      <div><dt>Adresse actuelle</dt><dd className="email-address">{user?.email || 'Adresse email indisponible.'}</dd></div>
    </dl>
    {user?.new_email && <div className="feedback" role="status">
      <strong>Changement en attente</strong>
      <p className="email-address">Nouvelle adresse demandée : {user.new_email}</p>
      <p>Elle n’est pas encore votre adresse actuelle. Confirmez les liens reçus sur l’ancienne et la nouvelle adresse pour terminer le changement.</p>
    </div>}
    {isAuthorized && user?.email ? <>
      <AuthForm busy={task.busy} error={task.error} submit={submit}>
        <label className="field">Nouvelle adresse email
          <input name="email" type="email" autoComplete="email" required aria-describedby="email-change-hint" />
        </label>
        <p id="email-change-hint" className="hint">Vous devrez confirmer l’ancienne et la nouvelle adresse. Votre adresse actuelle reste utilisée jusque-là.</p>
        <SubmitButton busy={task.busy}>Demander le changement</SubmitButton>
      </AuthForm>
      {sent && !user.new_email && <p className="feedback" role="status">Demande envoyée. Le changement reste en attente des confirmations sur l’ancienne et la nouvelle adresse.</p>}
    </> : <p className="feedback" role="status">Les données du compte sont indisponibles. Le changement d’email est momentanément inaccessible.</p>}
  </section>
}

export function ProfilePage() {
  const { user, profile, mfa } = useAuth()
  const memberSince = membershipDate(user?.created_at)

  return <section className="authenticated-page profile-page" aria-labelledby="page-title">
    <h1 id="page-title" tabIndex={-1}>Profil</h1>
    <p className="intro">Vos informations personnelles et la sécurité de votre compte.</p>
    <section className="profile-section" aria-labelledby="identity-title">
      <h2 id="identity-title">Identité MY.</h2>
      <p className="profile-membership">{memberSince ? <>Membre depuis le <time dateTime={user?.created_at}>{memberSince}</time>.</> : 'Date d’inscription indisponible.'}</p>
      {profile?.public_id ? <PublicIdentity key={profile.public_id} publicId={profile.public_id} /> : <p className="feedback" role="status">Identifiant MY. indisponible.</p>}
    </section>
    <EmailChange key={user?.id} />
    <section className="profile-section" aria-labelledby="authenticator-title">
      <h2 id="authenticator-title">Authenticator</h2>
      <p className="profile-authenticator">{!mfa ? 'Statut Authenticator indisponible.' : mfa.verifiedFactors.length > 0 ? 'Authenticator configuré' : 'Aucun Authenticator vérifié.'}</p>
      <p className="hint">Pour modifier ou remplacer votre Authenticator, il est nécessaire de contacter un administrateur.</p>
    </section>
  </section>
}
