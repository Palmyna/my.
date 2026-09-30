import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { expect, test } from 'vitest'
import { confirmedUser, mockAuthClient, session, totpFactor } from '../test/auth-fixtures'
import { createAuthService } from './auth'
import { deletionErrorCodes, invokeAccountDeletion, type AccountDeletionInput } from './account-deletion'

const input: AccountDeletionInput = { currentPassword: 'private-password', totpCode: '123456', confirmConsequences: true, confirmDeletion: true }

test('un seul appel exact, session SDK existante, sans réauth frontend', async () => {
  const mock = mockAuthClient(); mock.authorize()
  await expect(createAuthService(mock.client).deleteAccount({ ...input, userId: 'forbidden' } as AccountDeletionInput)).resolves.toEqual({ deleted: true })
  expect(mock.functions.invoke).toHaveBeenCalledExactlyOnceWith('delete-account', { body: input, timeout: 60_000 })
  expect(mock.auth.signInWithPassword).not.toHaveBeenCalled()
  expect(mock.mfa.challenge).not.toHaveBeenCalled()
  expect(mock.mfa.verify).not.toHaveBeenCalled()
})

test.each(deletionErrorCodes.filter(code => !['uncertain', 'rate_limited'].includes(code)))('assainit le code HTTP %s', async code => {
  const mock = mockAuthClient()
  mock.functions.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: code, message: input.currentPassword }), { status: 400 })) })
  await expect(invokeAccountDeletion(mock.client, input)).rejects.toMatchObject({ code, message: code })
})

test('429 prime même avec un corps absent', async () => {
  const mock = mockAuthClient()
  mock.functions.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response('', { status: 429 })) })
  await expect(invokeAccountDeletion(mock.client, input)).rejects.toMatchObject({ code: 'rate_limited' })
})

test.each([null, {}, { deleted: false }, { deleted: 'true' }])('ne déduit aucun succès de %j', async data => {
  const mock = mockAuthClient()
  mock.functions.invoke.mockResolvedValue({ data, error: null })
  await expect(invokeAccountDeletion(mock.client, input)).rejects.toMatchObject({ code: 'uncertain' })
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
})

test.each([
  new FunctionsFetchError(new Error('private-password')),
  new FunctionsHttpError(new Response('bad json', { status: 503 })),
  new FunctionsHttpError(new Response('{"error":"unknown-private-value"}', { status: 503 })),
])('réseau et réponses illisibles restent incertains, sans données brutes', async error => {
  const mock = mockAuthClient()
  mock.functions.invoke.mockResolvedValue({ data: null, error })
  await expect(invokeAccountDeletion(mock.client, input)).rejects.toMatchObject({ code: 'uncertain', message: 'uncertain' })
})

test('timeout/rejet ne déclenche aucun retry', async () => {
  const mock = mockAuthClient()
  mock.functions.invoke.mockRejectedValue(new DOMException('secret', 'AbortError'))
  await expect(invokeAccountDeletion(mock.client, input)).rejects.toMatchObject({ code: 'uncertain' })
  expect(mock.functions.invoke).toHaveBeenCalledTimes(1)
})

test.each(['session', 'email', 'aal1', 'factor', 'identity'])('garde frontend %s avant invoke', async guard => {
  const mock = mockAuthClient(); mock.authorize()
  if (guard === 'session') mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  if (guard === 'email') mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, email_confirmed_at: undefined } }, error: null })
  if (guard === 'aal1') mock.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null })
  if (guard === 'factor') mock.auth.getUser.mockResolvedValue({ data: { user: { ...confirmedUser, factors: [totpFactor, { ...totpFactor, id: 'second' }] } }, error: null })
  if (guard === 'identity') mock.auth.getUser.mockResolvedValue({ data: { user: { ...session.user, id: 'other' } }, error: null })
  await expect(createAuthService(mock.client).deleteAccount(input)).rejects.toHaveProperty('code')
  expect(mock.functions.invoke).not.toHaveBeenCalled()
})
