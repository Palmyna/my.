import { useAuth } from './auth-context'
import { useAuthTask } from './auth-ui'

export function SignOutButton() {
  const { actions } = useAuth()
  const task = useAuthTask()
  return <div className="auth-footer"><button className="text-button" disabled={task.busy} onClick={() => task.run(() => actions.signOut())}>Se déconnecter</button>
    {task.error && <p role="alert">{task.error}</p>}</div>
}
