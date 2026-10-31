// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSearchController } from './commissionSearchController'

const trackMock = vi.hoisted(() => ({
  trackRybbitEvent: vi.fn(),
}))

vi.mock('@lib/analytics/track', () => trackMock)

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

  describe('address sync', () => {
    function typeQuery(value: string) {
      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('writes the applied query with replaceState after the debounce, keeping state and hash', async () => {
      window.history.replaceState({ index: 3, scrollX: 0, scrollY: 40 }, '', '/?q=foo&view=timeline#top')
      const replaceSpy = vi.spyOn(window.history, 'replaceState')
      const pushSpy = vi.spyOn(window.history, 'pushState')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.advanceTimersByTimeAsync(50)
      replaceSpy.mockClear()

      typeQuery('bar')
      await vi.advanceTimersByTimeAsync(200)
      expect(window.location.search).toBe('?q=foo&view=timeline')

      await vi.advanceTimersByTimeAsync(300)
      expect(window.location.search).toBe('?q=bar&view=timeline')
      expect(window.location.hash).toBe('#top')
      expect(replaceSpy).toHaveBeenCalledTimes(1)
      expect(window.history.state).toEqual({ index: 3, scrollX: 0, scrollY: 40 })
      expect(pushSpy).not.toHaveBeenCalled()
      expect(document.querySelector<HTMLInputElement>('#commission-search-input')!.value).toBe('bar')

      cleanup?.()
    })

    it('clears q immediately and drops a pending write', async () => {
      window.history.replaceState({ index: 1 }, '', '/?q=foo#top')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.advanceTimersByTimeAsync(50)

      typeQuery('bar')
      await vi.advanceTimersByTimeAsync(120)
      document.querySelector<HTMLButtonElement>('#search-clear')!.click()
      expect(window.location.search).toBe('')
      expect(window.location.hash).toBe('#top')
      expect(window.history.state).toEqual({ index: 1 })

      await vi.advanceTimersByTimeAsync(600)
      expect(window.location.search).toBe('')

      cleanup?.()
    })

    it('removes q when the typed query normalizes to empty', async () => {
      window.history.replaceState(null, '', '/?q=foo')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.advanceTimersByTimeAsync(50)

      typeQuery('   ')
      await vi.advanceTimersByTimeAsync(500)
      expect(window.location.search).toBe('')

      cleanup?.()
    })

    it('keeps typed text and the pending write across a hash-only popstate', async () => {
      window.history.replaceState({ index: 1 }, '', '/?q=foo')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.advanceTimersByTimeAsync(50)

      typeQuery('bar')
      await vi.advanceTimersByTimeAsync(120)
      window.history.replaceState(window.history.state, '', '/?q=foo#section-alpha')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.advanceTimersByTimeAsync(100)
      expect(document.querySelector<HTMLInputElement>('#commission-search-input')!.value).toBe('bar')

      await vi.advanceTimersByTimeAsync(400)
      expect(window.location.search).toBe('?q=bar')
      expect(window.location.hash).toBe('#section-alpha')

      cleanup?.()
    })

    it('follows popstate to a different q even after typing', async () => {
      window.history.replaceState(null, '', '/?q=foo')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.advanceTimersByTimeAsync(50)
      typeQuery('bar')
      await vi.advanceTimersByTimeAsync(500)

      window.history.replaceState(window.history.state, '', '/?q=baz')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.advanceTimersByTimeAsync(100)

      expect(document.querySelector<HTMLInputElement>('#commission-search-input')!.value).toBe('baz')
      expect(window.location.search).toBe('?q=baz')

      cleanup?.()
    })
  })

  describe('keyword entry points', () => {
    function trackedEvents(name: string) {
      return trackMock.trackRybbitEvent.mock.calls
        .filter(([eventName]) => eventName === name)
        .map(([, properties]) => properties)
    }

    beforeEach(() => {
      // jsdom has no scrollIntoView; the suggestion listbox calls it when it highlights an item.
      Element.prototype.scrollIntoView = vi.fn()
      searchEntriesMock.entries = [
        { id: 0, domKey: 'character-alpha::alpha', searchText: 'alpha' },
        { id: 1, domKey: 'character-beta::beta', searchText: 'beta' },
      ]
    })

    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    it('reports a featured chip click as from row and the search as keyword-sourced', async () => {
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
      }))
      await vi.waitFor(() => {
        expect(document.querySelector('#search-keyword-list button')).not.toBeNull()
      })

      document.querySelector<HTMLButtonElement>('#search-keyword-list button')!.click()

      expect(trackedEvents('popular_keyword_clicked')).toEqual([
        { keyword: 'alpha', from: 'row' },
      ])
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'keyword' },
        ])
      })

      cleanup?.()
    })

    it('applies a browse popover term, closes the popover and reports it as from all', async () => {
      const root = mountSearchRoot()
      root.insertAdjacentHTML('beforeend', `
        <div id="search-browse-popover" popover>
          <button type="button" data-browse-term="Studio K">Studio K</button>
        </div>
      `)
      const popover = document.getElementById('search-browse-popover')!
      popover.hidePopover = vi.fn()
      const cleanup = initSearchController(root)

      popover.querySelector('button')!.click()

      expect(popover.hidePopover).toHaveBeenCalledOnce()
      expect(document.querySelector<HTMLInputElement>('#commission-search-input')?.value).toBe('"Studio K" ')
      expect(trackedEvents('popular_keyword_clicked')).toEqual([
        { keyword: 'Studio K', from: 'all' },
      ])
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'keyword' },
        ])
      })

      cleanup?.()
    })

    it('searches a co-appearance together with its character', async () => {
      const root = mountSearchRoot()
      root.insertAdjacentHTML('beforeend', `
        <div id="search-browse-popover" popover>
          <button type="button" data-browse-term="Kanaut Nishe" data-browse-scope="Lucia"><span>×</span> Kanaut Nishe</button>
        </div>
      `)
      const popover = document.getElementById('search-browse-popover')!
      popover.hidePopover = vi.fn()
      const cleanup = initSearchController(root)

      popover.querySelector('span')!.click()

      expect(document.querySelector<HTMLInputElement>('#commission-search-input')?.value).toBe('Lucia "Kanaut Nishe" ')
      expect(trackedEvents('popular_keyword_clicked')).toEqual([
        { keyword: 'Kanaut Nishe', from: 'all' },
      ])
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'keyword' },
        ])
      })

      cleanup?.()
    })

    it('reports a typed search as input and a deep link as url_query', async () => {
      window.history.replaceState(null, '', '/?q=beta')
      const cleanup = initSearchController(mountSearchRoot())
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'url_query' },
        ])
      })
      cleanup?.()

      trackMock.trackRybbitEvent.mockClear()
      window.history.replaceState(null, '', '/')
      const typedCleanup = initSearchController(mountSearchRoot())
      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!
      input.value = 'alpha'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'input' },
        ])
      })

      typedCleanup?.()
    })
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
