import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.generated'

export interface AccountDeletionInput {
  currentPassword: string
  totpCode: string
  confirmConsequences: true
  confirmDeletion: true
}

export const deletionErrorCodes = [
  'authentication_required', 'authorized_account_required', 'verified_totp_required',
  'password_required', 'totp_required', 'password_verification_failed', 'totp_challenge_failed',
  'totp_verification_failed', 'identity_mismatch', 'final_confirmation_required',
  'consequences_confirmation_required', 'session_revocation_failed', 'deletion_failed',
  'service_unavailable', 'rate_limited', 'uncertain',
] as const
export type DeletionErrorCode = typeof deletionErrorCodes[number]

// Never expose an SDK response, credential or raw server message to presentation/logging.
export class AccountDeletionError extends Error {
  constructor(readonly code: DeletionErrorCode) { super(code); this.name = 'AccountDeletionError' }
}

export async function invokeAccountDeletion(client: SupabaseClient<Database>, input: AccountDeletionInput) {
  try {
    const result = await client.functions.invoke<unknown>('delete-account', {
      body: { currentPassword: input.currentPassword, totpCode: input.totpCode,
        confirmConsequences: input.confirmConsequences, confirmDeletion: input.confirmDeletion },
      timeout: 60_000,
    })
    const data: unknown = result.data
    const error: unknown = result.error
    if (error instanceof FunctionsHttpError) {
      const response: unknown = error.context
      if (response instanceof Response) {
        if (response.status === 429) throw new AccountDeletionError('rate_limited')
        const body: unknown = await response.clone().json()
        if (body && typeof body === 'object' && 'error' in body
          && deletionErrorCodes.some(code => code === body.error)) {
          throw new AccountDeletionError(body.error as DeletionErrorCode)
        }
      }
    }
    if (error || !data || typeof data !== 'object' || !('deleted' in data) || data.deleted !== true) {
      throw new AccountDeletionError('uncertain')
    }
    return { deleted: true } as const
  } catch (error) {
    throw error instanceof AccountDeletionError ? error : new AccountDeletionError('uncertain')
  }
}
