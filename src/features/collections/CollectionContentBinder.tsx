import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { CollectionContentItem } from '../../types/collection-content'
import type { BinderFormat } from '../../types/view-preferences'
import { CardImage } from './CardImage'
import type { BinderNavigation } from './useBinderNavigation'
import './collection-binder.css'

export function CollectionContentBinder({ navigation, format, onDetail }: {
  navigation: BinderNavigation; format: BinderFormat; onDetail: (item: CollectionContentItem, opener: HTMLElement) => void
}) {
  const [drag, setDrag] = useState(0)
  const touch = useRef<{ x: number; y: number; dx: number; dy: number; horizontal: boolean } | null>(null)
  const suppressClick = useRef(false)
  const stage = useRef<HTMLDivElement>(null)
  const { pages, opening, spread, move } = navigation
  const columns = Number(format.split('x')[0])
  const rows = Number(format.split('x')[1])
  useLayoutEffect(() => {
    const element = stage.current!
    const content = element.closest('.collection-content')
    const toolbar = content?.querySelector('.collection-content-toolbar')
    if (!spread || !toolbar) return
    const toolbarElement = toolbar
    function measure() {
      // Once scrolling passes the toolbar, keep its space reserved rather than
      // growing the book indefinitely. No assumed header height.
      const top = element.getBoundingClientRect().top - Math.min(0, toolbarElement.getBoundingClientRect().top)
      element.style.setProperty('--binder-top', `${Math.max(0, top)}px`)
    }
    let frame = 0
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    // Ancestor sizes catch reflow above the stage, including wrapped headings.
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) observer?.observe(ancestor)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      observer?.disconnect(); cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
    }
  }, [spread])
  return <div ref={stage} className="binder-stage" role="region" aria-label="Classeur" tabIndex={0}
    style={{ '--binder-columns': columns, '--binder-rows': rows } as CSSProperties}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }} onClickCapture={event => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
    }} onClick={event => {
      if (!(event.target as HTMLElement).closest('button')) event.currentTarget.focus({ preventScroll: true })
    }} onTouchStart={event => {
      suppressClick.current = false
      touch.current = null
      if (spread || event.touches.length !== 1 || (event.target as HTMLElement).closest('.binder-navigation')) return
      const point = event.touches[0]!
      touch.current = { x: point.clientX, y: point.clientY, dx: 0, dy: 0, horizontal: false }
    }} onTouchMove={event => {
      const start = touch.current
      if (!start) return
      if (event.touches.length !== 1) { touch.current = null; setDrag(0); return }
      const point = event.touches[0]!
      start.dx = point.clientX - start.x; start.dy = point.clientY - start.y
      if (Math.abs(start.dy) > 12 && !start.horizontal && Math.abs(start.dy) > Math.abs(start.dx)) {
        touch.current = null; setDrag(0); return
      }
      if (Math.abs(start.dx) > 12 && Math.abs(start.dx) > Math.abs(start.dy) * 1.3) start.horizontal = true
      if (start.horizontal) setDrag(Math.max(-28, Math.min(28, start.dx * .2)))
    }} onTouchEnd={() => {
      const start = touch.current
      if (start?.horizontal && Math.abs(start.dx) >= 50 && Math.abs(start.dx) > Math.abs(start.dy) * 1.3) {
        suppressClick.current = true; move(start.dx < 0 ? 1 : -1)
      }
      touch.current = null; setDrag(0)
    }} onTouchCancel={() => { touch.current = null; setDrag(0) }}>
    <button type="button" className="binder-navigation binder-previous" aria-label={spread ? 'Ouverture précédente' : 'Page précédente'}
      disabled={!navigation.canPrevious} onClick={() => move(-1)}><span aria-hidden="true">‹</span></button>
    <div key={opening.join('-')} className={`binder-book${spread ? ' is-spread' : ''}${drag ? ' is-swiping' : ''}`}
      style={{ '--binder-direction': navigation.direction, '--binder-drag': `${drag}px` } as CSSProperties}>
      {opening.map(page => <section key={page} className={`binder-page ${page % 2 === 0 ? 'is-left' : 'is-right'}`}
        aria-label={`Page ${page}`}>
        <ol className="binder-pockets">
          {pages[page - 1]!.map((item, slot) => <li key={slot}
            className={`binder-pocket ${slot % columns < Math.ceil(columns / 2) ? 'opens-right' : 'opens-left'}${!item ? ' is-empty' : ''}${item && !item.owned ? ' is-missing' : ''}${item && navigation.searching && !navigation.matchingIds.has(item.collectionItemId) ? ' is-search-muted' : ''}${item?.collectionItemId === navigation.haloId ? ' has-search-halo' : ''}`}
            data-item-id={item?.collectionItemId} aria-label={!item ? 'Pochette vide' : undefined}>
            {item && <button type="button" className="binder-card" aria-label={`Voir le détail de ${[item.cardNameFr || 'Nom indisponible', item.setAbbreviationFr || item.setAbbreviation, item.localId, item.variantLabel, item.owned ? 'Carte possédée' : 'Carte manquante'].filter(Boolean).join(' · ')}`}
              onClick={event => onDetail(item, event.currentTarget)}>
              <CardImage url={item.imageUrl} name={item.cardNameFr || 'Nom indisponible'} />
            </button>}
          </li>)}
        </ol>
        <span className="binder-page-number" aria-hidden="true">{page}</span>
      </section>)}
    </div>
    <button type="button" className="binder-navigation binder-next" aria-label={spread ? 'Ouverture suivante' : 'Page suivante'}
      disabled={!navigation.canNext} onClick={() => move(1)}><span aria-hidden="true">›</span></button>
    <span className="visually-hidden" role="status" aria-live="polite">{opening.length === 2 ? `Pages ${opening.join(' et ')}` : `Page ${opening[0]}`} sur {pages.length}</span>
  </div>
}
