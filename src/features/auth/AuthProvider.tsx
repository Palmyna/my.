import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { createAuthService } from '../../services/auth'
import { getSupabaseClient } from '../../services/supabase'
import { AuthContext } from './auth-context'
import { createAuthStore } from './auth-store'
import { browserRecoveryContext, readEmailCallback } from './auth-callback'

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const [store] = useState(() => createAuthStore(() => {
    const client = getSupabaseClient()
    return client ? createAuthService(client) : null
  }, () => queryClient.clear(), readEmailCallback, browserRecoveryContext))

  useEffect(() => store.start(), [store])

  return <AuthContext value={store}>{children}</AuthContext>
}
