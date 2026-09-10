import { useRef, useState } from 'react'

export function authErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  switch (code) {
    case 'invalid_credentials': return 'Email ou mot de passe incorrect.'
    case 'email_not_confirmed': return 'Confirmez votre adresse email avant de vous connecter.'
    case 'weak_password': return 'Choisissez un mot de passe plus robuste pour respecter la politique de sécurité.'
    case 'same_password': return 'Choisissez un mot de passe différent du précédent.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Trop de tentatives. Patientez un instant avant de réessayer.'
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected': return 'Code incorrect ou expiré. Saisissez le code actuel de votre Authenticator.'
    case 'mfa_challenge_expired': return 'Le challenge a expiré. Saisissez le code actuel et réessayez.'
    case 'session_not_found':
    case 'session_expired': return 'Votre session a expiré. Revenez à la connexion.'
    default: return 'Impossible de terminer cette action. Vérifiez votre connexion et réessayez.'
  }
}

export function useAuthTask() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  function run(task: () => Promise<unknown>) {
    if (running.current) return
    running.current = true
    setBusy(true); setError(null)
    void task().catch((cause: unknown) => setError(authErrorMessage(cause))).finally(() => { running.current = false; setBusy(false) })
  }
  return { busy, error, setError, run }
}

export function passwordsMatch(data: FormData) { return data.get('password') === data.get('confirmation') }
export function fieldValue(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value : '' }

