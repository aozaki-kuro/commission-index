export const restoreScrollPosition = (win: Window, position: { x: number; y: number }) => {
  const scrollingElement = win.document.scrollingElement
  if (scrollingElement) {
    scrollingElement.scrollLeft = position.x
    scrollingElement.scrollTop = position.y
    return
  }

  if (win.navigator.userAgent.includes('jsdom')) {
    return
  }

  if (typeof win.scrollTo !== 'function') return

  try {
    win.scrollTo(position.x, position.y)
  } catch {
    // jsdom does not implement scrolling; treat it as a no-op there.
  }
}
