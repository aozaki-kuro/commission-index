import {
  ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_LOADED_EVENT,
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
  persistArchivedCharactersVisibility,
  readSavedArchivedCharactersVisibility,
} from '@features/home/commission/loader/archivedCharactersEvent'
import { mountArchivedCharactersLoader } from '@features/home/commission/loader/archivedCharactersLoader'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearHomeCharacterBatchRequestCacheForTests } from '../batch/homeCharacterBatchClient'
import { clearHomeCharacterBatchManifestCacheForTests } from '../batch/homeCharacterBatchManifest'
import {
  createCharacterBatchPayload,
  createFreshCharacterManifest,
  createUrlDispatchFetchHandler,
} from './loaderTestFixtures'

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
    <div data-commission-view-panel="character" data-archived-loaded="false" data-archived-visibility="hidden">
      <div data-archived-sections-placeholder="true"></div>
      <button type="button" data-load-archived-characters="true">Load</button>
      <div data-archived-sections-container="true"></div>
      <template data-archived-sections-template="true">
        <section id="section-archived"></section>
      </template>
    </div>
  `
}

function renderDeferredFixture() {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-archived-loaded="false" data-archived-visibility="hidden">
      <div data-archived-sections-placeholder="true"></div>
      <button type="button" data-load-archived-characters="true">Load</button>
      <div data-archived-sections-container="true"></div>
      <template data-archived-sections-template="true">
        <section id="section-archived-initial"></section>
        <div data-archived-deferred-sections-container="true"></div>
        <div data-archived-deferred-sections-sentinel="true"></div>
        <template data-archived-deferred-sections-template="true">
          <section id="section-archived-deferred"></section>
        </template>
      </template>
    </div>
  `
}

