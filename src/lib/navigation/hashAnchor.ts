const INACTIVE_VIEW_PANEL_SELECTOR
  = '[data-commission-view-panel][data-commission-view-active="false"]'
const ACTIVE_VIEW_PANEL_SELECTOR
  = '[data-commission-view-panel][data-commission-view-active="true"]'
const BACKSLASH_PATTERN = /\\/g
const DOUBLE_QUOTE_PATTERN = /"/g

function escapeAttributeSelectorValue(value: string) {
  return value.replace(BACKSLASH_PATTERN, '\\\\').replace(DOUBLE_QUOTE_PATTERN, '\\"')
}

const getExactIdSelector = (id: string) => `[id="${escapeAttributeSelectorValue(id)}"]`

export function getHashTarget(hash: string): HTMLElement | null {
  if (!hash || !hash.startsWith('#'))
    return null

  const id = decodeURIComponent(hash.slice(1))
  if (!id)
    return null

  const directMatch = document.getElementById(id)
  if (!directMatch)
    return null

  if (!directMatch.closest(INACTIVE_VIEW_PANEL_SELECTOR)) {
    return directMatch
  }

  const activePanel = document.querySelector<HTMLElement>(ACTIVE_VIEW_PANEL_SELECTOR)
  return activePanel?.querySelector<HTMLElement>(getExactIdSelector(id)) ?? directMatch
}

export function getHashFromHref(rawHref: string | null): string {
  if (!rawHref)
    return ''
  return rawHref.startsWith('#') ? rawHref : new URL(rawHref, window.location.href).hash
}

export function scrollToHashTargetFromHrefWithoutHash(rawHref: string | null): boolean {
  const hash = getHashFromHref(rawHref)
  if (!hash.startsWith('#'))
    return false

  const target = getHashTarget(hash)
  if (!target)
    return false

  target.scrollIntoView()
  return true
}

export function clearLocationHash() {
  const { pathname, search, hash } = window.location
  if (!hash)
    return

  history.replaceState(null, '', `${pathname}${search}`)
}

export function clearHashIfTargetIsStale() {
  const hash = window.location.hash
  if (!hash)
    return

  const element = getHashTarget(hash)
  if (!element) {
    clearLocationHash()
    return
  }

  const rect = element.getBoundingClientRect()
  const isOffscreen = rect.bottom <= 0 || rect.top >= window.innerHeight
  if (isOffscreen)
    clearLocationHash()
}
