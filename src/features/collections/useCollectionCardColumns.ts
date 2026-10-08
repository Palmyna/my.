import { useEffect, useRef, useState } from 'react'

// CSS owns responsive sizing. Rows only project the order for list-based DnD.
export function useCollectionCardColumns(enabled: boolean, locked: boolean) {
  const container = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(2)
  useEffect(() => {
    const element = container.current
    if (!enabled || !element || locked) return
    const measure = () => {
      const tracks = getComputedStyle(element).gridTemplateColumns.split(' ').filter(track => /^\d+(\.\d+)?px$/.test(track))
      if (tracks.length > 0) setColumns(tracks.length)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, locked])
  return { container, columns }
}
