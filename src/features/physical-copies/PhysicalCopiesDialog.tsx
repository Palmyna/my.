import { useEffect, useId, useRef } from 'react'
import { useAuth } from '../auth/auth-context'
import { PhysicalCopiesContent, type PhysicalCopiesContentHandle } from './PhysicalCopiesContent'
import { trapDialogFocus } from './trap-dialog-focus'
import './physical-copies.css'
import { variantIdString, type VariantIdInput } from '../../lib/variant-id'

type Props = { ownerId: string; variantId: VariantIdInput; variantName: string; readOnly?: boolean; onClose: () => void }
export function PhysicalCopiesDialog(props: Props) {
  const { user, isAuthorized } = useAuth()
  if (!isAuthorized || !user) return null
  return <CopiesDialog key={`${user.id}:${props.ownerId}:${props.variantId}`} {...props} variantId={variantIdString(props.variantId)} viewerId={user.id} />
}

function CopiesDialog({ ownerId, variantId, variantName, onClose, viewerId, readOnly }: Props & { viewerId: string; variantId: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<PhysicalCopiesContentHandle>(null)
  const id = useId()
  useEffect(() => {
    const node = dialog.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    node.querySelector<HTMLElement>('h2')?.focus()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="collection-dialog collection-action-dialog physical-copies-dialog"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-variant`}
    onCancel={event => { event.preventDefault(); content.current?.dismiss() }} onKeyDown={trapDialogFocus}>
    <p id={`${id}-variant`}>{variantName}</p>
    <PhysicalCopiesContent ref={content} titleId={`${id}-title`} ownerId={ownerId} variantId={variantId}
      viewerId={viewerId} readOnly={readOnly} onClose={onClose} />
  </dialog>
}
