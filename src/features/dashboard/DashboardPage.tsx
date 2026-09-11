import { useAuth } from '../auth/auth-context'

export function DashboardPage() {
  const { profile, passwordChanged } = useAuth()
  return <section aria-labelledby="page-title">
    <h1 id="page-title" tabIndex={-1}>Dashboard</h1>
    <p className="intro">Bienvenue dans votre espace MY.</p>
    {passwordChanged && <p className="feedback" role="status">Mot de passe modifié. Vous êtes connecté.</p>}
    <p className="hint">Votre identifiant MY.</p><p className="public-id">{profile?.public_id}</p>
  </section>
}
