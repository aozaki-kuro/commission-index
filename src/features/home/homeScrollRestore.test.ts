// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_CHARACTERS_LOADED_EVENT } from '#features/home/commission/activeCharactersEvent'
import { STALE_CHARACTERS_LOADED_EVENT } from '#features/home/commission/staleCharactersEvent'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '#features/home/homeScrollRestoreAbort'
import { mountHomeScrollRestore } from './homeScrollRestore'

const HOME_SCROLL_STATE_STORAGE_KEY = 'home:scroll-state'

const setScrollEnvironment = ({
  scrollHeight,
  x = 0,
  y = 0,
}: {
  scrollHeight: number
  x?: number
  y?: number
}) => {
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

describe('mountHomeScrollRestore', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    setScrollEnvironment({ scrollHeight: 2000 })
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

  it('requests deferred active sections and restores the saved scroll on reload', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-stale-loaded="false" data-stale-visibility="hidden">
        <div data-active-sections-container="true"></div>
        <template data-active-sections-template="true"><section id="section-beta"></section></template>
      </div>
    `
    setScrollEnvironment({ scrollHeight: 2600 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '',
        x: 0,
        y: 5000,
      }),
    )

    const requestActiveLoad = vi.fn()
    const restoreScrollPosition = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestActiveLoad,
        restoreScrollPosition,
      },
    })

    expect(requestActiveLoad).toHaveBeenCalledTimes(1)
    expect(restoreScrollPosition).not.toHaveBeenCalled()

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-active-sections-loaded', 'true')
    setScrollEnvironment({ scrollHeight: 7600 })
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 5000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('requests stale sections when the saved scroll exceeds the active content height', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="true" data-stale-loaded="false" data-stale-visibility="hidden">
        <template data-stale-sections-template="true"><section id="section-stale"></section></template>
      </div>
    `
    setScrollEnvironment({ scrollHeight: 3600 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '',
        x: 0,
        y: 6000,
      }),
    )

    const requestStaleLoad = vi.fn()
    const restoreScrollPosition = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestStaleLoad,
        restoreScrollPosition,
      },
    })

    expect(requestStaleLoad).toHaveBeenCalledWith(window, {
      preserveScroll: false,
      strategy: 'next',
    })
    expect(restoreScrollPosition).not.toHaveBeenCalled()

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-loaded', 'true')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-visibility', 'visible')
    setScrollEnvironment({ scrollHeight: 8600 })
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 6000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('abandons pending restore once user navigation cancels it', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="true" data-stale-loaded="false" data-stale-visibility="hidden">
        <template data-stale-sections-template="true"><section id="section-stale"></section></template>
      </div>
    `
    setScrollEnvironment({ scrollHeight: 3600 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '',
        x: 0,
        y: 6000,
      }),
    )

    const requestStaleLoad = vi.fn()
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestStaleLoad,
        restoreScrollPosition,
      },
    })

    expect(requestStaleLoad).toHaveBeenCalledWith(window, {
      preserveScroll: false,
      strategy: 'next',
    })
    window.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-loaded', 'true')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-visibility', 'visible')
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))

    expect(restoreScrollPosition).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()

    cleanup()
  })

  it('temporarily switches history scroll restoration to manual during restore', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="true" data-stale-loaded="false" data-stale-visibility="hidden">
        <template data-stale-sections-template="true"><section id="section-stale"></section></template>
      </div>
    `
    setScrollEnvironment({ scrollHeight: 3600 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '',
        x: 0,
        y: 6000,
      }),
    )
    ;(window.history as History & { scrollRestoration?: ScrollRestoration }).scrollRestoration =
      'auto'

    const requestStaleLoad = vi.fn()
    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestStaleLoad,
      },
    })

    expect(window.history.scrollRestoration).toBe('manual')
    window.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))
    expect(window.history.scrollRestoration).toBe('auto')

    cleanup()
  })
})
