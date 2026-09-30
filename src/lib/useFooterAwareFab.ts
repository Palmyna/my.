import { useLayoutEffect, type RefObject } from 'react'

export function useFooterAwareFab(trigger: RefObject<HTMLButtonElement | null>) {
  useLayoutEffect(() => {
    const button = trigger.current
    const shell = button?.closest('.authenticated-shell')
    const footer = shell?.querySelector(':scope > .site-footer')
    if (!button || !shell || !footer) return

    function position() {
      const overlap = Math.max(0, window.innerHeight - footer!.getBoundingClientRect().top)
      button!.style.setProperty('--fab-footer-overlap', `${overlap}px`)
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(shell)
    observer.observe(footer)
    window.addEventListener('scroll', position, { passive: true })
    window.addEventListener('resize', position)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', position)
      window.removeEventListener('resize', position)
    }
  }, [trigger])
}
