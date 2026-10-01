import {
  ACTIVE_CHARACTERS_LOAD_FAILED_EVENT,
  ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
  ACTIVE_CHARACTERS_LOADED_EVENT,
} from '@features/home/commission/loader/activeCharactersEvent'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { clearHomeCharacterBatchRequestCacheForTests } from '../batch/homeCharacterBatchClient'
import { clearHomeCharacterBatchManifestCacheForTests } from '../batch/homeCharacterBatchManifest'
import { mountActiveCharactersLoader } from './activeCharactersLoader'

async function flushAsyncWork() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function renderFixture() {
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
  it('loads deferred active sections on global request and dispatches sync events', async () => {
    renderFixture()

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountActiveCharactersLoader()
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT))
    await flushAsyncWork()

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

  it('dispatches a failure signal without marking active sections loaded', async () => {
    clearHomeCharacterBatchRequestCacheForTests()
    clearHomeCharacterBatchManifestCacheForTests()
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-active-batches-loaded-count="0">
        <section id="section-alpha"></section>
        <div data-active-sections-container="true"></div>
        <div data-active-sections-sentinel="true"></div>
      </div>
      <script type="application/json" data-home-character-batch-manifest="true">
        {"locale":"en","v":"failure-test","active":{"initialSectionIds":["section-alpha"],"totalBatches":1,"targetBatchById":{},"batchVersions":["bv0"]},"archived":{"initialSectionIds":[],"totalBatches":0,"targetBatchById":{},"batchVersions":[]}}
      </script>
    `
    clearHomeCharacterBatchManifestCacheForTests()
    const sentinel = document.querySelector<HTMLElement>('[data-active-sections-sentinel="true"]')!
    sentinel.getBoundingClientRect = () => ({ top: 99999 } as DOMRect)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          batchIndex: 0,
          status: 'active',
          sections: [{
            displayName: 'Beta',
            status: 'active',
            sectionId: 'section-beta',
            titleId: 'title-beta',
            sectionHash: '',
            totalCommissions: 0,
            toBeAnnouncedText: 'TBA',
            entries: [],
          }],
        }),
      } as Response)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onFailed = vi.fn()
    const onLoaded = vi.fn()
    window.addEventListener(ACTIVE_CHARACTERS_LOAD_FAILED_EVENT, onFailed)
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onLoaded)

    const cleanup = mountActiveCharactersLoader()
    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT))
    await flushAsyncWork()

    expect(onFailed).toHaveBeenCalledTimes(1)
    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')
    expect(panel?.dataset.activeSectionsLoaded).toBe('false')

    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT))
    await flushAsyncWork()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(panel?.dataset.activeSectionsLoaded).toBe('true')

    cleanup()
    window.removeEventListener(ACTIVE_CHARACTERS_LOAD_FAILED_EVENT, onFailed)
    window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onLoaded)
    vi.restoreAllMocks()
    clearHomeCharacterBatchManifestCacheForTests()
    clearHomeCharacterBatchRequestCacheForTests()
  })

  it('loads deferred active sections for an initial hash target and scrolls after mount', async () => {
    renderFixture()
    document.querySelector('template[data-active-sections-template="true"]')!.innerHTML = `
      <section id="section-beta"></section>
      <article id="section-beta-20240101"></article>
    `
    window.history.replaceState(null, '', '#section-beta-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

    const cleanup = mountActiveCharactersLoader({
      deps: { scrollToHashWithoutWrite },
    })
    await flushAsyncWork()

    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-beta-20240101')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('still scrolls to deferred target even when hash is cleared before queueLoad resolves', async () => {
    renderFixture()
    document.querySelector('template[data-active-sections-template="true"]')!.innerHTML = `
      <section id="section-beta"></section>
    `
    window.history.replaceState(null, '', '#section-beta')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

    const cleanup = mountActiveCharactersLoader({
      deps: { scrollToHashWithoutWrite },
    })

    // Simulate clearHashIfTargetOffscreen clearing the URL hash before the batch loads
    window.history.replaceState(null, '', '/')

    await flushAsyncWork()

    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-beta')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
  })

  it('scrolls with RAF when element is already in the initial HTML', async () => {
    renderFixture()
    // section-alpha is already in the static HTML (not in the template)
    window.history.replaceState(null, '', '#section-alpha')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

    const cleanup = mountActiveCharactersLoader({
      deps: { scrollToHashWithoutWrite },
    })
    await flushAsyncWork()

    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-alpha')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  describe('stale manifest count mismatch', () => {
    it('fetches and mounts new batches when loaded=true but fresh manifest has larger count', async () => {
      clearHomeCharacterBatchManifestCacheForTests()
      document.body.innerHTML = `
        <div data-commission-view-panel="character" data-active-sections-loaded="true" data-active-batches-loaded-count="1">
          <section id="section-alpha"></section>
          <div data-active-sections-container="true">
            <section id="section-beta"></section>
          </div>
          <div data-active-sections-sentinel="true"></div>
        </div>
        <script type="application/json" data-home-character-batch-manifest="true">
          {
            "locale": "en",
            "v": "stale-v",
            "active": {
              "initialSectionIds": ["section-alpha"],
              "totalBatches": 1,
              "targetBatchById": {
                "section-beta": 0
              },
              "batchVersions": ["bv0"]
            },
            "archived": {
              "initialSectionIds": [],
              "totalBatches": 0,
              "targetBatchById": {},
              "batchVersions": []
            }
          }
        </script>
      `
      window.history.replaceState(null, '', '#section-gamma-20240101')

      const freshManifest = {
        locale: 'en',
        v: 'fresh-v',
        active: {
          initialSectionIds: ['section-alpha'],
          totalBatches: 2,
          targetBatchById: {
            'section-beta': 0,
            'section-gamma': 1,
            'section-gamma-20240101': 1,
          },
          batchVersions: ['bv0', 'bv1-fresh'],
        },
        archived: {
          initialSectionIds: [],
          totalBatches: 0,
          targetBatchById: {},
          batchVersions: [],
        },
      }

      const batchPayload = {
        batchIndex: 1,
        status: 'active',
        sections: [{
          sectionId: 'section-gamma',
          titleId: 'title-section-gamma',
          sectionHash: '#section-gamma',
          displayName: 'Gamma',
          totalCommissions: 1,
          toBeAnnouncedText: 'TBA',
          entries: [{
            id: 'section-gamma-20240101',
            sectionId: 'section-gamma',
            searchKey: 'section-gamma::20240101_gamma',
            searchText: 'gamma 2024',
            searchSuggest: 'Character\tGamma',
            altText: '(c) 2024 Gamma & Crystallize',
            image: null,
            sourceImageNotFoundText: 'Source image not found',
            timeLabel: '2024/01/01',
            primaryText: 'Gamma',
            secondaryText: null,
            links: [],
            interest: null,
          }],
        }],
      }

      const fetchSpy = vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/search/home-character-manifest/'))
          return new Response(JSON.stringify(freshManifest))
        if (url.startsWith('/search/home-character-batches/'))
          return new Response(JSON.stringify(batchPayload))
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchSpy)
      const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

      const cleanup = mountActiveCharactersLoader({
        deps: { scrollToHashWithoutWrite },
      })
      await flushAsyncWork()

      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/search/home-character-manifest/'))
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/search/home-character-batches/'))
      expect(document.getElementById('section-gamma-20240101')).toBeTruthy()

      const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      expect(panel?.dataset.activeBatchesLoadedCount).toBe('2')
      expect(panel?.dataset.activeSectionsLoaded).toBe('true')

      clearHomeCharacterBatchManifestCacheForTests()
      clearHomeCharacterBatchRequestCacheForTests()
      vi.unstubAllGlobals()
      cleanup()
    })

    it('does not fetch when loaded=true and counts match', async () => {
      clearHomeCharacterBatchManifestCacheForTests()
      document.body.innerHTML = `
        <div data-commission-view-panel="character" data-active-sections-loaded="true" data-active-batches-loaded-count="2">
          <section id="section-alpha"></section>
          <div data-active-sections-container="true">
            <section id="section-beta"></section>
            <section id="section-gamma"></section>
          </div>
          <div data-active-sections-sentinel="true"></div>
        </div>
        <script type="application/json" data-home-character-batch-manifest="true">
          {
            "locale": "en",
            "v": "current-v",
            "active": {
              "initialSectionIds": ["section-alpha"],
              "totalBatches": 2,
              "targetBatchById": {
                "section-beta": 0,
                "section-gamma": 1
              },
              "batchVersions": ["bv0", "bv1"]
            },
            "archived": {
              "initialSectionIds": [],
              "totalBatches": 0,
              "targetBatchById": {},
              "batchVersions": []
            }
          }
        </script>
      `
      clearHomeCharacterBatchManifestCacheForTests()

      window.history.replaceState(null, '', '#section-alpha')

      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)
      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0)
          return 1
        })

      const cleanup = mountActiveCharactersLoader({
        deps: { scrollToHashWithoutWrite },
      })
      await flushAsyncWork()

      expect(fetchSpy).not.toHaveBeenCalled()

      clearHomeCharacterBatchManifestCacheForTests()
      vi.unstubAllGlobals()
      requestAnimationFrameSpy.mockRestore()
      cleanup()
    })
  })

  describe('fresh manifest fallback', () => {
    it('fetches fresh manifest when inline manifest misses hash target', async () => {
      clearHomeCharacterBatchManifestCacheForTests()
      document.body.innerHTML = `
        <div data-commission-view-panel="character" data-active-sections-loaded="false" data-active-batches-loaded-count="0">
          <section id="section-alpha"></section>
          <div data-active-sections-container="true"></div>
          <div data-active-sections-sentinel="true"></div>
        </div>
        <script type="application/json" data-home-character-batch-manifest="true">
          {
            "locale": "en",
            "v": "stale-v",
            "active": {
              "initialSectionIds": ["section-alpha"],
              "totalBatches": 1,
              "targetBatchById": {
                "section-beta": 0
              },
              "batchVersions": ["bv0"]
            },
            "archived": {
              "initialSectionIds": [],
              "totalBatches": 0,
              "targetBatchById": {},
              "batchVersions": []
            }
          }
        </script>
      `
      clearHomeCharacterBatchManifestCacheForTests()

      window.history.replaceState(null, '', '#section-gamma-20240101')

      const freshManifest = {
        locale: 'en',
        v: 'fresh-v',
        active: {
          initialSectionIds: ['section-alpha'],
          totalBatches: 2,
          targetBatchById: {
            'section-beta': 0,
            'section-gamma': 1,
            'section-gamma-20240101': 1,
          },
          batchVersions: ['bv0', 'bv1-fresh'],
        },
        archived: {
          initialSectionIds: [],
          totalBatches: 0,
          targetBatchById: {},
          batchVersions: [],
        },
      }

      const batchPayload = {
        batchIndex: 1,
        status: 'active',
        sections: [{
          sectionId: 'section-gamma',
          titleId: 'title-section-gamma',
          sectionHash: '#section-gamma',
          displayName: 'Gamma',
          totalCommissions: 1,
          toBeAnnouncedText: 'TBA',
          entries: [{
            id: 'section-gamma-20240101',
            sectionId: 'section-gamma',
            searchKey: 'section-gamma::20240101_gamma',
            searchText: 'gamma 2024',
            searchSuggest: 'Character\tGamma',
            altText: '(c) 2024 Gamma & Crystallize',
            image: null,
            sourceImageNotFoundText: 'Source image not found',
            timeLabel: '2024/01/01',
            primaryText: 'Gamma',
            secondaryText: null,
            links: [],
            interest: null,
          }],
        }],
      }

      vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/search/home-character-manifest/'))
          return new Response(JSON.stringify(freshManifest))
        if (url.startsWith('/search/home-character-batches/'))
          return new Response(JSON.stringify(batchPayload))
        return new Response(null, { status: 404 })
      }))

      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0)
          return 1
        })

      const scrollSpy = vi.fn()
      const cleanup = mountActiveCharactersLoader({
        deps: { scrollToHashWithoutWrite: scrollSpy },
      })

      await flushAsyncWork()

      expect(document.getElementById('section-gamma-20240101')).toBeTruthy()
      expect(scrollSpy).toHaveBeenCalledWith('#section-gamma-20240101')

      requestAnimationFrameSpy.mockRestore()
      clearHomeCharacterBatchManifestCacheForTests()
      clearHomeCharacterBatchRequestCacheForTests()
      vi.unstubAllGlobals()
      cleanup()
    })
  })

  it('loads deferred active sections when the sentinel enters the preload range', async () => {
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
    await flushAsyncWork()

    expect(document.getElementById('section-beta')).toBeTruthy()
    expect(observe).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()

    cleanup()
    vi.unstubAllGlobals()
  })
})
