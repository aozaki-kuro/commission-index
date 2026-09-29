// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSearchController } from './commissionSearchController'

const activeCharactersMock = vi.hoisted(() => ({
  readActiveCharactersLoadedBatchCount: vi.fn(() => 0),
  requestActiveCharactersLoad: vi.fn(),
}))

const archivedCharactersMock = vi.hoisted(() => ({
  readArchivedCharactersLoadedBatchCount: vi.fn(() => 0),
  requestArchivedCharactersLoad: vi.fn(),
  requestArchivedCharactersVisibility: vi.fn(),
}))

const searchEntriesMock = vi.hoisted(() => ({
  entries: [] as Array<{ id: number, domKey: string, searchText: string, searchSuggest?: string }>,
}))

const panelStateMock = vi.hoisted(() => ({
  state: {
    activeLoaded: true,
    activeBatchCount: 0,
    archivedLoaded: true,
    archivedVisible: false,
    archivedBatchCount: 0,
    timelineLoaded: true,
  },
}))

vi.mock('@features/home/commission/batch/homeCharacterBatchClient', () => ({
  getHomeCharacterBatchTotalCount: () => 0,
  prefetchHomeCharacterBatches: vi.fn(),
}))

vi.mock('@features/home/commission/loader/activeCharactersEvent', () => ({
  ACTIVE_CHARACTERS_LOAD_FAILED_EVENT: 'home:active-characters-load-failed',
  ACTIVE_CHARACTERS_LOADED_EVENT: 'home:active-characters-loaded',
  readActiveCharactersLoadedBatchCount: activeCharactersMock.readActiveCharactersLoadedBatchCount,
  requestActiveCharactersLoad: activeCharactersMock.requestActiveCharactersLoad,
}))

vi.mock('@features/home/commission/loader/archivedCharactersEvent', () => ({
  readArchivedCharactersLoadedBatchCount: archivedCharactersMock.readArchivedCharactersLoadedBatchCount,
  requestArchivedCharactersLoad: archivedCharactersMock.requestArchivedCharactersLoad,
  requestArchivedCharactersVisibility: archivedCharactersMock.requestArchivedCharactersVisibility,
}))

vi.mock('@features/home/commission/loader/timelineViewEvent', () => ({
  requestTimelineViewLoad: vi.fn(),
}))

vi.mock('@features/home/search/commissionSearchDeferred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./commissionSearchDeferred')>()
  return {
    ...actual,
    buildPopularKeywordPoolFromEntries: () => [],
    buildSearchEntriesFromDom: () => [],
    ensureHomeSearchEntriesPromise: () => Promise.resolve(searchEntriesMock.entries),
    getCachedHomeSearchEntries: () => null,
  }
})

vi.mock('@features/home/search/commissionSearchPanelState', () => ({
  readPanelLoadedState: () => panelStateMock.state,
  subscribePanelState: () => () => {},
}))

function mountSearchRoot({
  featuredKeywords = [],
}: {
  featuredKeywords?: string[]
} = {}) {
  document.body.innerHTML = `
    <section
      id="commission-search"
      data-featured-keywords='${JSON.stringify(featuredKeywords)}'
      data-suggestion-alias-groups="[]"
    >
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
      <div id="search-active-load-feedback" role="status" hidden>
        <p id="search-active-load-feedback-text"></p>
        <button id="search-active-load-retry" type="button">Retry loading</button>
      </div>
    </section>
  `

  return document.getElementById('commission-search')!
}

