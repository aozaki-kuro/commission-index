'use client'

export const getHashTarget = (hash: string): HTMLElement | null => {
  if (!hash || !hash.startsWith('#')) return null

  const id = decodeURIComponent(hash.slice(1))
  if (!id) return null

  return document.getElementById(id)
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
  const isOffscreen = rect.bottom < 0 || rect.top > window.innerHeight
  if (isOffscreen) clearLocationHash()
}
