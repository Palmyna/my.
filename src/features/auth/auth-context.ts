import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AuthStore } from './auth-store'

export const AuthContext = createContext<AuthStore | null>(null)

export function useAuth() {
  const store = useContext(AuthContext)
  if (!store) throw new Error('useAuth nécessite AuthProvider.')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...state, isAuthorized: state.status === 'authorized', actions: store.actions }
}
