export const getHashTarget = (hash: string): HTMLElement | null => {
  if (!hash || !hash.startsWith('#')) return null

  const id = decodeURIComponent(hash.slice(1))
  if (!id) return null

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter(
    element => element.id === id,
  )
  if (candidates.length === 0) return null

  // Same entry can exist in both "character" and "timeline" panels.
  // Prefer targets inside the active view panel to avoid scrolling hidden content.
  return (
    candidates.find(
      element =>
        !element.closest('[data-commission-view-panel][data-commission-view-active="false"]'),
    ) ?? candidates[0]
  )
}

export const getHashFromHref = (rawHref: string | null): string => {
  if (!rawHref) return ''
  return rawHref.startsWith('#') ? rawHref : new URL(rawHref, window.location.href).hash
}

export const scrollToHashTargetFromHrefWithoutHash = (rawHref: string | null): boolean => {
  const hash = getHashFromHref(rawHref)
  if (!hash.startsWith('#')) return false

  const target = getHashTarget(hash)
  if (!target) return false

  target.scrollIntoView()
  return true
}

export const clearLocationHash = () => {
  const { pathname, search, hash } = window.location
  if (!hash) return

  history.replaceState(null, '', `${pathname}${search}`)
}

export const clearHashIfTargetIsStale = () => {
  const hash = window.location.hash
  if (!hash) return

  const element = getHashTarget(hash)
  if (!element) {
    clearLocationHash()
    return
  }

  const rect = element.getBoundingClientRect()
  const isOffscreen = rect.bottom <= 0 || rect.top >= window.innerHeight
  if (isOffscreen) clearLocationHash()
}
