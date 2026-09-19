import { describe, expect, test, vi } from 'vitest'
import { confirmedUser, mockAuthClient, profile, session, totpFactor } from '../test/auth-fixtures'
import { createAuthService } from './auth'
import { authErrorMessage } from '../features/auth/auth-ui'

describe('Auth email et session', () => {
  test('signup transmet uniquement email/mot de passe et attend la confirmation', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    expect(await auth.signUp('a@example.test', 'password', 'http://localhost:5173')).toMatchObject({ confirmationRequired: true, session: null })
    expect(mock.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.test', password: 'password', options: { emailRedirectTo: 'http://localhost:5173' } })
    expect(mock.from).not.toHaveBeenCalled()
  })
  test('login, restauration et logout utilisent le client unique', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    expect(await auth.signIn('a@example.test', 'password')).toMatchObject({ session })
    expect(mock.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.test', password: 'password' })
    expect(await auth.getSession()).toEqual(session)
    await auth.signOut()
    expect(mock.auth.signOut).toHaveBeenCalledOnce()
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    expect(await auth.getSession()).toBeNull()
  })
  test('abonnement nettoyé et erreurs Auth transmises au futur écran', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    const listener = vi.fn()
    const stop = auth.subscribe(listener)
    mock.emit('SIGNED_IN', session)
    expect(listener).toHaveBeenCalledWith('SIGNED_IN', session)
    stop()
    mock.emit('SIGNED_OUT', null)
    expect(listener).toHaveBeenCalledOnce()
    expect(mock.unsubscribe).toHaveBeenCalledOnce()
    const error = new Error('Email not confirmed')
    mock.auth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error })
    await expect(auth.signIn('a@example.test', 'bad')).rejects.toBe(error)
    mock.auth.signOut.mockResolvedValue({ error })
    await expect(auth.signOut()).rejects.toBe(error)
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error })
    await expect(auth.getSession()).rejects.toBe(error)
  })
  test('prépare confirmation et récupération sans nouvelle méthode de login', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    await auth.resendConfirmation('a@example.test')
    await auth.requestPasswordReset('a@example.test', 'http://localhost:5173')
    await expect(auth.updatePassword('new-password')).rejects.toThrow('aal2')
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
    mock.authorize()
    await auth.updatePassword('new-password')
    expect(mock.auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@example.test', options: {} })
    expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.test', { redirectTo: 'http://localhost:5173' })
    expect(mock.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
    expect(mock.from).not.toHaveBeenCalled()
  })
})

