import type { MouseEvent } from 'react'

/** Native modified clicks keep the current panel and open their own destination. */
export function isPlainLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}
