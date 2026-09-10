import { useState } from 'react'
import { Link } from 'react-router'
import type { AuthService } from '../../services/auth'
import { authRedirectUrl } from './auth-callback'
import { useAuth } from './auth-context'
import { AuthForm, AuthLayout, EmailField, PasswordFields, SubmitButton, TotpField } from './AuthLayout'
import { fieldValue, passwordsMatch, useAuthTask } from './auth-ui'

export function HomePage() {
  return <AuthLayout title="Vos cartes. Votre collection." intro="Un espace à vous, pour vos collections de cartes Pokémon.">
    <div className="home-actions"><Link className="button primary" to="/signup">Créer un compte</Link><Link className="button secondary" to="/login">Se connecter</Link></div>
  </AuthLayout>
}

export function LoginPage() {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <AuthLayout title="Heureux de vous retrouver." intro="Connectez-vous à votre espace MY.">
    <AuthForm {...task} submit={data => task.run(() => actions.signIn(fieldValue(data, 'email').trim(), fieldValue(data, 'password')))}>
      <EmailField /><PasswordFields /><Link className="form-link" to="/forgot-password">Mot de passe oublié ?</Link>
      <SubmitButton busy={task.busy}>Se connecter</SubmitButton>
    </AuthForm>
    <p className="auth-footer">Pas encore de compte ? <Link to="/signup">Créer un compte</Link></p>
    <p className="auth-footer"><Link to="/auth/confirm-email">Renvoyer l’email de confirmation</Link></p>
  </AuthLayout>
}

export function SignupPage() {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <AuthLayout title="Bienvenue chez MY." intro="Créez votre compte. Vos collections vous attendent.">
    <AuthForm {...task} submit={data => {
      if (!passwordsMatch(data)) { task.setError('Les mots de passe ne correspondent pas.'); return }
      task.run(() => actions.signUp(fieldValue(data, 'email').trim(), fieldValue(data, 'password'), authRedirectUrl('/auth/confirm-email')))
    }}><EmailField /><PasswordFields fresh />
      <p className="hint">Vous confirmerez votre email, puis configurerez votre application Authenticator.</p>
      <SubmitButton busy={task.busy}>Créer un compte</SubmitButton>
    </AuthForm>
    <p className="auth-footer">Déjà un compte ? <Link to="/login">Se connecter</Link></p>
  </AuthLayout>
}

export function ConfirmEmailPage() {
  const { emailConfirmed, pendingEmail, actions } = useAuth()
  const [sent, setSent] = useState(false)
  const task = useAuthTask()
  if (emailConfirmed) return <AuthLayout title="Adresse email confirmée" intro="Votre adresse est validée. Connectez-vous avec votre email et votre mot de passe pour continuer.">
    <Link className="button primary" to="/login">Se connecter</Link>
  </AuthLayout>
  return <AuthLayout title="Consultez votre boîte email." intro="Ouvrez le lien de confirmation pour valider votre adresse, puis revenez vous connecter.">
    {pendingEmail && <p className="email-address">{pendingEmail}</p>}
    <p className="hint">Vérifiez aussi vos courriers indésirables. Si votre adresse est déjà confirmée, vous pouvez vous connecter.</p>
    <AuthForm {...task} submit={data => task.run(async () => {
      await actions.resendConfirmation(fieldValue(data, 'email').trim(), authRedirectUrl('/auth/confirm-email')); setSent(true)
    })}><EmailField defaultValue={pendingEmail ?? ''} /><SubmitButton busy={task.busy}>Renvoyer l’email</SubmitButton></AuthForm>
    {sent && <p className="feedback" role="status">Si cette adresse attend une confirmation, un nouvel email a été envoyé.</p>}
    <p className="auth-footer"><Link to="/login">Revenir à la connexion</Link></p>
  </AuthLayout>
}

export function ForgotPasswordPage() {
  const { actions } = useAuth()
  const [sent, setSent] = useState(false)
  const task = useAuthTask()
  return <AuthLayout title="Mot de passe oublié ?" intro="Recevez un lien pour choisir un nouveau mot de passe.">
    <AuthForm {...task} submit={data => task.run(async () => {
      await actions.requestPasswordReset(fieldValue(data, 'email').trim(), authRedirectUrl('/reset-password')); setSent(true)
    })}><EmailField /><SubmitButton busy={task.busy}>Envoyer le lien</SubmitButton></AuthForm>
    {sent && <p className="feedback" role="status">Si un compte correspond à cette adresse, un email de récupération a été envoyé.</p>}
    <p className="hint">Votre Authenticator sera nécessaire avant de modifier votre mot de passe.</p>
    <p className="auth-footer"><Link to="/login">Revenir à la connexion</Link></p>
  </AuthLayout>
}

