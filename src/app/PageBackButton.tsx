import { useNavigate } from 'react-router'

/** Use the browser router's persisted index, never history.length (external entries). */
export function PageBackButton() {
  const navigate = useNavigate()
  function back() {
    // React Router 8.3.1 initializes idx to 0, increments PUSH and preserves it
    // on REPLACE/reload. A positive index has a preceding entry in this SPA.
    const state: unknown = window.history.state
    const index = state !== null && typeof state === 'object' && 'idx' in state ? state.idx : undefined
    if (typeof index === 'number' && Number.isInteger(index) && index > 0) void navigate(-1)
    else void navigate('/dashboard', { replace: true })
  }
  return <button type="button" className="page-back" onClick={back}>← Retour</button>
}