describe('mountArchivedCharactersLoader', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    setScrollEnvironment({})
  })

  it('restores scroll position after manual archived expansion', async () => {
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

    const cleanup = mountArchivedCharactersLoader({
      deps: { restoreScrollPosition },
    })
    document
      .querySelector<HTMLElement>('[data-load-archived-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(restoreScrollPosition).toHaveBeenCalledTimes(1))

    expect(restoreScrollPosition).toHaveBeenCalledWith(window, { x: 24, y: 480 })

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('injects archived sections and dispatches loaded + sidebar sync events', async () => {
    renderFixture()
    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const onStateChanged = vi.fn()
    window.addEventListener(ARCHIVED_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

    const cleanup = mountArchivedCharactersLoader()
    document
      .querySelector<HTMLElement>('[data-load-archived-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(onStateChanged).toHaveBeenCalledTimes(2))

    expect(document.getElementById('section-archived')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('true')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-archived-sections-placeholder="true"]')
        ?.classList
        .contains('hidden'),
    ).toBe(true)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)

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
    window.removeEventListener(ARCHIVED_CHARACTERS_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })

  it('keeps deferred archived sections pending until a later full-load request', async () => {
    renderDeferredFixture()
    const onLoaded = vi.fn()
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockIntersectionObserver {
      observe = observe
      disconnect = disconnect
    }

    window.addEventListener(ARCHIVED_CHARACTERS_LOADED_EVENT, onLoaded)
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const cleanup = mountArchivedCharactersLoader()
    document
      .querySelector<HTMLElement>('[data-load-archived-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1))

    expect(document.getElementById('section-archived-initial')).toBeTruthy()
    expect(document.getElementById('section-archived-deferred')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('false')
    expect(onLoaded).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT))
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')?.dataset.archivedLoaded).toBe('true'))

    expect(document.getElementById('section-archived-deferred')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('true')
    expect(onLoaded).toHaveBeenCalledTimes(2)

    expect(disconnect).toHaveBeenCalled()

    cleanup()
    vi.unstubAllGlobals()
    window.removeEventListener(ARCHIVED_CHARACTERS_LOADED_EVENT, onLoaded)
  })

  it('restores archived visibility from the current tab session on mount', async () => {
    renderDeferredFixture()
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockIntersectionObserver {
      observe = observe
      disconnect = disconnect
    }

    persistArchivedCharactersVisibility(window, 'visible')
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const cleanup = mountArchivedCharactersLoader()
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1))

    expect(readSavedArchivedCharactersVisibility(window)).toBe('visible')
    expect(document.getElementById('section-archived-initial')).toBeTruthy()
    expect(document.getElementById('section-archived-deferred')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('false')

    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads archived sections from an initial hash target inside the template', async () => {
    renderFixture()
    document.querySelector('template[data-archived-sections-template="true"]')!.innerHTML = `
      <section id="section-archived"></section>
      <article id="section-archived-20240101"></article>
    `
    window.history.replaceState(null, '', '#section-archived-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()
    const restoreScrollPosition = vi.fn()

    const cleanup = mountArchivedCharactersLoader({
      deps: { restoreScrollPosition, scrollToHashWithoutWrite },
    })
    await vi.waitFor(() => expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-archived-20240101'))

    expect(document.getElementById('section-archived')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('true')

    expect(restoreScrollPosition).not.toHaveBeenCalled()

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  describe('fresh manifest fallback', () => {
    it('fetches fresh manifest when inline manifest misses hash target', async () => {
      clearHomeCharacterBatchManifestCacheForTests()
      document.body.innerHTML = `
        <div data-commission-view-panel="character" data-archived-loaded="false" data-archived-visibility="hidden" data-archived-batches-loaded-count="0">
          <div data-archived-sections-placeholder="true"></div>
          <button type="button" data-load-archived-characters="true">Load</button>
          <div data-archived-divider="true" class="hidden"></div>
          <div data-archived-sections-container="true"></div>
        </div>
        <script type="application/json" data-home-character-batch-manifest="true">
          {
            "locale": "en",
            "v": "stale-v",
            "active": {
              "initialSectionIds": [],
              "totalBatches": 0,
              "targetBatchById": {},
              "batchVersions": []
            },
            "archived": {
              "initialSectionIds": [],
              "totalBatches": 1,
              "targetBatchById": {
                "section-old": 0
              },
              "batchVersions": ["bv0"]
            }
          }
        </script>
      `
      clearHomeCharacterBatchManifestCacheForTests()

      window.history.replaceState(null, '', '#section-new-archived-20240101')

      const freshManifest = createFreshCharacterManifest({
        status: 'archived',
        targetBatchById: {
          'section-old': 0,
          'section-new-archived': 1,
          'section-new-archived-20240101': 1,
        },
        batchVersions: ['bv0', 'bv1-fresh'],
      })

      const batchPayload = createCharacterBatchPayload({
        status: 'archived',
        batchIndex: 1,
        sectionId: 'section-new-archived',
        displayName: 'New Archived',
        entryId: 'section-new-archived-20240101',
      })

      vi.stubGlobal('fetch', vi.fn(createUrlDispatchFetchHandler([
        ['/search/home-character-manifest/', freshManifest],
        ['/search/home-character-batches/', batchPayload],
      ])))

      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0)
          return 1
        })

      const scrollSpy = vi.fn()
      const cleanup = mountArchivedCharactersLoader({
        deps: { scrollToHashWithoutWrite: scrollSpy },
      })

      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('#section-new-archived-20240101'))

      expect(document.getElementById('section-new-archived-20240101')).toBeTruthy()

      cleanup()
      requestAnimationFrameSpy.mockRestore()
      clearHomeCharacterBatchManifestCacheForTests()
      clearHomeCharacterBatchRequestCacheForTests()
      vi.unstubAllGlobals()
      document.body.innerHTML = ''
      window.history.replaceState(null, '', '/')
    })
  })

  it('collapses loaded archived sections when requested', async () => {
    renderFixture()
    const onCollapsed = vi.fn()
    const onStateChanged = vi.fn()
    window.addEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

    const cleanup = mountArchivedCharactersLoader()
    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT))
    await vi.waitFor(() => expect(onStateChanged).toHaveBeenCalledTimes(2))
    window.dispatchEvent(new Event(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT))

    expect(document.getElementById('section-archived')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-loaded'),
    ).toBe('false')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-archived-visibility'),
    ).toBe('hidden')
    expect(
      document
        .querySelector<HTMLElement>('[data-archived-sections-placeholder="true"]')
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
    expect(readSavedArchivedCharactersVisibility(window)).toBe('hidden')

    cleanup()
    window.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })
})
