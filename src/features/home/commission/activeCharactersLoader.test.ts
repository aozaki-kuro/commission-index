// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
} from '#features/home/commission/activeCharactersEvent'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { mountActiveCharactersLoader } from './activeCharactersLoader'

const renderFixture = () => {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-active-sections-loaded="false">
      <section id="section-alpha"></section>
      <div data-active-sections-container="true"></div>
      <div data-active-sections-sentinel="true"></div>
      <template data-active-sections-template="true">
        <section id="section-beta"></section>
      </template>
    </div>
  `
}

describe('mountActiveCharactersLoader', () => {
  it('loads deferred active sections on global request and dispatches sync events', () => {
    renderFixture()

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountActiveCharactersLoader()
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT))

    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-active-sections-loaded'),
    ).toBe('true')
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)

    cleanup()
    window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  it('loads deferred active sections for an initial hash target and scrolls after mount', () => {
    renderFixture()
    document.querySelector('template[data-active-sections-template="true"]')!.innerHTML = `
      <section id="section-beta"></section>
      <template data-section-entries-template="true">
        <article id="section-beta-20240101"></article>
      </template>
    `
    window.history.replaceState(null, '', '#section-beta-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()

    const cleanup = mountActiveCharactersLoader({
      deps: { scrollToHashWithoutWrite },
    })

    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-beta-20240101')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('loads deferred active sections when the sentinel enters the preload range', () => {
    renderFixture()

    const observe = vi.fn()
    const disconnect = vi.fn()
    class MockIntersectionObserver {
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe = observe.mockImplementation(() => {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      })

      disconnect = disconnect

      unobserve() {}

      takeRecords() {
        return []
      }

      readonly root = null

      readonly rootMargin = ''

      readonly thresholds = []
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const cleanup = mountActiveCharactersLoader()

    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(observe).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()

    cleanup()
    vi.unstubAllGlobals()
  })
})