describe('initSearchController', () => {
  beforeEach(() => {
    panelStateMock.state = {
      activeLoaded: true,
      activeBatchCount: 0,
      archivedLoaded: true,
      archivedVisible: false,
      archivedBatchCount: 0,
      timelineLoaded: true,
    }
    activeCharactersMock.requestActiveCharactersLoad.mockClear()
    activeCharactersMock.readActiveCharactersLoadedBatchCount.mockClear()
    archivedCharactersMock.requestArchivedCharactersLoad.mockClear()
    archivedCharactersMock.requestArchivedCharactersVisibility.mockClear()
    archivedCharactersMock.readArchivedCharactersLoadedBatchCount.mockClear()
    searchEntriesMock.entries = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0)
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it('hydrates the input from the q URL parameter', async () => {
    window.history.replaceState(null, '', '/?q=isj+20250322')
    const root = mountSearchRoot()

    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(document.querySelector<HTMLInputElement>('#commission-search-input')?.value)
      .toBe('isj 20250322')

    cleanup?.()
  })

  it('does not filter visible sections before deferred active batches load on first keyword click', async () => {
    panelStateMock.state = {
      ...panelStateMock.state,
      activeLoaded: false,
    }
    document.body.innerHTML = `
      <main>
        <section
          id="commission-search"
          data-featured-keywords='["deferred-only"]'
          data-suggestion-alias-groups="[]"
        >
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
        <section
          id="character-alpha"
          data-character-section="true"
          data-character-status="active"
        >
          <article
            data-commission-entry="true"
            data-character-section-id="character-alpha"
            data-commission-search-key="character-alpha::alpha"
            data-search-text="alpha"
            data-search-suggest="Keyword\talpha"
          ></article>
        </section>
      </main>
    `
    const root = document.getElementById('commission-search')!
    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))

    document.querySelector<HTMLButtonElement>('#search-keyword-list button')?.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(activeCharactersMock.requestActiveCharactersLoad).toHaveBeenCalledWith(
      window,
      { strategy: 'all' },
    )
    expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(false)

    cleanup?.()
  })

  it('shows an active batch load failure and retries only after an explicit click', async () => {
    panelStateMock.state = {
      ...panelStateMock.state,
      activeLoaded: false,
    }
    const root = mountSearchRoot({ featuredKeywords: ['deferred-only'] })
    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))

    document.querySelector<HTMLButtonElement>('#search-keyword-list button')?.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(activeCharactersMock.requestActiveCharactersLoad).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('home:active-characters-load-failed'))
    await new Promise(resolve => setTimeout(resolve, 0))

    const feedback = document.getElementById('search-active-load-feedback')!
    expect(feedback.hidden).toBe(false)
    expect(feedback.textContent).toContain('Could not load all commissions')
    expect(activeCharactersMock.requestActiveCharactersLoad).toHaveBeenCalledTimes(1)

    document.querySelector<HTMLButtonElement>('#search-active-load-retry')?.click()
    expect(activeCharactersMock.requestActiveCharactersLoad).toHaveBeenCalledTimes(2)
    expect(feedback.hidden).toBe(true)

    cleanup?.()
  })

  it('expands archived-only keyword matches before filtering the current viewport', async () => {
    panelStateMock.state = {
      activeLoaded: true,
      activeBatchCount: 1,
      archivedLoaded: false,
      archivedVisible: false,
      archivedBatchCount: 0,
      timelineLoaded: false,
    }
    searchEntriesMock.entries = [
      {
        id: 0,
        domKey: 'character-alpha::alpha',
        searchText: 'alpha',
        searchSuggest: 'Keyword\talpha',
      },
      {
        id: 1,
        domKey: 'character-blue-archive::blue_archive',
        searchText: 'blue archive',
        searchSuggest: 'Character\tBlue Archive',
      },
    ]
    document.body.innerHTML = `
      <main>
        <section
          id="commission-search"
          data-featured-keywords='["Blue Archive"]'
          data-suggestion-alias-groups="[]"
        >
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
        <section
          id="character-alpha"
          data-character-section="true"
          data-character-status="active"
        >
          <article
            data-commission-entry="true"
            data-character-section-id="character-alpha"
            data-commission-search-key="character-alpha::alpha"
            data-search-text="alpha"
            data-search-suggest="Keyword\talpha"
          ></article>
        </section>
      </main>
    `
    const root = document.getElementById('commission-search')!
    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    document.querySelector<HTMLButtonElement>('#search-keyword-list button')?.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(archivedCharactersMock.requestArchivedCharactersVisibility).toHaveBeenCalledWith(
      window,
      'visible',
    )
    expect(archivedCharactersMock.requestArchivedCharactersLoad).toHaveBeenCalledWith(
      window,
      { strategy: 'all', preserveScroll: true },
    )
    expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(false)

    cleanup?.()
  })
})
