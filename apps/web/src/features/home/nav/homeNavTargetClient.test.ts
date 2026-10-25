// @vitest-environment jsdom
import { mountArchivedCharactersToggle } from '@features/home/commission/archivedCharactersToggle'
import { ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, requestArchivedCharactersVisibility } from '@features/home/commission/loader/archivedCharactersEvent'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '@features/home/events'
import { describe, expect, it, vi } from 'vitest'
import {
  loadDeferredHomeNavTarget,
  prefetchHomeNavTarget,
  revealArchivedHomeNavTarget,
} from './homeNavTargetClient'

describe('homeNavTargetClient', () => {
  it('prefetches active targets and requests timeline batches for timeline links', () => {
    const prefetchActiveTarget = vi.fn()
    const requestTimelineLoad = vi.fn()

    prefetchHomeNavTarget({
      doc: document,
      href: '#active-alpha',
      isTimelineTarget: false,
      prefetchActiveTarget,
      requestTimelineLoad,
      status: 'active',
      win: window,
    })
    prefetchHomeNavTarget({
      doc: document,
      href: '#archived-beta',
      isTimelineTarget: false,
      prefetchActiveTarget,
      requestTimelineLoad,
      status: 'archived',
      win: window,
    })
    prefetchHomeNavTarget({
      doc: document,
      href: '#timeline-2026',
      isTimelineTarget: true,
      prefetchActiveTarget,
      requestTimelineLoad,
      status: 'active',
      win: window,
    })

    expect(prefetchActiveTarget).toHaveBeenCalledTimes(1)
    expect(prefetchActiveTarget).toHaveBeenCalledWith(document, '#active-alpha')
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

  it('waits until the deferred target is actually ready before completing', () => {
    const onLoaded = vi.fn()
    let ready = false

    loadDeferredHomeNavTarget({
      isReady: () => ready,
      loadedEvent: 'home:test-loaded',
      onLoaded,
      requestLoad: () => {
        window.dispatchEvent(new Event('home:test-loaded'))
        ready = true
        window.dispatchEvent(new Event('home:test-loaded'))
      },
      win: window,
    })

    expect(onLoaded).toHaveBeenCalledTimes(1)
  })

  it('aborts pending restore and waits for archived visibility before continuing', () => {
    const onRestoreAbort = vi.fn()
    const onVisible = vi.fn()
    const requestArchivedVisibility = vi.fn((win: Window) => {
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible' },
        }),
      )
    })
    window.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility,
      win: window,
    })

    expect(onRestoreAbort).toHaveBeenCalledTimes(1)
    expect(requestArchivedVisibility).toHaveBeenCalledWith(window, 'visible')
    expect(onVisible).toHaveBeenCalledTimes(1)

    window.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)
  })

  it('ignores unrelated archived state changes until visibility is actually visible', () => {
    const onVisible = vi.fn()
    const requestArchivedVisibility = vi.fn((win: Window) => {
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'hidden' },
        }),
      )
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible' },
        }),
      )
    })

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility,
      win: window,
    })

    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('calls onVisible when the show request is answered synchronously', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-archived-visibility="hidden">
        <div data-archived-sections-placeholder="true"></div>
        <div data-archived-divider="true" class="hidden"></div>
        <div data-archived-sections-container="true" class="hidden">
          <section id="section-archived" data-character-section="true" data-character-status="archived"></section>
        </div>
      </div>
    `
    const disposeToggle = mountArchivedCharactersToggle()
    const onVisible = vi.fn()

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility: requestArchivedCharactersVisibility,
      win: window,
    })

    expect(onVisible).toHaveBeenCalledTimes(1)
    disposeToggle()
    document.body.innerHTML = ''
  })
})
