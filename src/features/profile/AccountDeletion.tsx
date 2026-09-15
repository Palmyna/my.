import { useEffect, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker, useNavigate } from 'react-router'
import { AccountDeletionError, type DeletionErrorCode } from '../../services/account-deletion'
import { useAuth } from '../auth/auth-context'

const failures: Record<DeletionErrorCode, { message: string; target: 'password' | 'totp' | 'consequences' | 'final' | 'reconnect' }> = {
  authentication_required: { message: 'Votre session a expiré. Reconnectez-vous avant de reprendre.', target: 'reconnect' },
  authorized_account_required: { message: 'Un compte avec email confirmé et vérification Authenticator est requis. Reconnectez-vous.', target: 'reconnect' },
  verified_totp_required: { message: 'Un Authenticator vérifié est requis. Reconnectez-vous ou contactez un administrateur.', target: 'reconnect' },
  password_required: { message: 'Renseignez votre mot de passe actuel.', target: 'password' },
  totp_required: { message: 'Saisissez les 6 chiffres de votre Authenticator.', target: 'totp' },
  password_verification_failed: { message: 'Le mot de passe actuel est incorrect. Réessayez.', target: 'password' },
  totp_challenge_failed: { message: 'La vérification Authenticator n’a pas pu démarrer. Saisissez un code récent et réessayez.', target: 'totp' },
  totp_verification_failed: { message: 'Le code Authenticator est incorrect ou expiré. Saisissez un nouveau code.', target: 'totp' },
  identity_mismatch: { message: 'L’identité du compte n’a pas pu être confirmée. Reconnectez-vous.', target: 'reconnect' },
  final_confirmation_required: { message: 'Confirmez à nouveau la suppression définitive.', target: 'final' },
  consequences_confirmation_required: { message: 'Confirmez avoir compris les conséquences.', target: 'consequences' },
  session_revocation_failed: { message: 'Votre compte n’a pas été supprimé : la révocation des sessions a échoué. Une reconnexion est nécessaire.', target: 'reconnect' },
  deletion_failed: { message: 'Votre compte n’a pas été supprimé. Vos sessions ont été révoquées : une reconnexion est nécessaire.', target: 'reconnect' },
  service_unavailable: { message: 'Le service est momentanément indisponible. Attendez avant de réessayer avec un code récent.', target: 'totp' },
  rate_limited: { message: 'Trop de tentatives. Patientez avant de réessayer avec un code récent.', target: 'totp' },
  uncertain: { message: 'La réponse n’a pas pu être confirmée. La suppression a peut-être eu lieu. Reconnectez-vous pour vérifier l’état de votre compte avant toute nouvelle tentative.', target: 'reconnect' },
}

