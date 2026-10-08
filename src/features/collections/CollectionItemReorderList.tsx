import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DragDropContext, Draggable, Droppable, type OnDragEndResponder } from '@hello-pangea/dnd'
import type { ItemMove, ReorderAvailability } from '../../types/collection-items'
import './collection-item-reorder.css'
import { useCollectionCardColumns } from './useCollectionCardColumns'

export type ReorderListItem = { id: string; label: string }
type Props = {
  collectionId: string
  items: readonly ReorderListItem[]
  availability: ReorderAvailability
  onMove: (move: ItemMove) => Promise<boolean>
  renderItem: (item: ReorderListItem) => ReactNode
  feedback?: string | null
  recovery?: ReactNode
  layout?: 'list' | 'cards'
  hideHandles?: boolean
}

// The content list supplies authoritative rows; only this handle participates
// in DnD. Reuse useCollectionItemReorder for writes.
export function CollectionItemReorderList(props: Props) {
  return <ReorderList key={props.collectionId} {...props} />
}

function ReorderList({ collectionId, items, availability, onMove, renderItem, feedback, recovery, layout = 'list', hideHandles = false }: Props) {
  const id = useId()
  const capturedIds = useRef<string[]>([])
  const saving = useRef(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [visualOrder, setVisualOrder] = useState<{ sourceIds: string[]; ids: string[] } | null>(null)
  const [handleFeedback, setHandleFeedback] = useState<{ itemId: string; state: 'pending' | 'success' } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const handles = useRef(new Map<string, HTMLButtonElement>())
  const focusAfterDrop = useRef<string | null>(null)
  const cards = layout === 'cards'
  const { container, columns } = useCollectionCardColumns(cards, dragging || pending)
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
  // Ignore reference-only prop changes during saving. Any new authoritative order
  // or filtered membership replaces the temporary presentation immediately.
  const retainVisualOrder = pending && visualOrder && visualOrder.sourceIds.length === items.length
    && visualOrder.sourceIds.every((itemId, index) => itemId === items[index]?.id)
  if (visualOrder && !retainVisualOrder) setVisualOrder(null)
  const byId = retainVisualOrder ? new Map(items.map(item => [item.id, item])) : null
  const displayedItems = retainVisualOrder ? visualOrder.ids.map(itemId => byId!.get(itemId)!) : items
  useLayoutEffect(() => {
    // Moving across derived rows remounts the tile. Preserve keyboard focus even
    // while the default sensor's handle props are disabled during saving.
    if (focusAfterDrop.current) {
      handles.current.get(focusAfterDrop.current)?.focus({ preventScroll: true })
      focusAfterDrop.current = null
    }
  }, [displayedItems])
  const rows = cards ? Array.from({ length: Math.ceil(displayedItems.length / columns) }, (_, index) => ({
    id: `${collectionId}:row:${index}`, offset: index * columns, items: displayedItems.slice(index * columns, (index + 1) * columns),
  })) : [{ id: collectionId, offset: 0, items: displayedItems }]
  const position = (location: { droppableId: string; index: number }, source: { droppableId: string; index: number }) => {
    const row = rows.find(row => row.id === location.droppableId)
    const sourceRow = rows.find(row => row.id === source.droppableId)
    if (!row || !sourceRow) return null
    // Insertion into another row counts the source still in earlier rows.
    return Math.min(items.length - 1, row.offset + location.index
      - (sourceRow.offset < row.offset ? 1 : 0))
  }

  const onDragEnd: OnDragEndResponder = (result, { announce }) => {
    setDragging(false)
    const destination = result.destination
    if (result.reason === 'CANCEL' || !destination) { announce('Déplacement annulé.'); return }
    if (reason || saving.current || capturedIds.current.some((itemId, index) => itemId !== items[index]?.id)
      || capturedIds.current.length !== items.length) {
      announce('Impossible de déplacer cette carte. Actualisez la liste puis réessayez.')
      return
    }
    const sourceIndex = items.findIndex(item => item.id === result.draggableId)
    const destinationIndex = position(destination, result.source)
    if (destinationIndex === null) { announce('Déplacement annulé.'); return }
    if (destinationIndex === sourceIndex) { announce('Position inchangée.'); return }
    const anchor = items[destinationIndex]
    if (!anchor) { announce('Déplacement annulé.'); return }
    const nextIds = displayedItems.map(item => item.id)
    const [movedId] = nextIds.splice(sourceIndex, 1)
    if (movedId !== result.draggableId) { announce('Déplacement annulé.'); return }
    nextIds.splice(destinationIndex, 0, movedId)
    const move: ItemMove = { itemId: result.draggableId, destination: {
      placement: destinationIndex < sourceIndex ? 'before' : 'after', anchorId: anchor.id,
    } }
    saving.current = true
    if (handles.current.get(result.draggableId) === document.activeElement) focusAfterDrop.current = result.draggableId
    setPending(true)
    setVisualOrder({ sourceIds: items.map(item => item.id), ids: nextIds })
    setHandleFeedback({ itemId: result.draggableId, state: 'pending' })
    setFailure(null)
    setMessage('Enregistrement du déplacement…')
    announce(`${label(result.draggableId)} : déplacement vers la position ${destinationIndex + 1} sur ${items.length}. Enregistrement…`)
    // Presentation only: no cache writes or sort positions. onMove awaits the
    // existing authoritative rereads; success and failure both release this order.
    void onMove(move).then(success => {
      if (!active.current) return
      setVisualOrder(null)
      setHandleFeedback(success ? { itemId: result.draggableId, state: 'success' } : null)
      setFailure(success ? null : 'Déplacement non confirmé. Vérifiez l’ordre puis réessayez.')
      setMessage(success ? 'Carte déplacée.' : 'Déplacement non confirmé. Vérifiez l’ordre puis réessayez.')
    }).catch(() => {
      if (!active.current) return
      setVisualOrder(null)
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
    <DragDropContext onBeforeDragStart={() => { setDragging(true); capturedIds.current = items.map(item => item.id); setVisualOrder(null); setHandleFeedback(null); setMessage('') }}
      dragHandleUsageInstructions={`Appuyez sur Espace pour sélectionner la carte, utilisez les flèches ${cards ? 'gauche et droite, haut et bas entre les rangées' : 'haut et bas'} pour la déplacer, puis Espace pour valider ou Échap pour annuler.`}
      onDragStart={(start, { announce }) => announce(`${label(start.draggableId)} : carte sélectionnée, position ${items.findIndex(item => item.id === start.draggableId) + 1} sur ${items.length}.`)}
      onDragUpdate={(update, { announce }) => announce(update.destination
        ? `${label(update.draggableId)}, position ${(position(update.destination, update.source) ?? 0) + 1} sur ${items.length}.`
        : 'Hors de la liste. Relâchez pour annuler.')}
      onDragEnd={onDragEnd}>
      <div ref={container} className={cards ? `collection-card-grid${dragging ? ' is-reordering' : ''}` : undefined} style={cards ? { '--collection-card-columns': columns } as CSSProperties : undefined}>
      {rows.map(group => <Droppable key={group.id} droppableId={group.id} direction={cards ? 'horizontal' : 'vertical'} isDropDisabled={!!reason}>
        {provided => <ul ref={provided.innerRef} {...provided.droppableProps} className={cards ? 'collection-card-dnd-row' : 'collection-reorder-list'}>
          {group.items.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index}
            isDragDisabled={!!reason} disableInteractiveElementBlocking>
            {(row, snapshot) => <li ref={row.innerRef} {...row.draggableProps}
              className={`${cards ? 'collection-card-dnd-item' : 'collection-reorder-row'}${snapshot.isDragging ? ' is-dragging' : ''}`}>
              {(!cards || !hideHandles && (!reason || pending && handleFeedback?.itemId === item.id)) && <button {...row.dragHandleProps} type="button" tabIndex={0}
                ref={node => { if (node) handles.current.set(item.id, node); else handles.current.delete(item.id) }}
                className={`collection-reorder-handle${cards ? ' collection-card-drag-zone' : ''}`} aria-label={`Déplacer ${item.label}`} aria-disabled={!!reason}
                data-state={handleFeedback?.itemId === item.id ? handleFeedback.state : 'idle'}
                aria-describedby={[row.dragHandleProps?.['aria-describedby'], reason ? `${id}-reason` : null].filter(Boolean).join(' ') || undefined}>
                {handleFeedback?.itemId === item.id ? <span aria-hidden="true" className="collection-reorder-symbol">
                  {handleFeedback.state === 'success' ? '✓' : '…'}
                </span> : <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
                  {[6, 12, 18].map(y => <g key={y}><circle cx="7" cy={y} r="1.5" /><circle cx="13" cy={y} r="1.5" /></g>)}
                </svg>}
              </button>}
              <div className="collection-reorder-content">{renderItem(item)}</div>
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ul>}
      </Droppable>)}
      </div>
    </DragDropContext>
    <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">{message}</p>
  </div>
}
