import type { MouseEvent } from 'react'

export function shouldHandleInternalNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
}

export function getWindowScrollTop() {
  return Math.max(window.scrollY, 0)
}
