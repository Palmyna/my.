import { useCallback, useLayoutEffect, useRef } from 'react'
import { NotificationError } from '../../services/notifications'
import { useAuth } from '../auth/auth-context'

// TanStack can yield before invoking mutationFn. Recheck the committed viewer
// at dispatch, including a surface unmounted after its button was clicked.
export function useNotificationMutationScope(viewerId: string) {
  const { user, isAuthorized } = useAuth()
  const authorized = useRef(false)
  useLayoutEffect(() => {
    authorized.current = isAuthorized && user?.id === viewerId
    return () => { authorized.current = false }
  }, [viewerId, user?.id, isAuthorized])
  return useCallback(() => {
    if (!authorized.current) throw new NotificationError('not_authorized')
  }, [])
}
