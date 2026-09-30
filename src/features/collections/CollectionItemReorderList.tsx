import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { DragDropContext, Draggable, Droppable, type OnDragEndResponder } from '@hello-pangea/dnd'
import type { ItemMove, ReorderAvailability } from '../../types/collection-items'
import './collection-item-reorder.css'

export type ReorderListItem = { id: string; label: string }
type Props = {
  collectionId: string
  items: readonly ReorderListItem[]
  availability: ReorderAvailability
  onMove: (move: ItemMove) => Promise<boolean>
  renderItem: (item: ReorderListItem) => ReactNode
  feedback?: string | null
  recovery?: ReactNode
}

// The content list supplies authoritative rows; only this handle participates
// in DnD. Reuse useCollectionItemReorder for writes.
export function CollectionItemReorderList(props: Props) {
  return <ReorderList key={props.collectionId} {...props} />
}

function ReorderList({ collectionId, items, availability, onMove, renderItem, feedback, recovery }: Props) {
  const id = useId()
  const capturedIds = useRef<string[]>([])
  const saving = useRef(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [handleFeedback, setHandleFeedback] = useState<{ itemId: string; state: 'pending' | 'success' } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const active = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    if (handleFeedback?.state !== 'success') return
    const timer = window.setTimeout(() => setHandleFeedback(null), 2000)
    return () => window.clearTimeout(timer)
  }, [handleFeedback])
  const reason = !availability.enabled ? availability.reason : pending ? 'Déplacement en cours…' : null
  const label = (itemId: string) => items.find(item => item.id === itemId)?.label ?? 'Carte'

  const onDragEnd: OnDragEndResponder = (result, { announce }) => {
    const destination = result.destination
    if (result.reason === 'CANCEL' || !destination) { announce('Déplacement annulé.'); return }
    if (reason || saving.current || capturedIds.current.some((itemId, index) => itemId !== items[index]?.id)
      || capturedIds.current.length !== items.length) {
      announce('Impossible de déplacer cette carte. Actualisez la liste puis réessayez.')
      return
    }
    if (destination.index === result.source.index) { announce('Position inchangée.'); return }
    const anchor = items[destination.index]
    if (!anchor) { announce('Déplacement annulé.'); return }
    const move: ItemMove = { itemId: result.draggableId, destination: {
      placement: destination.index < result.source.index ? 'before' : 'after', anchorId: anchor.id,
    } }
    saving.current = true
    setPending(true)
    setHandleFeedback({ itemId: result.draggableId, state: 'pending' })
    setFailure(null)
    setMessage('Enregistrement du déplacement…')
    announce(`${label(result.draggableId)} : déplacement vers la position ${destination.index + 1} sur ${items.length}. Enregistrement…`)
    // No second source of order or optimistic positions: keep the last authoritative
    // list until the write and refetch finish. A failed write is also refreshed.
    void onMove(move).then(success => {
      if (!active.current) return
      setHandleFeedback(success ? { itemId: result.draggableId, state: 'success' } : null)
      setFailure(success ? null : 'Déplacement non confirmé. Vérifiez l’ordre puis réessayez.')
      setMessage(success ? 'Carte déplacée.' : 'Déplacement non confirmé. Vérifiez l’ordre puis réessayez.')
    }).catch(() => {
      if (!active.current) return
      setHandleFeedback(null)
      setFailure('Déplacement non confirmé. Actualisez la liste avant de réessayer.')
      setMessage('Déplacement non confirmé. Actualisez la liste avant de réessayer.')
    }).finally(() => { saving.current = false; if (active.current) setPending(false) })
  }

  return <div className="collection-item-reorder">
    {(feedback || failure) && <div className="collection-reorder-error">
      <p role="alert">{feedback || failure}</p>{recovery}
    </div>}
    {reason && <p id={`${id}-reason`} className="visually-hidden">{reason}</p>}
    <DragDropContext onBeforeDragStart={() => { capturedIds.current = items.map(item => item.id); setHandleFeedback(null); setMessage('') }}
      dragHandleUsageInstructions="Appuyez sur Espace pour sélectionner la carte, utilisez les flèches haut et bas pour la déplacer, puis Espace pour valider ou Échap pour annuler."
      onDragStart={(start, { announce }) => announce(`${label(start.draggableId)} : carte sélectionnée, position ${start.source.index + 1} sur ${items.length}.`)}
      onDragUpdate={(update, { announce }) => announce(update.destination
        ? `${label(update.draggableId)}, position ${update.destination.index + 1} sur ${items.length}.`
        : 'Hors de la liste. Relâchez pour annuler.')}
      onDragEnd={onDragEnd}>
      <Droppable droppableId={collectionId} isDropDisabled={!!reason}>
        {provided => <ul ref={provided.innerRef} {...provided.droppableProps} className="collection-reorder-list">
          {items.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index}
            isDragDisabled={!!reason} disableInteractiveElementBlocking>
            {(row, snapshot) => <li ref={row.innerRef} {...row.draggableProps}
              className={`collection-reorder-row${snapshot.isDragging ? ' is-dragging' : ''}`}>
              <button {...row.dragHandleProps} type="button" tabIndex={0}
                className="collection-reorder-handle" aria-label={`Déplacer ${item.label}`} aria-disabled={!!reason}
                data-state={handleFeedback?.itemId === item.id ? handleFeedback.state : 'idle'}
                aria-describedby={[row.dragHandleProps?.['aria-describedby'], reason ? `${id}-reason` : null].filter(Boolean).join(' ') || undefined}>
                {handleFeedback?.itemId === item.id ? <span aria-hidden="true" className="collection-reorder-symbol">
                  {handleFeedback.state === 'success' ? '✓' : '…'}
                </span> : <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
                  {[6, 12, 18].map(y => <g key={y}><circle cx="7" cy={y} r="1.5" /><circle cx="13" cy={y} r="1.5" /></g>)}
                </svg>}
              </button>
              <div className="collection-reorder-content">{renderItem(item)}</div>
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ul>}
      </Droppable>
    </DragDropContext>
    <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">{message}</p>
  </div>
}
