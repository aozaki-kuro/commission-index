// @vitest-environment jsdom
import { STALE_CHARACTERS_STATE_CHANGE_EVENT } from '#features/home/commission/staleCharactersEvent'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '#features/home/events'
import { describe, expect, it, vi } from 'vitest'
import {
  loadDeferredHomeNavTarget,
  prefetchHomeNavTarget,
  revealStaleHomeNavTarget,
} from './homeNavTargetClient'

describe('homeNavTargetClient', () => {
  it('prefetches active and stale targets, and requests timeline batches for timeline links', () => {
    const prefetchActiveTarget = vi.fn()
    const prefetchStaleTarget = vi.fn()
    const requestTimelineLoad = vi.fn()

    prefetchHomeNavTarget({
      doc: document,
      href: '#active-alpha',
      isTimelineTarget: false,
      prefetchActiveTarget,
      prefetchStaleTarget,
      requestTimelineLoad,
      status: 'active',
      win: window,
    })
    prefetchHomeNavTarget({
      doc: document,
      href: '#stale-beta',
      isTimelineTarget: false,
      prefetchActiveTarget,
      prefetchStaleTarget,
      requestTimelineLoad,
      status: 'stale',
      win: window,
    })
    prefetchHomeNavTarget({
      doc: document,
      href: '#timeline-2026',
      isTimelineTarget: true,
      prefetchActiveTarget,
      prefetchStaleTarget,
      requestTimelineLoad,
      status: 'active',
      win: window,
    })

    expect(prefetchActiveTarget).toHaveBeenCalledWith(document, '#active-alpha')
    expect(prefetchStaleTarget).toHaveBeenCalledWith(document, '#stale-beta')
    expect(requestTimelineLoad).toHaveBeenCalledWith(window, {
      strategy: 'target',
      targetId: '#timeline-2026',
    })
  })

  it('aborts pending restore and waits for deferred load completion', () => {
    const onRestoreAbort = vi.fn()
    const onLoaded = vi.fn()
    const requestLoad = vi.fn(() => {
      window.dispatchEvent(new Event('home:test-loaded'))
    })
    window.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)

    loadDeferredHomeNavTarget({
      loadedEvent: 'home:test-loaded',
      onLoaded,
      requestLoad,
      win: window,
    })

    expect(onRestoreAbort).toHaveBeenCalledTimes(1)
    expect(requestLoad).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledTimes(1)

    window.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)
  })

  it('aborts pending restore and waits for stale visibility before continuing', () => {
    const onRestoreAbort = vi.fn()
    const onVisible = vi.fn()
    const requestStaleVisibility = vi.fn((win: Window) => {
      win.dispatchEvent(
        new CustomEvent(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible', loaded: false },
        }),
      )
    })
    window.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)

    revealStaleHomeNavTarget({
      onVisible,
      requestStaleVisibility,
      win: window,
    })

    expect(onRestoreAbort).toHaveBeenCalledTimes(1)
    expect(requestStaleVisibility).toHaveBeenCalledWith(window, 'visible')
    expect(onVisible).toHaveBeenCalledTimes(1)

    window.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)
  })
})