function DeletionDialog({ close }: { close: () => void }) {
  const { actions } = useAuth()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const totpInput = useRef<HTMLInputElement>(null)
  const errorNode = useRef<HTMLParagraphElement>(null)
  const running = useRef(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [consequences, setConsequences] = useState(false)
  const [currentPassword, setPassword] = useState('')
  const [totpCode, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<typeof failures[DeletionErrorCode] | null>(null)
  const blocker = useBlocker(() => running.current)
  useBeforeUnload(event => {
    if (running.current) { event.preventDefault(); event.returnValue = '' }
  })

  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  useEffect(() => {
    const node = dialog.current!
    const opener = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (busy) heading.current?.focus()
    else if (failure?.target === 'password') passwordInput.current?.focus()
    else if (failure?.target === 'totp') totpInput.current?.focus()
    else if (failure) errorNode.current?.focus()
    else if (step === 2) passwordInput.current?.focus()
    else heading.current?.focus()
  }, [step, failure, busy])

  function dismiss() {
    if (running.current) return
    setPassword(''); setTotp(''); close(); actions.resumeAuthAfterDeletion()
  }

  async function remove() {
    if (running.current) return
    running.current = true
    setBusy(true); setFailure(null)
    try {
      await actions.deleteAccount({ currentPassword, totpCode, confirmConsequences: true, confirmDeletion: true })
      setPassword(''); setTotp('')
      // The store publishes success and removes the authenticated shell before SDK cleanup.
    } catch (error) {
      const next = failures[error instanceof AccountDeletionError ? error.code : 'uncertain']
      setFailure(next)
      if (next.target !== 'final') setTotp('')
      if (next.target === 'password') setPassword('')
      if (next.target === 'reconnect') { setPassword(''); setStep(3) }
      else if (next.target === 'consequences') { setConsequences(false); setStep(1) }
      else if (next.target === 'final') setStep(3)
      else setStep(2)
    } finally { running.current = false; setBusy(false) }
  }

  return <dialog ref={dialog} className="account-deletion-dialog" aria-labelledby="deletion-title" aria-describedby="deletion-description"
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return }
      const onControl = Array.from(controls).some(node => node === document.activeElement)
      if (event.shiftKey && (!onControl || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss()
    }}>
    <p className="hint deletion-step">Étape {step} sur 3</p>
    <h2 id="deletion-title" tabIndex={-1} ref={heading}>{step === 1 ? 'Supprimer votre compte' : step === 2 ? 'Vérifier votre identité' : 'Confirmer la suppression'}</h2>
    <p id="deletion-description">{step === 1 ? 'Cette action est définitive. Prenez connaissance de ses conséquences.'
      : step === 2 ? 'Saisissez vos identifiants. Ils seront vérifiés par le serveur lors de la confirmation finale.'
        : 'La confirmation finale vérifiera votre identité puis supprimera définitivement votre compte et ses données.'}</p>
    {failure && <p ref={errorNode} tabIndex={-1} id="deletion-error" className="feedback error" role="alert">{failure.message}</p>}
    <form onSubmit={event => {
      event.preventDefault()
      if (running.current || failure?.target === 'reconnect') return
      if (step === 1 && consequences) { setFailure(null); setStep(2) }
      else if (step === 2 && currentPassword && /^\d{6}$/.test(totpCode)) { setFailure(null); setStep(3) }
      else if (step === 3) void remove()
    }}>
      <fieldset disabled={busy}>
        {step === 1 && <>
          <ul className="deletion-consequences">
            <li>Votre compte, votre profil et vos préférences seront supprimés.</li>
            <li>Vos collections, leur contenu et leurs partages seront supprimés. Leurs destinataires perdront ces accès.</li>
            <li>Vos accès reçus à des collections partagées seront supprimés.</li>
            <li>Vos exemplaires physiques, leur état, leurs notes et leurs informations de gradation seront supprimés.</li>
          </ul>
          <p>Le catalogue Pokémon global MY. et les données des autres utilisateurs seront conservés.</p>
          <label className="deletion-checkbox"><input type="checkbox" checked={consequences} onChange={event => setConsequences(event.target.checked)} />
            <span>J’ai compris les conséquences de cette suppression définitive.</span>
          </label>
        </>}
        {step === 2 && <>
          <label className="field">Mot de passe actuel
            <input ref={passwordInput} type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword}
              aria-invalid={failure?.target === 'password' || undefined} aria-describedby={failure ? 'deletion-error' : undefined}
              onChange={event => setPassword(event.target.value)} />
          </label>
          <label className="field">Code Authenticator
            <input ref={totpInput} type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={totpCode}
              aria-invalid={failure?.target === 'totp' || undefined} aria-describedby={failure ? 'deletion-error' : 'deletion-totp-hint'}
              onChange={event => setTotp(event.target.value)} />
          </label>
          <p id="deletion-totp-hint" className="hint">Les 6 chiffres de votre application Authenticator. Utilisez un code récent.</p>
        </>}
        {step === 3 && !failure && <p>Cette suppression est irréversible. Vous serez déconnecté de MY.</p>}
        {busy && <p className="feedback" role="status">Suppression en cours… Veuillez patienter sans quitter cette page.</p>}
        <div className="deletion-actions">
          {failure?.target === 'reconnect' ? <button className="button primary" type="button" onClick={() => {
            actions.reconnectAfterDeletion(); void navigate('/login', { replace: true })
          }}>Revenir à la connexion</button>
            : <button className="button primary" type="submit" disabled={busy || (step === 1 && !consequences)}>
              {busy ? 'Suppression en cours…' : step === 3 ? 'Supprimer définitivement mon compte' : 'Continuer'}
            </button>}
          {step > 1 && failure?.target !== 'reconnect' && <button className="button" type="button" onClick={() => { setFailure(null); setStep(step === 3 ? 2 : 1) }}>Retour</button>}
          <button className="button" type="button" onClick={dismiss}>Annuler</button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

export function AccountDeletion() {
  const { isAuthorized } = useAuth()
  const [open, setOpen] = useState(false)
  if (!isAuthorized) return null
  return <div className="profile-deletion">
    <button type="button" className="deletion-trigger" onClick={() => setOpen(true)}>Supprimer mon compte</button>
    {open && <DeletionDialog close={() => setOpen(false)} />}
  </div>
}