describe('changement volontaire du mot de passe — contrat SDK simulé', () => {
  test.each(['session absente', 'email non confirmé', 'aal1', 'TOTP absent', 'TOTP non vérifié'])('refuse avant mutation : %s', async condition => {
    const mock = mockAuthClient()
    mock.authorize()
    if (condition === 'session absente') mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    if (condition === 'email non confirmé') mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined } }, error: null })
    if (condition === 'aal1') mock.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    if (condition.startsWith('TOTP')) mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: condition === 'TOTP absent' ? [] : [{ ...totpFactor, status: 'unverified' }] } }, error: null })
    const error = await createAuthService(mock.client).changePassword('current-password', 'new-password').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect(authErrorMessage(error)).toContain(condition === 'session absente' ? 'session a expiré' : condition === 'email non confirmé' ? 'Confirmez votre adresse email' : 'Authenticator')
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
    expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mock.mfa.challenge).not.toHaveBeenCalled()
  })
  test('transmet exactement les deux mots de passe sans vérifier le mot de passe actuel côté client', async () => {
    const mock = mockAuthClient()
    mock.authorize()
    expect(await createAuthService(mock.client).changePassword(' current-password ', ' new-password ')).toEqual({ user: confirmedUser })
    expect(mock.auth.getUser).toHaveBeenCalledExactlyOnceWith(session.access_token)
    expect(mock.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledExactlyOnceWith(session.access_token)
    expect(mock.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: ' new-password ', current_password: ' current-password ' })
    expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mock.auth.signOut).not.toHaveBeenCalled()
    expect(mock.auth.resetPasswordForEmail).not.toHaveBeenCalled()
    expect(mock.auth.setSession).not.toHaveBeenCalled()
    expect(mock.mfa.challenge).not.toHaveBeenCalled()
    expect(mock.mfa.verify).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
  })
  test.each([
    ['current_password_invalid', 'Le mot de passe actuel est incorrect.'],
    ['current_password_mismatch', 'Le mot de passe actuel est incorrect.'],
    ['current_password_required', 'Saisissez votre mot de passe actuel.'],
    ['weak_password', 'plus robuste'],
    ['same_password', 'différent du précédent'],
    ['session_not_found', 'session a expiré'],
    ['session_expired', 'session a expiré'],
    ['bad_jwt', 'session a expiré'],
    ['insufficient_aal', 'Authenticator'],
    ['over_request_rate_limit', 'Trop de tentatives'],
    ['unknown', 'Impossible de terminer cette action'],
  ])('propage et traduit le code simulé %s sans texte brut', async (code, message) => {
    const mock = mockAuthClient()
    mock.authorize()
    const error = Object.assign(new Error('sensitive payload'), { code })
    mock.auth.updateUser.mockResolvedValue({ data: null, error })
    await expect(createAuthService(mock.client).changePassword('current-password', 'new-password')).rejects.toBe(error)
    expect(authErrorMessage(error)).toContain(message)
    expect(authErrorMessage(error)).not.toContain('sensitive payload')
  })
  test('une session refusée par getUser ne parvient pas à updateUser', async () => {
    const mock = mockAuthClient()
    mock.authorize()
    const error = Object.assign(new Error('revoked'), { code: 'session_not_found' })
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(createAuthService(mock.client).changePassword('current-password', 'new-password')).rejects.toBe(error)
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('TOTP et profil', () => {
  test('un enrollment abandonné remplace uniquement les TOTP non vérifiés', async () => {
    const mock = mockAuthClient()
    mock.mfa.listFactors.mockResolvedValue({ data: { all: [{ ...totpFactor, status: 'unverified' }] }, error: null })
    await createAuthService(mock.client).enrollTotp()
    expect(mock.mfa.unenroll).toHaveBeenCalledWith({ factorId: totpFactor.id })
    expect(mock.mfa.enroll).toHaveBeenCalledOnce()
    mock.mfa.listFactors.mockResolvedValue({ data: { all: [totpFactor] }, error: null })
    await expect(createAuthService(mock.client).enrollTotp()).rejects.toThrow('déjà configuré')
    expect(mock.mfa.unenroll).toHaveBeenCalledOnce()
    expect(mock.mfa.enroll).toHaveBeenCalledOnce()
  })
  test.each([
    { level: 'aal1', factors: [], requirement: 'enrollment_required' },
    { level: 'aal1', factors: [{ ...totpFactor, status: 'unverified' }], requirement: 'enrollment_required' },
    { level: 'aal1', factors: [totpFactor], requirement: 'challenge_required' },
    { level: 'aal2', factors: [totpFactor], requirement: 'satisfied' },
    { level: 'aal2', factors: [], requirement: 'enrollment_required' },
    { level: null, factors: [totpFactor], requirement: 'challenge_required' },
    { level: 'aal2', factors: [{ ...totpFactor, factor_type: 'phone' }], requirement: 'enrollment_required' },
  ])('AAL $level : $requirement selon les facteurs vérifiés', async ({ level, factors, requirement }) => {
    const mock = mockAuthClient()
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors } }, error: null })
    mock.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: level, nextLevel: 'aal2' }, error: null })
    expect(await createAuthService(mock.client).getMfaState(session)).toMatchObject({ currentLevel: level, requirement })
    expect(mock.auth.getUser).toHaveBeenCalledWith(session.access_token)
    expect(mock.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith(session.access_token)
  })
  test('liste, enrollment QR/secret, challenge et vérification TOTP', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    expect(await auth.listFactors()).toMatchObject({ totp: [totpFactor] })
    mock.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null })
    expect(await auth.enrollTotp('Téléphone')).toMatchObject({ id: 'new-factor', totp: { qr_code: 'qr-image', secret: 'test-secret' } })
    expect(mock.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', issuer: 'MY.', friendlyName: 'Téléphone' })
    expect(await auth.challengeTotp('new-factor')).toMatchObject({ id: 'challenge-id' })
    await auth.verifyTotp('new-factor', 'challenge-id', '123456')
    expect(mock.mfa.challenge).toHaveBeenCalledWith({ factorId: 'new-factor' })
    expect(mock.mfa.verify).toHaveBeenCalledWith({ factorId: 'new-factor', challengeId: 'challenge-id', code: '123456' })
    mock.mfa.verify.mockResolvedValue({ data: null, error: new Error('Invalid code') })
    await expect(auth.verifyTotp('new-factor', 'challenge-id', '000000')).rejects.toThrow('Invalid code')
  })
  test('profil inaccessible avant aal2, filtré par UUID après MFA', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    await expect(auth.getProfile()).rejects.toThrow('aal2')
    expect(mock.from).not.toHaveBeenCalled()
    mock.authorize()
    expect(await auth.getProfile()).toEqual(profile)
    expect(mock.from).toHaveBeenCalledWith('profiles')
    expect(mock.eq).toHaveBeenCalledWith('id', confirmedUser.id)
  })
  test('email non confirmé, session absente et erreur Auth interdisent la lecture profil', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    mock.authorize()
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined, user_metadata: { email_confirmed_at: 'forged', aal: 'aal2' } } }, error: null })
    await expect(auth.getProfile()).rejects.toThrow('Email confirmé')
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(auth.getProfile()).rejects.toThrow('Session requise')
    mock.auth.getSession.mockResolvedValue({ data: { session }, error: null })
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Session revoked') })
    await expect(auth.getProfile()).rejects.toThrow('Session revoked')
    expect(mock.from).not.toHaveBeenCalled()
  })
})

