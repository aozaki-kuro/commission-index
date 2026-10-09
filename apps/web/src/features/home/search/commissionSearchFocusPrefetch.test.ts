// @vitest-environment jsdom
import { clearHomeCharacterBatchRequestCacheForTests } from '@features/home/commission/batch/homeCharacterBatchClient'
import { clearHomeCharacterBatchManifestCacheForTests } from '@features/home/commission/batch/homeCharacterBatchManifest'
import { mountActiveCharactersLoader } from '@features/home/commission/loader/activeCharactersLoader'
import {
  createCharacterBatchPayload,
  flushAsyncWork,
} from '@features/home/commission/loader/loaderTestFixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSearchController } from './commissionSearchController'

// Real batch client, manifest and loader; only the search index fetch is stubbed.
// Counts batch requests so the focus prefetch budget is asserted on the wire.

const BATCH_ROUTE_PREFIX = '/search/home-character-batches/'
const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

const searchEntriesMock = vi.hoisted(() => ({
  entries: [] as Array<{ id: number, domKey: string, searchText: string, searchSuggest?: string }>,
}))

vi.mock('@features/home/search/commissionSearchDeferred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./commissionSearchDeferred')>()
  return {
    ...actual,
    buildSearchEntriesFromDom: () => [],
    ensureHomeSearchEntriesPromise: () => Promise.resolve(searchEntriesMock.entries),
    getCachedHomeSearchEntries: () => null,
  }
})

function renderFixture() {
  const manifest = {
    locale: 'en',
    v: 'manifest-v',
    active: {
      initialSectionIds: [],
      totalBatches: NAMES.length,
      targetBatchById: Object.fromEntries(NAMES.map((name, index) => [`section-${name}`, index])),
      batchVersions: NAMES.map((_, index) => `batch-v${index}`),
    },
    archived: { initialSectionIds: [], totalBatches: 0, targetBatchById: {}, batchVersions: [] },
  }

  document.body.innerHTML = `
    <script type="application/json" data-home-character-batch-manifest="true">${JSON.stringify(manifest)}</script>
    <section id="commission-search" data-featured-keywords='["gamma"]' data-suggestion-alias-groups="[]">
      <div role="combobox">
        <input id="commission-search-input" value="" />
        <ul id="search-suggestion-list"></ul>
      </div>
      <button id="search-help-trigger"></button>
      <button id="search-copy-url"></button>
      <button id="search-clear"></button>
      <div id="search-popular-keywords"></div>
      <ul id="search-keyword-list"></ul>
      <p id="search-live-region"></p>
    </section>
    <main>
      <div data-commission-view-panel="character" data-active-sections-loaded="false" data-active-batches-loaded-count="0">
        <div data-active-sections-container="true"></div>
        <div data-active-sections-sentinel="true"></div>
      </div>
    </main>
  `

  // jsdom has no layout: keep the sentinel far below the fold so the loader only loads on demand.
  const sentinel = document.querySelector<HTMLElement>('[data-active-sections-sentinel="true"]')!
  sentinel.getBoundingClientRect = () => ({ top: 100_000 }) as DOMRect

  searchEntriesMock.entries = NAMES.map((name, index) => ({
    id: index,
    domKey: `section-${name}::e${index}`,
    searchText: `${name} 2024`,
    searchSuggest: `Character\t${name}`,
  }))
}

function batchRequestUrls(fetchSpy: ReturnType<typeof vi.fn>) {
  return (fetchSpy.mock.calls as unknown as Array<[string]>)
    .map(([url]) => url)
    .filter(url => url.startsWith(BATCH_ROUTE_PREFIX))
}

function stubBatchFetch() {
  const fetchSpy = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/search/home-search-entries.json'))
      return new Response(JSON.stringify(searchEntriesMock.entries))

    const match = /\/active\/(\d+)\.json/.exec(url)
    if (!match)
      return new Response(null, { status: 404 })

    const batchIndex = Number(match[1])
    const name = NAMES[batchIndex]
    return new Response(JSON.stringify(createCharacterBatchPayload({
      status: 'active',
      batchIndex,
      sectionId: `section-${name}`,
      displayName: name,
      entryId: `e${batchIndex}`,
    })))
  })
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

describe('search focus prefetch budget', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0)
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id)
    })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    clearHomeCharacterBatchRequestCacheForTests()
    clearHomeCharacterBatchManifestCacheForTests(document)
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it('focusing the search input requests only the first batch, not every batch', async () => {
    renderFixture()
    const fetchSpy = stubBatchFetch()
    const cleanup = initSearchController(document.getElementById('commission-search')!)

    document.getElementById('commission-search-input')!.focus()
    await vi.waitFor(() => {
      expect(batchRequestUrls(fetchSpy)).toEqual([
        '/search/home-character-batches/en/active/0.json?v=batch-v0',
      ])
    })
    await flushAsyncWork()
    expect(batchRequestUrls(fetchSpy)).toHaveLength(1)

    cleanup?.()
  })

  it('selecting a keyword whose batch is not loaded still mounts that batch', async () => {
    renderFixture()
    const fetchSpy = stubBatchFetch()
    const cleanup = initSearchController(document.getElementById('commission-search')!)
    const loaderCleanup = mountActiveCharactersLoader({
      deps: { dispatchSidebarSync: () => {}, scrollToHashWithoutWrite: () => true },
    })

    document.getElementById('commission-search-input')!.focus()
    await vi.waitFor(() => {
      expect(batchRequestUrls(fetchSpy)).toContain('/search/home-character-batches/en/active/0.json?v=batch-v0')
    })

    // 'gamma' lives in batch 2, which focus did not warm up; the keyword must pull it in.
    document.querySelector<HTMLButtonElement>('#search-keyword-list button')!.click()

    await vi.waitFor(() => {
      const entry = document.querySelector<HTMLElement>('[data-commission-search-key="section-gamma::e2"]')
      expect(entry).not.toBeNull()
      expect(entry!.closest('.hidden')).toBeNull()
    })
    expect(batchRequestUrls(fetchSpy)).toContain('/search/home-character-batches/en/active/2.json?v=batch-v2')

    loaderCleanup()
    cleanup?.()
  })
})
