import {
  persistStaleCharactersVisibility,
  readSavedStaleCharactersVisibility,
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { mountStaleCharactersLoader } from '#features/home/commission/staleCharactersLoader'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setScrollEnvironment({
  innerHeight = 800,
  x = 0,
  y = 0,
}: {
  innerHeight?: number
  x?: number
  y?: number
}) {
  Object.defineProperty(window, 'scrollX', { configurable: true, value: x, writable: true })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y, writable: true })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
    writable: true,
  })
}

function renderFixture() {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-stale-loaded="false" data-stale-visibility="hidden">
      <div data-stale-sections-placeholder="true"></div>
      <button type="button" data-load-stale-characters="true">Load</button>
      <div data-stale-sections-container="true"></div>
      <template data-stale-sections-template="true">
        <section id="section-stale"></section>
      </template>
    </div>
  `
}

function renderDeferredFixture() {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-stale-loaded="false" data-stale-visibility="hidden">
      <div data-stale-sections-placeholder="true"></div>
      <button type="button" data-load-stale-characters="true">Load</button>
      <div data-stale-sections-container="true"></div>
      <template data-stale-sections-template="true">
        <section id="section-stale-initial"></section>
        <div data-stale-deferred-sections-container="true"></div>
        <div data-stale-deferred-sections-sentinel="true"></div>
        <template data-stale-deferred-sections-template="true">
          <section id="section-stale-deferred"></section>
        </template>
      </template>
    </div>
  `
}

describe('mountStaleCharactersLoader', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    setScrollEnvironment({})
  })

  it('restores scroll position after manual stale expansion', async () => {
    renderFixture()
    Object.defineProperty(window, 'scrollX', { value: 24, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 480, configurable: true })
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const restoreScrollPosition = vi.fn()

    const cleanup = mountStaleCharactersLoader({
      deps: { restoreScrollPosition },
    })
    document
      .querySelector<HTMLElement>('[data-load-stale-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushAsyncWork()

    expect(restoreScrollPosition).toHaveBeenCalledTimes(1)
    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 24, y: 480 })

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('injects stale sections and dispatches loaded + sidebar sync events', async () => {
    renderFixture()
    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const onStateChanged = vi.fn()
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

    const cleanup = mountStaleCharactersLoader()
    document
      .querySelector<HTMLElement>('[data-load-stale-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushAsyncWork()

    expect(document.getElementById('section-stale')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('true')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-stale-sections-placeholder="true"]')
        ?.classList
        .contains('hidden'),
    ).toBe(true)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)
    expect(onStateChanged).toHaveBeenCalledTimes(2)
    expect(
      (onStateChanged.mock.calls[0]?.[0] as CustomEvent<{ visibility: string, loaded: boolean }>)
        .detail,
    ).toEqual({
      visibility: 'visible',
      loaded: false,
    })
    expect(
      (onStateChanged.mock.calls[1]?.[0] as CustomEvent<{ visibility: string, loaded: boolean }>)
        .detail,
    ).toEqual({
      visibility: 'visible',
      loaded: true,
    })

    cleanup()
    window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })

  it('keeps deferred stale sections pending until a later full-load request', async () => {
    renderDeferredFixture()
    const onLoaded = vi.fn()
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockIntersectionObserver {
      constructor(_callback: IntersectionObserverCallback) {}

      observe = observe
      disconnect = disconnect
      unobserve() {}
      takeRecords() {
        return []
      }

      readonly root = null
      readonly rootMargin = ''
      readonly thresholds = []
    }

    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const cleanup = mountStaleCharactersLoader()
    document
      .querySelector<HTMLElement>('[data-load-stale-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushAsyncWork()

    expect(document.getElementById('section-stale-initial')).toBeTruthy()
    expect(document.getElementById('section-stale-deferred')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('false')
    expect(onLoaded).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))
    await flushAsyncWork()

    expect(document.getElementById('section-stale-deferred')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('true')
    expect(onLoaded).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()

    cleanup()
    vi.unstubAllGlobals()
    window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
  })

  it('restores stale visibility from the current tab session on mount', async () => {
    renderDeferredFixture()
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockIntersectionObserver {
      constructor(_callback: IntersectionObserverCallback) {}

      observe = observe
      disconnect = disconnect
      unobserve() {}
      takeRecords() {
        return []
      }

      readonly root = null
      readonly rootMargin = ''
      readonly thresholds = []
    }

    persistStaleCharactersVisibility(window, 'visible')
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const cleanup = mountStaleCharactersLoader()
    await flushAsyncWork()

    expect(readSavedStaleCharactersVisibility(window)).toBe('visible')
    expect(document.getElementById('section-stale-initial')).toBeTruthy()
    expect(document.getElementById('section-stale-deferred')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('false')
    expect(observe).toHaveBeenCalledTimes(1)

    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads stale sections from an initial hash target inside the template', async () => {
    renderFixture()
    document.querySelector('template[data-stale-sections-template="true"]')!.innerHTML = `
      <section id="section-stale"></section>
      <article id="section-stale-20240101"></article>
    `
    window.history.replaceState(null, '', '#section-stale-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()
    const restoreScrollPosition = vi.fn()

    const cleanup = mountStaleCharactersLoader({
      deps: { restoreScrollPosition, scrollToHashWithoutWrite },
    })
    await flushAsyncWork()

    expect(document.getElementById('section-stale')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('true')
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-stale-20240101')
    expect(restoreScrollPosition).not.toHaveBeenCalled()

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('collapses loaded stale sections when requested', async () => {
    renderFixture()
    const onCollapsed = vi.fn()
    const onStateChanged = vi.fn()
    window.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

    const cleanup = mountStaleCharactersLoader()
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))
    await flushAsyncWork()
    window.dispatchEvent(new Event(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT))

    expect(document.getElementById('section-stale')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('false')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('hidden')
    expect(
      document
        .querySelector<HTMLElement>('[data-stale-sections-placeholder="true"]')
        ?.classList
        .contains('hidden'),
    ).toBe(false)
    expect(onCollapsed).toHaveBeenCalledTimes(1)
    expect(onStateChanged).toHaveBeenCalledTimes(3)
    expect(
      (onStateChanged.mock.calls[2]?.[0] as CustomEvent<{ visibility: string, loaded: boolean }>)
        .detail,
    ).toEqual({
      visibility: 'hidden',
      loaded: false,
    })
    expect(readSavedStaleCharactersVisibility(window)).toBe('hidden')

    cleanup()
    window.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })
})
