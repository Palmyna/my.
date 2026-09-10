import { type FormEvent, type PropsWithChildren } from 'react'
import { Link } from 'react-router'
import logo from '../../assets/brand/my-logo.svg'

export function AuthLayout({ title, intro, home = false, children }: PropsWithChildren<{ title: string; intro?: string; home?: boolean }>) {
  return <div className="public-shell">
    <header className="site-header">
      <Link className="brand" to="/" aria-label="MY. — Accueil"><img src={logo} alt="" /></Link>
      {home && <Link className="button header-login" to="/login">Connexion</Link>}
    </header>
    <main className={`auth-layout${home ? ' home-layout' : ''}`}>
      <section className="auth-panel" aria-labelledby="page-title">
        {home && <img className="home-logo" src={logo} alt="MY." />}
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
        {intro && <p className="intro">{intro}</p>}{children}
      </section>
      <div className="welcome-art" aria-hidden="true" />
    </main>
    <footer className="site-footer">Conditions d’utilisation</footer>
  </div>
}

export function AuthForm({ busy, error, submit, children }: PropsWithChildren<{
  busy: boolean; error: string | null; submit: (data: FormData) => void
}>) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy) submit(new FormData(event.currentTarget))
  }
  return <form onSubmit={handleSubmit} aria-busy={busy}><fieldset disabled={busy}>{children}</fieldset>
    {error && <p className="feedback error" role="alert">{error}</p>}
  </form>
}

export function EmailField({ defaultValue = '' }: { defaultValue?: string }) {
  return <label className="field">Adresse email<input name="email" type="email" autoComplete="email" defaultValue={defaultValue} required /></label>
}

export function PasswordFields({ fresh = false }: { fresh?: boolean }) {
  return <>
    <label className="field">{fresh ? 'Nouveau mot de passe' : 'Mot de passe'}
      <input name="password" type="password" autoComplete={fresh ? 'new-password' : 'current-password'} minLength={fresh ? 6 : undefined} required aria-describedby={fresh ? 'password-hint' : undefined} />
    </label>
    {fresh && <><p className="hint" id="password-hint">Au moins 6 caractères. Privilégiez un mot de passe unique.</p>
      <label className="field">Confirmer le mot de passe<input name="confirmation" type="password" autoComplete="new-password" required /></label></>}
  </>
}

export function TotpField() {
  return <><label className="field">Code à 6 chiffres<input className="totp-input" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required aria-describedby="totp-hint" /></label>
    <p id="totp-hint" className="hint">Le code actuel affiché dans votre application Authenticator.</p>
  </>
}

export function SubmitButton({ busy, children }: PropsWithChildren<{ busy: boolean }>) {
  return <button className="button primary" type="submit" disabled={busy}>{busy ? 'Un instant…' : children}</button>
}

