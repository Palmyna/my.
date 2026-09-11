import { useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAuth } from '../features/auth/auth-context'
import { AuthLayout } from '../features/auth/AuthLayout'
import { AuthProblemPage, ConfirmEmailPage, ForgotPasswordPage, HomePage, LoginPage, MfaChallengePage, MfaEnrollPage, ResetPasswordPage, SignupPage } from '../features/auth/AuthPages'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { AuthenticatedLayout } from './AuthenticatedLayout'

export function AppRoutes() {
  const auth = useAuth()
  const location = useLocation()
  useEffect(() => {
    const heading = document.querySelector<HTMLHeadingElement>('h1')
    if (heading) { document.title = `${heading.textContent} — MY.`; heading.focus() }
  }, [location.pathname, auth.status])
  if (auth.status === 'initializing') return <main className="loading" role="status">Chargement de votre session…</main>
  if (auth.status === 'error') return <AuthProblemPage />
  if (auth.status === 'unconfigured' && location.pathname !== '/') return <AuthProblemPage unconfigured />
  const target = auth.status === 'mfa_enrollment_required' ? '/auth/mfa/enroll'
    : auth.status === 'mfa_challenge_required' ? '/auth/mfa/challenge'
    : auth.status === 'password_reset_required' ? '/reset-password' : null
  if (target && target !== location.pathname) return <Navigate to={target} replace />
  if (auth.status === 'email_confirmation_required'
    && !['/auth/confirm-email', '/login', '/forgot-password'].includes(location.pathname)) return <Navigate to="/auth/confirm-email" replace />
  return (
    <Routes>
      <Route element={auth.isAuthorized ? <Navigate to="/dashboard" replace /> : <Outlet />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/confirm-email" element={<ConfirmEmailPage />} />
        <Route path="/auth/mfa/enroll" element={auth.status === 'mfa_enrollment_required' ? <MfaEnrollPage /> : <Navigate to="/login" replace />} />
        <Route path="/auth/mfa/challenge" element={auth.status === 'mfa_challenge_required' ? <MfaChallengePage /> : <Navigate to="/login" replace />} />
        <Route path="/reset-password" element={auth.status === 'password_reset_required' ? <ResetPasswordPage /> : <AuthLayout title="Demandez un nouveau lien." intro="Ouvrez le lien reçu par email pour réinitialiser votre mot de passe."><Link className="button primary" to="/forgot-password">Recevoir un lien</Link></AuthLayout>} />
      </Route>
      <Route element={auth.isAuthorized ? <AuthenticatedLayout /> : <Navigate to="/login" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={auth.isAuthorized ? <Navigate to="/dashboard" replace /> : <AuthLayout title="Cette page n’existe pas."><Link className="button primary" to="/">Revenir à l’accueil</Link></AuthLayout>} />
    </Routes>
  )
}
