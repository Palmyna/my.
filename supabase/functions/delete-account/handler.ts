import type { SupabaseClient } from '@supabase/supabase-js'

type ClientFactory = (token?: string) => SupabaseClient
export interface DeletionDependencies {
  userClient: ClientFactory
  adminClient: () => SupabaseClient
}

const headers = {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
class Refusal extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
const refuse = (status: number, code: string): never => { throw new Refusal(status, code) }

async function readInput(req: Request) {
  if (!req.headers.get('content-type')?.split(';')[0]?.trim().includes('application/json')) refuse(415, 'json_required')
  const reader = req.body?.getReader()
  if (!reader) return refuse(400, 'invalid_request')
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    length += chunk.value.byteLength
    if (length > 8192) { await reader.cancel(); refuse(413, 'request_too_large') }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let input: unknown
  try { input = JSON.parse(new TextDecoder().decode(bytes)) } catch { refuse(400, 'invalid_request') }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return refuse(400, 'invalid_request')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(key => !['currentPassword', 'totpCode', 'confirmConsequences', 'confirmDeletion'].includes(key))) refuse(400, 'invalid_request')
  if (body.confirmConsequences !== true) refuse(400, 'consequences_confirmation_required')
  if (typeof body.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 1024) return refuse(400, 'password_required')
  if (typeof body.totpCode !== 'string' || !/^\d{6}$/.test(body.totpCode)) return refuse(400, 'totp_required')
  return { currentPassword: body.currentPassword, totpCode: body.totpCode, confirmDeletion: body.confirmDeletion === true }
}

// One final request; every attempt performs real password + new challenge/verify.
// No proof/session/challenge is accepted from the browser or returned to it.
export function createDeleteAccountHandler(deps: DeletionDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers })
    let reauth: SupabaseClient | undefined
    try {
      const authorization = req.headers.get('authorization') ?? ''
      const token = /^Bearer (\S+)$/i.exec(authorization)?.[1]
      if (!token) return refuse(401, 'authentication_required')
      const caller = deps.userClient(token)
      const [identity, verified] = await Promise.all([caller.auth.getUser(token), caller.auth.getClaims(token)])
      const user = identity.data?.user
      const claims = verified.data?.claims
      if (identity.error || verified.error || !user || !claims || claims.sub !== user.id) refuse(401, 'authentication_required')
      if (!user?.email || !user.email_confirmed_at || claims?.aal !== 'aal2' || !claims.session_id) return refuse(403, 'authorized_account_required')
      const factors = (user.factors ?? []).filter(f => f.factor_type === 'totp' && f.status === 'verified')
      if (factors.length !== 1) return refuse(403, 'verified_totp_required')
      const factor = factors[0]!
      const profile = await caller.from('profiles').select('id').eq('id', user.id).single()
      if (profile.error || !profile.data) return refuse(403, 'authorized_account_required')
      const input = await readInput(req)

      // Separate, per-request anonymous client. Never sign in with the admin client
      // or mutate the browser's original session. Email comes exclusively from Auth.
      reauth = deps.userClient()
      const password = await reauth.auth.signInWithPassword({ email: user.email, password: input.currentPassword })
      if (password.error) return refuse(password.error.status === 429 ? 429 : 403, 'password_verification_failed')
      if (!password.data.session || password.data.user?.id !== user.id) return refuse(403, 'identity_mismatch')
      const freshClaims = await reauth.auth.getClaims(password.data.session.access_token)
      if (freshClaims.error || freshClaims.data?.claims.sub !== user.id
        || freshClaims.data.claims.aal !== 'aal1' || !freshClaims.data.claims.session_id
        || freshClaims.data.claims.session_id === claims.session_id
        || !password.data.user.factors?.some(f => f.id === factor.id && f.factor_type === 'totp' && f.status === 'verified')) return refuse(403, 'identity_mismatch')

      const challenge = await reauth.auth.mfa.challenge({ factorId: factor.id })
      if (challenge.error) return refuse(challenge.error.status === 429 ? 429 : 403, 'totp_challenge_failed')
      const totp = await reauth.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: input.totpCode })
      if (totp.error) return refuse(totp.error.status === 429 ? 429 : 403, 'totp_verification_failed')
      const finalClaims = await reauth.auth.getClaims(totp.data.access_token)
      if (finalClaims.error || finalClaims.data?.claims.sub !== user.id || totp.data.user.id !== user.id
        || finalClaims.data.claims.aal !== 'aal2'
        || finalClaims.data.claims.session_id !== freshClaims.data.claims.session_id) return refuse(403, 'identity_mismatch')
      // The explicit final intention is checked only after both fresh verifications.
      if (!input.confirmDeletion) return refuse(400, 'final_confirmation_required')

      const admin = deps.adminClient()
      const revoked = await admin.auth.admin.signOut(totp.data.access_token, 'global')
      if (revoked.error) return refuse(503, 'session_revocation_failed')
      const deleted = await admin.auth.admin.deleteUser(user.id, false)
      if (deleted.error) return refuse(503, 'deletion_failed')
      return Response.json({ deleted: true }, { headers })
    } catch (error) {
      // Never echo Auth internals, SQL errors, credentials, tokens, or request bodies.
      const failure = error instanceof Refusal ? error : new Refusal(503, 'service_unavailable')
      return Response.json({ error: failure.code }, { status: failure.status, headers })
    } finally {
      // On refusal, discard only this server-created session; initial login survives.
      // After global revocation/deletion the session is already gone.
      if (reauth) await reauth.auth.signOut({ scope: 'local' }).catch(() => undefined)
    }
  }
}