function ExitAuth() {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <div className="auth-footer"><button className="text-button" disabled={task.busy} onClick={() => task.run(() => actions.signOut())}>Se déconnecter</button>
    {task.error && <p role="alert">{task.error}</p>}</div>
}

export function MfaEnrollPage() {
  const { actions, passwordRecovery } = useAuth()
  const [enrollment, setEnrollment] = useState<Awaited<ReturnType<AuthService['enrollTotp']>> | null>(null)
  const task = useAuthTask()
  return <AuthLayout title="Sécurisez votre compte." intro="Associez une application Authenticator pour protéger votre espace MY.">
    {passwordRecovery && <p className="feedback">Configurez votre Authenticator avant de choisir un nouveau mot de passe.</p>}
    {!enrollment ? <><p>Utilisez par exemple Google Authenticator, Microsoft Authenticator ou 1Password.</p>
      <button className="button primary" disabled={task.busy} onClick={() => task.run(async () => { setEnrollment(await actions.enrollTotp()) })}>{task.busy ? 'Préparation…' : 'Configurer mon Authenticator'}</button>
      {task.error && <p className="feedback error" role="alert">{task.error}</p>}
    </> : <><p>Scannez ce QR code dans votre application.</p>
      <img className="totp-qr" src={enrollment.totp.qr_code} alt="QR code de configuration de votre Authenticator" />
      <details className="manual-secret"><summary>Impossible de scanner le QR code ?</summary><p>Saisissez cette clé dans votre Authenticator :</p><code>{enrollment.totp.secret}</code></details>
      <AuthForm {...task} submit={data => task.run(async () => {
        const challenge = await actions.challengeTotp(enrollment.id)
        await actions.verifyTotp(enrollment.id, challenge.id, fieldValue(data, 'code'))
        setEnrollment(null)
      })}><TotpField /><SubmitButton busy={task.busy}>Valider mon Authenticator</SubmitButton></AuthForm>
    </>}
    <p className="hint">Un seul Authenticator est associé à votre compte. Conservez-en l’accès.</p><ExitAuth />
  </AuthLayout>
}

export function MfaChallengePage() {
  const { actions, mfa, passwordRecovery } = useAuth()
  const task = useAuthTask()
  return <AuthLayout title="Confirmez que c’est vous." intro="Ouvrez votre application Authenticator et saisissez votre code.">
    {passwordRecovery && <p className="feedback">Cette vérification est nécessaire avant de modifier votre mot de passe.</p>}
    <AuthForm {...task} submit={data => task.run(async () => {
      const factor = mfa?.verifiedFactors[0]
      if (!factor) throw new Error('Facteur absent.')
      // Each attempt creates a fresh challenge, including after expiration.
      const challenge = await actions.challengeTotp(factor.id)
      await actions.verifyTotp(factor.id, challenge.id, fieldValue(data, 'code'))
    })}><TotpField /><SubmitButton busy={task.busy}>Vérifier le code</SubmitButton></AuthForm>
    <p className="hint">Authenticator perdu ? Contactez l’administrateur pour une récupération manuelle de votre accès.</p><ExitAuth />
  </AuthLayout>
}

export function ResetPasswordPage() {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <AuthLayout title="Un nouveau départ." intro="Choisissez votre nouveau mot de passe. Votre identité a été vérifiée.">
    <AuthForm {...task} submit={data => {
      if (!passwordsMatch(data)) { task.setError('Les mots de passe ne correspondent pas.'); return }
      task.run(() => actions.updatePassword(fieldValue(data, 'password')))
    }}><PasswordFields fresh /><SubmitButton busy={task.busy}>Enregistrer le mot de passe</SubmitButton></AuthForm><ExitAuth />
  </AuthLayout>
}

export function DashboardPage() {
  const { profile, passwordChanged } = useAuth()
  return <AuthLayout title="Authentification réussie." intro="Bienvenue dans votre espace MY.">
    {passwordChanged && <p className="feedback" role="status">Mot de passe modifié. Vous êtes connecté.</p>}
    <p className="hint">Votre identifiant MY.</p><p className="public-id">{profile?.public_id}</p><ExitAuth />
  </AuthLayout>
}

export function AuthProblemPage({ unconfigured = false }: { unconfigured?: boolean }) {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <AuthLayout title={unconfigured ? 'Connexion indisponible.' : 'Impossible de continuer.'} intro={unconfigured
    ? 'Le service de connexion n’est pas encore configuré.'
    : 'Votre session ou votre lien email n’a pas pu être validé. Le lien peut être invalide, expiré ou déjà utilisé.'}>
    {!unconfigured && <><button className="button secondary" disabled={task.busy} onClick={() => task.run(actions.refresh)}>Réessayer</button><ExitAuth /></>}
    {task.error && <p role="alert">{task.error}</p>}<Link className="form-link" to="/">Revenir à l’accueil</Link>
  </AuthLayout>
}

