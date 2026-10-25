// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountHomeScrollRestore } from './homeScrollRestore'

const HOME_SCROLL_STATE_STORAGE_KEY = 'home:scroll-state'

function setScrollEnvironment({
  scrollHeight,
  x = 0,
  y = 0,
}: {
  scrollHeight: number
  x?: number
  y?: number
}) {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x, writable: true })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y, writable: true })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true })
  Object.defineProperty(document, 'scrollingElement', {
    configurable: true,
    value: document.documentElement,
  })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
    writable: true,
  })
}

function saveScrollState({ search, y }: { search: string, y: number }) {
  window.sessionStorage.setItem(
    HOME_SCROLL_STATE_STORAGE_KEY,
    JSON.stringify({ pathname: '/', search, x: 0, y }),
  )
}

describe('mountHomeScrollRestore', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    setScrollEnvironment({ scrollHeight: 2000 })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-home-scroll-restoring')
  })

  it('persists the current scroll position on pagehide', () => {
    setScrollEnvironment({ scrollHeight: 2400, x: 24, y: 480 })

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'navigate',
      },
    })

    window.dispatchEvent(new Event('pagehide'))

    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBe(
      JSON.stringify({
        pathname: '/',
        search: '',
        x: 24,
        y: 480,
      }),
    )

    cleanup()
  })

  it('restores the saved scroll on reload even when it is beyond the current scroll height', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    setScrollEnvironment({ scrollHeight: 2600 })
    saveScrollState({ search: '', y: 5000 })
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: { readNavigationType: () => 'reload', restoreScrollPosition },
    })

    expect(restoreScrollPosition).toHaveBeenCalledTimes(1)
    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 5000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
  })

  it('restores the saved timeline scroll on reload', () => {
    window.history.replaceState(null, '', '/?view=timeline')
    saveScrollState({ search: '?view=timeline', y: 3200 })
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: { readNavigationType: () => 'reload', restoreScrollPosition },
    })

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 3200 })

    cleanup()
  })

  it('skips the restore and drops the saved state when the URL has a hash', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    window.history.replaceState(null, '', '/#section-alpha')
    saveScrollState({ search: '', y: 1200 })
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: { readNavigationType: () => 'reload', restoreScrollPosition },
    })

    expect(restoreScrollPosition).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
  })

  it('reveals the shell without restoring on a non-reload navigation', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    saveScrollState({ search: '', y: 1200 })
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: { readNavigationType: () => 'navigate', restoreScrollPosition },
    })

    expect(restoreScrollPosition).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
  })
})
