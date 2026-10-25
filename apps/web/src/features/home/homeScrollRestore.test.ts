import { ACTIVE_CHARACTERS_LOADED_EVENT } from '@features/home/commission/loader/activeCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '@features/home/commission/loader/timelineViewLoader'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '@features/home/events'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-archived-visibility="hidden">
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
      .mockImplementation((callback) => {
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
    expect(requestActiveLoad).toHaveBeenCalledWith(window, {
      targetBatchCount: 4,
    })
    expect(restoreScrollPosition).not.toHaveBeenCalled()

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-active-sections-loaded', 'true')
    setScrollEnvironment({ scrollHeight: 7600 })
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 5000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('restores without waiting for archived content once active sections are loaded', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="true" data-archived-visibility="visible">
        <div data-archived-sections-container="true"><section id="section-archived"></section></div>
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

    const requestActiveLoad = vi.fn()
    const restoreScrollPosition = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
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

    expect(requestActiveLoad).not.toHaveBeenCalled()
    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 6000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('requests timeline batches incrementally when timeline content is too short for reload restore', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-timeline-loaded="false" data-timeline-batches-loaded-count="0"></div>
      <script type="application/json" data-home-timeline-batch-manifest="true">
        {
          "locale": "en",
          "initialSectionIds": ["timeline-year-2026"],
          "totalBatches": 6,
          "targetBatchById": {}
        }
      </script>
    `
    window.history.replaceState(null, '', '/?view=timeline')
    setScrollEnvironment({ scrollHeight: 2200 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '?view=timeline',
        x: 0,
        y: 5000,
      }),
    )

    const requestTimelineLoad = vi.fn()
    const restoreScrollPosition = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestTimelineLoad,
        restoreScrollPosition,
      },
    })

    expect(requestTimelineLoad).toHaveBeenCalledTimes(1)
    expect(requestTimelineLoad).toHaveBeenCalledWith(window, {
      targetBatchCount: 4,
    })
    expect(restoreScrollPosition).not.toHaveBeenCalled()

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
      ?.setAttribute('data-timeline-loaded', 'true')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
      ?.setAttribute('data-timeline-batches-loaded-count', '6')
    setScrollEnvironment({ scrollHeight: 7600 })
    window.dispatchEvent(new Event(TIMELINE_VIEW_LOADED_EVENT))

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 5000 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('restores timeline scroll without forcing deferred timeline batches when current height is enough', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-timeline-loaded="false" data-timeline-batches-loaded-count="0"></div>
      <script type="application/json" data-home-timeline-batch-manifest="true">
        {
          "locale": "en",
          "initialSectionIds": ["timeline-year-2026"],
          "totalBatches": 6,
          "targetBatchById": {}
        }
      </script>
    `
    window.history.replaceState(null, '', '/?view=timeline')
    setScrollEnvironment({ scrollHeight: 7600 })
    window.sessionStorage.setItem(
      HOME_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        pathname: '/',
        search: '?view=timeline',
        x: 0,
        y: 300,
      }),
    )

    const requestTimelineLoad = vi.fn()
    const restoreScrollPosition = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestTimelineLoad,
        restoreScrollPosition,
      },
    })

    expect(requestTimelineLoad).not.toHaveBeenCalled()
    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 0, y: 300 })
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('abandons pending restore once user navigation cancels it', () => {
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-archived-visibility="hidden">
        <div data-active-sections-container="true"></div>
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

    const requestActiveLoad = vi.fn()
    const restoreScrollPosition = vi.fn()

    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestActiveLoad,
        restoreScrollPosition,
      },
    })

    expect(requestActiveLoad).toHaveBeenCalledWith(window, {
      targetBatchCount: 4,
    })
    window.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))

    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-active-sections-loaded', 'true')
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))

    expect(restoreScrollPosition).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)

    cleanup()
  })

  it('temporarily switches history scroll restoration to manual during restore', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-archived-visibility="hidden">
        <div data-active-sections-container="true"></div>
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
    ;(window.history as History & { scrollRestoration?: ScrollRestoration }).scrollRestoration
      = 'auto'

    const requestActiveLoad = vi.fn()
    const cleanup = mountHomeScrollRestore({
      deps: {
        readNavigationType: () => 'reload',
        requestActiveLoad,
      },
    })

    expect(window.history.scrollRestoration).toBe('manual')
    window.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))
    expect(window.history.scrollRestoration).toBe('auto')

    cleanup()
  })
})
