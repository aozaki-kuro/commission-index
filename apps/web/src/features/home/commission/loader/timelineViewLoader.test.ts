import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '@features/home/events'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearHomeTimelineBatchRequestCacheForTests } from '../batch/homeTimelineBatchClient'
import { clearHomeTimelineBatchManifestCacheForTests } from '../batch/homeTimelineBatchManifest'
import { requestTimelineViewLoad } from './timelineViewEvent'
import { mountTimelineViewLoader, TIMELINE_VIEW_LOADED_EVENT } from './timelineViewLoader'

function renderFixture() {
  clearHomeTimelineBatchManifestCacheForTests()
  document.body.innerHTML = `
    <div data-commission-view-panel="timeline" data-timeline-loaded="false" data-timeline-batches-loaded-count="0" class="hidden">
      <div data-timeline-sections-container="true">
        <section id="timeline-year-2026"></section>
      </div>
      <div data-timeline-sections-sentinel="true"></div>
      <template data-timeline-batch-index="0">
        <section id="timeline-year-2025"></section>
      </template>
      <template data-timeline-batch-index="1">
        <section id="timeline-year-2024"></section>
      </template>
    </div>
    <script type="application/json" data-home-timeline-batch-manifest="true">
      {
        "locale": "en",
        "initialSectionIds": ["timeline-year-2026"],
        "totalBatches": 2,
        "targetBatchById": {
          "timeline-year-2025": 0,
          "timeline-year-2024": 1
        }
      }
    </script>
  `
  clearHomeTimelineBatchManifestCacheForTests()
}

function createTimelineBatchPayload(batchIndex: number, year: string) {
  return {
    batchIndex,
    sections: [
      {
        yearKey: year,
        sectionId: `timeline-year-${year}`,
        titleId: `title-timeline-year-${year}`,
        sectionHash: `#timeline-year-${year}`,
        totalCommissions: 1,
        entries: [
          {
            id: `character-alpha-${year}0101`,
            sectionId: `timeline-year-${year}`,
            searchKey: `character-alpha::${year}0101_alpha`,
            searchText: `alpha ${year}`,
            searchSuggest: 'Character\tAlpha',
            altText: `© ${year} Alpha & Crystallize`,
            image: null,
            sourceImageNotFoundText: 'Source image not found',
            timeLabel: `${year}/01/01`,
            primaryText: 'Alpha',
            secondaryText: null,
            links: [
              {
                label: 'Skeb',
                url: 'https://example.com',
              },
            ],
            interest: null,
          },
        ],
      },
    ],
  }
}

