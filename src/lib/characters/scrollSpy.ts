export const getScrollThreshold = () => window.innerHeight / 2

const isElementVisible = (element: HTMLElement) => element.getClientRects().length > 0

const isRectInViewport = (rect: DOMRect) => rect.bottom > 0 && rect.top < window.innerHeight

export const isElementAtThreshold = (element: HTMLElement, threshold: number) => {
  if (!isElementVisible(element)) return false
  const rect = element.getBoundingClientRect()
  return rect.top <= threshold && rect.bottom >= threshold
}

export const getActiveSectionId = (elements: HTMLElement[], threshold: number): string => {
  let thresholdActiveId = ''
  let firstVisibleInViewportId = ''
  let firstVisibleId = ''

  for (const element of elements) {
    if (!isElementVisible(element)) continue
    if (!firstVisibleId) {
      firstVisibleId = element.id
    }

    const rect = element.getBoundingClientRect()

    if (!firstVisibleInViewportId && isRectInViewport(rect)) {
      firstVisibleInViewportId = element.id
    }

    if (rect.top <= threshold) {
      thresholdActiveId = element.id
      continue
    }

    break
  }

  return thresholdActiveId || firstVisibleInViewportId || firstVisibleId
}

export const resolveElementsByIds = (ids: string[]): HTMLElement[] =>
  ids
    .map(id => document.getElementById(id))
    .filter((element): element is HTMLElement => Boolean(element))