describe('changement d’adresse email', () => {
  const redirect = 'http://localhost:5173/auth/confirm-email-change'
  test('refuse sans session, email confirmé ou TOTP aal2', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    await expect(auth.requestEmailChange('new@example.test', redirect)).rejects.toThrow('aal2')
    mock.authorize()
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined } }, error: null })
    await expect(auth.requestEmailChange('new@example.test', redirect)).rejects.toThrow('Email confirmé')
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(auth.requestEmailChange('new@example.test', redirect)).rejects.toThrow('Session requise')
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
  })
  test('renvoie la demande Auth en attente sans nouveau TOTP ni écriture profil', async () => {
    const mock = mockAuthClient()
    mock.authorize()
    const user = { ...confirmedUser, new_email: 'new@example.test' }
    mock.auth.updateUser.mockResolvedValue({ data: { user }, error: null })
    const result = await createAuthService(mock.client).requestEmailChange('new@example.test', redirect)
    expect(result.user).toEqual(user)
    expect(result.user?.email).toBe(confirmedUser.email)
    expect(mock.auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.test' }, { emailRedirectTo: redirect })
    expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mock.mfa.challenge).not.toHaveBeenCalled()
    expect(mock.mfa.verify).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
  })
  test('propage le refus serveur sans annonce de succès', async () => {
    const mock = mockAuthClient()
    mock.authorize()
    const error = Object.assign(new Error('Unavailable'), { code: 'email_exists' })
    mock.auth.updateUser.mockResolvedValue({ data: null, error })
    await expect(createAuthService(mock.client).requestEmailChange('new@example.test', redirect)).rejects.toBe(error)
  })
  test('relit Auth à la confirmation finale et termine seulement la session technique', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    expect(await auth.completeEmailCallback(session, 'email_change')).toBeNull()
    expect(mock.auth.getUser).toHaveBeenCalledWith(session.access_token)
    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mock.from).not.toHaveBeenCalled()
  })
  test('une adresse encore en attente ou une relecture Auth en échec ne confirme rien', async () => {
    const mock = mockAuthClient()
    const auth = createAuthService(mock.client)
    mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, new_email: 'pending@example.test' } }, error: null })
    await expect(auth.completeEmailCallback(session, 'email_change')).rejects.toThrow('n’est pas confirmé')
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Session expired') })
    await expect(auth.completeEmailCallback(session, 'email_change')).rejects.toThrow('Session expired')
  })
})