async function flushTimelineQueue() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  clearHomeTimelineBatchRequestCacheForTests()
  clearHomeTimelineBatchManifestCacheForTests(document)
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('mountTimelineViewLoader', () => {
  it('loads deferred timeline batches on initial timeline mode and scrolls to hash target', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2024')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/search/home-timeline-batches/en/0.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(0, '2025'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      if (url.endsWith('/search/home-timeline-batches/en/1.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(1, '2024'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2024')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-loaded'),
    ).toBe('true')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-batches-loaded-count'),
    ).toBe('2')
    expect(onLoaded).toHaveBeenCalled()
    expect(onSidebarSync).toHaveBeenCalled()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#timeline-year-2024')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  it('loads target timeline batch when the view mode switches later', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/search/home-timeline-batches/en/0.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(0, '2025'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      if (url.endsWith('/search/home-timeline-batches/en/1.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(1, '2024'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const scrollToHashWithoutWrite = vi.fn()

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })

    expect(document.getElementById('timeline-year-2025')).toBeNull()

    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2025')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-batches-loaded-count'),
    ).toBe('2')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    cleanup()
  })

  it('loads all deferred timeline batches when explicitly requested', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/search/home-timeline-batches/en/0.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(0, '2025'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      if (url.endsWith('/search/home-timeline-batches/en/1.json')) {
        return new Response(`${JSON.stringify(createTimelineBatchPayload(1, '2024'))}\n`, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const cleanup = mountTimelineViewLoader()

    requestTimelineViewLoad(window, { strategy: 'all' })
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(document.getElementById('timeline-year-2024')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-loaded'),
    ).toBe('true')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    cleanup()
  })

  it('pipelines timeline batch requests before the first batch resolves', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/')

    let resolveFirstBatchResponse!: (value: Response) => void
    const firstBatchResponse = new Promise<Response>((resolve) => {
      resolveFirstBatchResponse = (value: Response) => {
        resolve(value)
      }
    })

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/search/home-timeline-batches/en/0.json')) {
        return firstBatchResponse
      }
      if (url.endsWith('/search/home-timeline-batches/en/1.json')) {
        return Promise.resolve(
          new Response(`${JSON.stringify(createTimelineBatchPayload(1, '2024'))}\n`, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }),
        )
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const cleanup = mountTimelineViewLoader()
    requestTimelineViewLoad(window, { strategy: 'all' })
    await Promise.resolve()
    await Promise.resolve()

    const requestedUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input.toString(),
    )
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/search/home-timeline-batches/en/0.json'),
        expect.stringContaining('/search/home-timeline-batches/en/1.json'),
      ]),
    )

    resolveFirstBatchResponse(
      new Response(`${JSON.stringify(createTimelineBatchPayload(0, '2025'))}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
    )
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(document.getElementById('timeline-year-2024')).toBeTruthy()

    cleanup()
  })

  it('does not remount or re-scroll when timeline batches were already loaded', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2024')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
    const container = document.querySelector<HTMLElement>(
      '[data-timeline-sections-container="true"]',
    )
    panel?.setAttribute('data-timeline-loaded', 'true')
    panel?.setAttribute('data-timeline-batches-loaded-count', '2')
    container?.insertAdjacentHTML(
      'beforeend',
      '<section id="timeline-year-2025"></section><section id="timeline-year-2024"></section>',
    )

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()

    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })
    await Promise.resolve()

    expect(document.querySelectorAll('#timeline-year-2025')).toHaveLength(1)
    expect(document.querySelectorAll('#timeline-year-2024')).toHaveLength(1)
    expect(onLoaded).not.toHaveBeenCalled()
    expect(onSidebarSync).not.toHaveBeenCalled()
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  describe('fresh manifest fallback', () => {
    it('fetches fresh manifest when inline manifest misses hash target on mode sync', async () => {
      renderFixture()
      window.history.replaceState(null, '', '/?view=timeline#timeline-year-2023')

      const freshManifest = {
        locale: 'en',
        v: 'fresh-v',
        batchVersions: ['bv0', 'bv1', 'bv2'],
        initialSectionIds: ['timeline-year-2026'],
        totalBatches: 3,
        targetBatchById: {
          'timeline-year-2025': 0,
          'timeline-year-2024': 1,
          'timeline-year-2023': 2,
        },
      }
      const batchPayload = createTimelineBatchPayload(2, '2023')

      vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/search/home-timeline-manifest/'))
          return new Response(JSON.stringify(freshManifest))
        if (url.startsWith('/search/home-timeline-batches/'))
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
      const cleanup = mountTimelineViewLoader({
        deps: { scrollToHashWithoutWrite: scrollSpy },
      })

      window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
      await flushTimelineQueue()

      const container = document.querySelector('[data-timeline-sections-container="true"]')
      expect(container?.querySelector('#character-alpha-20230101')).toBeTruthy()
      expect(scrollSpy).toHaveBeenCalledWith('#timeline-year-2023')

      requestAnimationFrameSpy.mockRestore()
      cleanup()
    })

    it('fetches and mounts new batches when loaded=true but fresh manifest has larger count', async () => {
      renderFixture()
      window.history.replaceState(null, '', '/?view=timeline#timeline-year-2023')
      const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')!
      panel.dataset.timelineLoaded = 'true'
      panel.dataset.timelineBatchesLoadedCount = '2'

      const freshManifest = {
        locale: 'en',
        v: 'fresh-v',
        batchVersions: ['bv0', 'bv1', 'bv2'],
        initialSectionIds: ['timeline-year-2026'],
        totalBatches: 3,
        targetBatchById: {
          'timeline-year-2025': 0,
          'timeline-year-2024': 1,
          'timeline-year-2023': 2,
        },
      }
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/search/home-timeline-manifest/'))
          return new Response(JSON.stringify(freshManifest))
        if (url.startsWith('/search/home-timeline-batches/'))
          return new Response(JSON.stringify(createTimelineBatchPayload(2, '2023')))
        return new Response(null, { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)
      const scrollToHashWithoutWrite = vi.fn().mockReturnValue(true)

      const cleanup = mountTimelineViewLoader({
        deps: { scrollToHashWithoutWrite },
      })
      window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
      await flushTimelineQueue()

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/search/home-timeline-batches/'))
      expect(document.getElementById('character-alpha-20230101')).toBeTruthy()
      expect(panel.dataset.timelineBatchesLoadedCount).toBe('3')
      expect(panel.dataset.timelineLoaded).toBe('true')

      cleanup()
    })

    it('does not fetch when loaded=true and counts match', async () => {
      renderFixture()
      window.history.replaceState(null, '', '/?view=timeline')
      const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')!
      panel.dataset.timelineLoaded = 'true'
      panel.dataset.timelineBatchesLoadedCount = '2'
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const cleanup = mountTimelineViewLoader()
      window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
      await flushTimelineQueue()

      expect(fetchMock).not.toHaveBeenCalled()
      cleanup()
    })
  })

  it('falls back to legacy template mounting when external batch manifest is missing', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-timeline-loaded="false" data-timeline-batches-loaded-count="0" class="hidden">
        <div data-timeline-sections-container="true">
          <section id="timeline-year-2026"></section>
        </div>
        <div data-timeline-sections-sentinel="true"></div>
        <template data-timeline-batch-index="0">
          <section id="timeline-year-2025"></section>
        </template>
      </div>
    `
    window.history.replaceState(null, '', '/?view=timeline')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const cleanup = mountTimelineViewLoader()

    requestTimelineViewLoad(window, { strategy: 'all' })
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()
  })
})
