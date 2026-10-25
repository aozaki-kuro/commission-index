// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSearchController } from './commissionSearchController'

const archivedCharactersMock = vi.hoisted(() => ({
  isArchivedCharactersVisible: vi.fn(() => false),
  requestArchivedCharactersVisibility: vi.fn(),
}))

const searchEntriesMock = vi.hoisted(() => ({
  entries: [] as Array<{ id: number, domKey: string, searchText: string, searchSuggest?: string }>,
}))

const panelStateMock = vi.hoisted(() => ({
  state: {
    archivedVisible: false,
  },
}))

vi.mock('@features/home/commission/archivedCharactersState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/home/commission/archivedCharactersState')>()
  return {
    ...actual,
    isArchivedCharactersVisible: archivedCharactersMock.isArchivedCharactersVisible,
    requestArchivedCharactersVisibility: archivedCharactersMock.requestArchivedCharactersVisibility,
  }
})

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
    </section>
  `

  return document.getElementById('commission-search')!
}

describe('initSearchController', () => {
  beforeEach(() => {
    panelStateMock.state = {
      archivedVisible: false,
    }
    archivedCharactersMock.requestArchivedCharactersVisibility.mockClear()
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

  it('search filters without requesting loads', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('unexpected fetch')))
    vi.stubGlobal('fetch', fetchSpy)
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    searchEntriesMock.entries = [
      {
        id: 0,
        domKey: 'character-alpha::alpha',
        searchText: 'alpha',
        searchSuggest: 'Keyword\talpha',
      },
      {
        id: 1,
        domKey: 'character-beta::beta',
        searchText: 'beta',
        searchSuggest: 'Keyword\tbeta',
      },
    ]
    document.body.innerHTML = `
      <main>
        <section
          id="commission-search"
          data-featured-keywords='["alpha"]'
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
        <section id="character-alpha" data-character-section="true" data-character-status="active">
          <article
            data-commission-entry="true"
            data-character-section-id="character-alpha"
            data-commission-search-key="character-alpha::alpha"
          ></article>
        </section>
        <section id="character-beta" data-character-section="true" data-character-status="active">
          <article
            data-commission-entry="true"
            data-character-section-id="character-beta"
            data-commission-search-key="character-beta::beta"
          ></article>
        </section>
      </main>
    `
    const root = document.getElementById('commission-search')!
    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))

    document.querySelector<HTMLButtonElement>('#search-keyword-list button')?.click()

    await vi.waitFor(() => {
      expect(document.getElementById('character-beta')?.classList.contains('hidden')).toBe(true)
    })
    expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(archivedCharactersMock.requestArchivedCharactersVisibility).not.toHaveBeenCalled()
    const dispatchedTypes = dispatchSpy.mock.calls.map(([event]) => event.type)
    expect(dispatchedTypes.filter(type => /load/i.test(type))).toEqual([])

    cleanup?.()
  })

  it('shuffle in timeline view scrolls the timeline copy, not the character copy', async () => {
    window.history.replaceState(null, '', '/?view=timeline')
    searchEntriesMock.entries = [
      { id: 0, domKey: 'character-alpha::alpha', searchText: 'alpha' },
    ]
    document.body.innerHTML = `
      <main>
        <section id="commission-search" data-featured-keywords="[]" data-suggestion-alias-groups="[]">
          <div role="combobox">
            <input id="commission-search-input" value="" />
            <ul id="search-suggestion-list"></ul>
          </div>
          <button id="search-shuffle" type="button"></button>
          <ul id="search-keyword-list"></ul>
          <p id="search-live-region"></p>
        </section>
        <div data-commission-view-panel="character" data-commission-view-active="false" class="hidden">
          <section id="character-alpha" data-character-section="true" data-character-status="active">
            <article data-commission-entry="true" data-commission-search-key="character-alpha::alpha"></article>
          </section>
        </div>
        <div data-commission-view-panel="timeline" data-commission-view-active="true">
          <section id="timeline-year-2026" data-character-section="true">
            <article data-commission-entry="true" data-commission-search-key="character-alpha::alpha"></article>
          </section>
        </div>
      </main>
    `
    const [characterCopy, timelineCopy] = [
      ...document.querySelectorAll<HTMLElement>('[data-commission-search-key="character-alpha::alpha"]'),
    ]
    for (const copy of [characterCopy, timelineCopy]) {
      copy.scrollIntoView = vi.fn()
      copy.animate = vi.fn() as unknown as HTMLElement['animate']
    }
    const root = document.getElementById('commission-search')!
    const cleanup = initSearchController(root)
    await new Promise(resolve => setTimeout(resolve, 0))

    document.querySelector<HTMLButtonElement>('#search-shuffle')?.click()

    expect(timelineCopy.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(characterCopy.scrollIntoView).not.toHaveBeenCalled()
    expect(archivedCharactersMock.requestArchivedCharactersVisibility).not.toHaveBeenCalled()

    cleanup?.()
  })

  it('expands archived-only keyword matches before filtering the current viewport', async () => {
    panelStateMock.state = {
      archivedVisible: false,
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
    expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(false)

    cleanup?.()
  })
})
