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

interface MockSearchEntry { id: number, domKey: string, searchText: string, searchSuggest?: string }

const searchEntriesMock = vi.hoisted(() => {
  const mock = {
    entries: [] as MockSearchEntry[],
    promise: null as Promise<MockSearchEntry[]> | null,
    ensure: vi.fn((): Promise<MockSearchEntry[]> => mock.promise ?? Promise.resolve(mock.entries)),
  }
  return mock
})

const panelStateMock = vi.hoisted(() => ({
  state: {
    archivedVisible: false,
  },
  subscribers: new Set<(state: { archivedVisible: boolean }) => void>(),
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
    ensureHomeSearchEntriesPromise: searchEntriesMock.ensure,
    getCachedHomeSearchEntries: () => null,
  }
})

vi.mock('@features/home/search/commissionSearchPanelState', () => ({
  readPanelLoadedState: () => panelStateMock.state,
  subscribePanelState: (fn: (state: { archivedVisible: boolean }) => void) => {
    panelStateMock.subscribers.add(fn)
    return () => panelStateMock.subscribers.delete(fn)
  },
}))

// Mirrors the island's server-rendered chip markup.
function renderServerChips(keywords: string[]) {
  return keywords
    .map(keyword => `<li class="shrink-0"><button type="button" data-keyword="${keyword}">${keyword}</button></li>`)
    .join('')
}

function mountSearchRoot({
  featuredKeywords = [],
  serverChips = [],
}: {
  featuredKeywords?: string[]
  serverChips?: string[]
} = {}) {
  document.body.innerHTML = `
    <section
      id="commission-search"
      data-featured-keywords='${JSON.stringify(featuredKeywords)}'
      data-suggestion-alias-groups="[]"
    >
      <div>
        <input id="commission-search-input" role="combobox" aria-controls="search-suggestion-list" value="" />
        <ul id="search-suggestion-list" role="listbox"></ul>
      </div>
      <button id="search-help-trigger"></button>
      <button id="search-copy-url"></button>
      <button id="search-clear"></button>
      <div id="search-popular-keywords"></div>
      <ul id="search-keyword-list">${renderServerChips(serverChips)}</ul>
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
    panelStateMock.subscribers.clear()
    archivedCharactersMock.requestArchivedCharactersVisibility.mockReset()
    searchEntriesMock.entries = []
    searchEntriesMock.promise = null
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

    it('adopts server-rendered chips without rebuilding them', async () => {
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha', 'beta'],
        serverChips: ['alpha', 'beta'],
      }))
      const firstButton = document.querySelector<HTMLButtonElement>('#search-keyword-list button')!
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(document.querySelector('#search-keyword-list button')).toBe(firstButton)
      firstButton.click()
      expect(trackedEvents('popular_keyword_clicked')).toEqual([
        { keyword: 'alpha', from: 'row' },
      ])

      cleanup?.()
    })

    it('applies a pending keyword passed at init', async () => {
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
        serverChips: ['alpha'],
      }), { pendingKeyword: 'alpha' })

      await vi.waitFor(() => {
        expect(trackedEvents('popular_keyword_clicked')).toEqual([
          { keyword: 'alpha', from: 'row' },
        ])
      })
      await vi.waitFor(() => {
        expect(trackedEvents('search_used')).toEqual([
          { source: 'keyword' },
        ])
      })

      cleanup?.()
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

  describe('search index loading', () => {
    function renderSearchListing(featuredKeywords: string[]) {
      document.body.innerHTML = `
        <main>
          <section
            id="commission-search"
            data-featured-keywords='${JSON.stringify(featuredKeywords)}'
            data-suggestion-alias-groups="[]"
          >
            <div>
              <input id="commission-search-input" role="combobox" aria-controls="search-suggestion-list" value="" />
              <ul id="search-suggestion-list" role="listbox"></ul>
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
      return document.getElementById('commission-search')!
    }

    const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

    function typeInto(value: string) {
      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    it('waits for a search interaction before fetching the index', async () => {
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
      }))
      await tick()
      expect(searchEntriesMock.ensure).not.toHaveBeenCalled()

      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!
      input.dispatchEvent(new Event('focus'))
      input.dispatchEvent(new Event('pointerdown'))
      await tick()
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(1)

      cleanup?.()
    })

    it('fetches the index at init for a ?q= load', async () => {
      window.history.replaceState(null, '', '/?q=alpha')
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
      }))
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(1)
      cleanup?.()
    })

    it('fetches the index at init when the keyword row needs the entry pool', async () => {
      const cleanup = initSearchController(mountSearchRoot())
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(1)
      cleanup?.()
    })

    it('fetches the index when back/forward lands on a ?q=', async () => {
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
      }))
      await tick()
      expect(searchEntriesMock.ensure).not.toHaveBeenCalled()

      window.history.replaceState(null, '', '/?q=alpha')
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(1)

      cleanup?.()
    })

    it('holds a query typed on a cold cache until the index arrives, then filters it', async () => {
      searchEntriesMock.entries = [
        { id: 0, domKey: 'character-alpha::alpha', searchText: 'alpha' },
        { id: 1, domKey: 'character-beta::beta', searchText: 'beta' },
      ]
      let resolveIndex!: (entries: MockSearchEntry[]) => void
      searchEntriesMock.promise = new Promise((resolve) => {
        resolveIndex = resolve
      })
      const cleanup = initSearchController(renderSearchListing(['alpha']))
      await tick()

      typeInto('beta')
      // Past the recompute debounce: without the index the DOM-only index matches nothing and would hide everything.
      await tick(150)
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(1)
      expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(false)
      expect(document.getElementById('character-beta')?.classList.contains('hidden')).toBe(false)

      resolveIndex(searchEntriesMock.entries)
      await vi.waitFor(() => {
        expect(document.getElementById('character-alpha')?.classList.contains('hidden')).toBe(true)
      })
      expect(document.getElementById('character-beta')?.classList.contains('hidden')).toBe(false)

      cleanup?.()
    })

    it('retries a failed index load on the next interaction', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      searchEntriesMock.promise = Promise.reject(new Error('offline'))
      const cleanup = initSearchController(mountSearchRoot({
        featuredKeywords: ['alpha'],
      }))
      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!

      input.dispatchEvent(new Event('focus'))
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })
      searchEntriesMock.promise = null
      input.dispatchEvent(new Event('focus'))
      expect(searchEntriesMock.ensure).toHaveBeenCalledTimes(2)

      cleanup?.()
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
          <div>
            <input id="commission-search-input" role="combobox" aria-controls="search-suggestion-list" value="" />
            <ul id="search-suggestion-list" role="listbox"></ul>
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
          <div>
            <input id="commission-search-input" role="combobox" aria-controls="search-suggestion-list" value="" />
            <ul id="search-suggestion-list" role="listbox"></ul>
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

  describe('frame scheduling and teardown', () => {
    let frames: Map<number, FrameRequestCallback>
    let nextFrameId: number

    // Runs the callbacks queued before this frame; ones requested while it runs wait for the next, as in a browser.
    function flushFrame() {
      const batch = [
        ...frames.values(),
      ]
      frames.clear()
      for (const callback of batch)
        callback(performance.now())
    }

    async function settle() {
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(400)
        flushFrame()
      }
    }

    function typeQuery(value: string) {
      const input = document.querySelector<HTMLInputElement>('#commission-search-input')!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    function renderListing({ archived = false }: { archived?: boolean } = {}) {
      const archivedMarkup = archived
        ? `
          <div data-archived-sections-container="true" class="hidden">
            <section id="character-blue" data-character-section="true" data-character-status="archived">
              <article
                data-commission-entry="true"
                data-character-section-id="character-blue"
                data-commission-search-key="character-blue::blue"
              ></article>
            </section>
          </div>`
        : `
          <section id="character-beta" data-character-section="true" data-character-status="active">
            <article
              data-commission-entry="true"
              data-character-section-id="character-beta"
              data-commission-search-key="character-beta::beta"
            ></article>
          </section>`
      return `
        <div data-commission-view-panel="character" data-commission-view-active="true">
          <section id="character-alpha" data-character-section="true" data-character-status="active">
            <article
              data-commission-entry="true"
              data-character-section-id="character-alpha"
              data-commission-search-key="character-alpha::alpha"
            ></article>
          </section>
          ${archivedMarkup}
        </div>`
    }

    // The real toggle answers a show request synchronously, then notifies panel-state subscribers.
    function answerArchivedRequestsSynchronously() {
      archivedCharactersMock.requestArchivedCharactersVisibility.mockImplementation((_win: Window, visibility: string) => {
        const visible = visibility === 'visible'
        document.querySelector('[data-archived-sections-container]')?.classList.toggle('hidden', !visible)
        panelStateMock.state = { archivedVisible: visible }
        for (const fn of panelStateMock.subscribers)
          fn(panelStateMock.state)
      })
    }

    function collapseArchivedFromOutside() {
      document.querySelector('[data-archived-sections-container]')?.classList.add('hidden')
      panelStateMock.state = { archivedVisible: false }
      for (const fn of panelStateMock.subscribers)
        fn(panelStateMock.state)
    }

    function visibleRequestCount() {
      return archivedCharactersMock.requestArchivedCharactersVisibility.mock.calls
        .filter(([, visibility]) => visibility === 'visible')
        .length
    }

    beforeEach(() => {
      vi.useFakeTimers()
      frames = new Map()
      nextFrameId = 1
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        const id = nextFrameId++
        frames.set(id, callback)
        return id
      })
      vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        frames.delete(id)
      })
      Element.prototype.scrollIntoView = vi.fn()
    })

    afterEach(() => {
      vi.useRealTimers()
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })

    it('writes nothing to the next page when torn down before the index resolves', async () => {
      searchEntriesMock.entries = [
        { id: 0, domKey: 'character-alpha::alpha', searchText: 'alpha' },
        { id: 1, domKey: 'character-beta::beta', searchText: 'beta' },
      ]
      let resolveIndex!: (entries: MockSearchEntry[]) => void
      searchEntriesMock.promise = new Promise((resolve) => {
        resolveIndex = resolve
      })
      const cleanup = initSearchController(mountSearchRoot())
      typeQuery('alpha')
      cleanup?.()

      // Soft navigation swapped in the next page before the slow index arrived.
      window.history.replaceState(null, '', '/ja/')
      document.body.innerHTML = renderListing()
      const replaceSpy = vi.spyOn(window.history, 'replaceState')
      resolveIndex(searchEntriesMock.entries)
      await settle()

      expect(document.getElementById('character-beta')!.classList.contains('hidden')).toBe(false)
      expect(document.getElementById('character-alpha')!.classList.contains('hidden')).toBe(false)
      expect(replaceSpy).not.toHaveBeenCalled()
      expect(window.location.search).toBe('')
      expect(frames.size).toBe(0)
    })

    it('runs several immediate requests in one frame as a single recompute', async () => {
      searchEntriesMock.entries = [
        { id: 0, domKey: 'character-alpha::alpha', searchText: 'alpha' },
        { id: 1, domKey: 'character-beta::beta', searchText: 'beta' },
      ]
      const root = mountSearchRoot({
        featuredKeywords: ['alpha'],
        serverChips: ['alpha'],
      })
      root.insertAdjacentHTML('afterend', renderListing())
      const cleanup = initSearchController(root)
      // A real tap's pointerdown starts the index fetch before its click; this test is about the warm frame.
      root.querySelector('[data-keyword="alpha"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await settle()
      const combobox = root.querySelector('#commission-search-input')!
      const setAttributeSpy = vi.spyOn(combobox, 'setAttribute')

      root.querySelector<HTMLButtonElement>('[data-keyword="alpha"]')!.click()
      window.dispatchEvent(new PopStateEvent('popstate'))
      flushFrame()

      expect(setAttributeSpy.mock.calls.filter(([name]) => name === 'aria-expanded')).toHaveLength(1)
      expect(document.getElementById('character-beta')!.classList.contains('hidden')).toBe(true)
      cleanup?.()
    })

    it('filters an archived-only keyword match in the frame that reveals archived', async () => {
      answerArchivedRequestsSynchronously()
      searchEntriesMock.entries = [
        {
          id: 0,
          domKey: 'character-alpha::alpha',
          searchText: 'alpha',
          searchSuggest: 'Keyword\talpha',
        },
        {
          id: 1,
          domKey: 'character-blue::blue',
          searchText: 'blue archive',
          searchSuggest: 'Character\tBlue Archive',
        },
      ]
      const root = mountSearchRoot({
        featuredKeywords: ['Blue Archive'],
        serverChips: ['Blue Archive'],
      })
      root.insertAdjacentHTML('afterend', renderListing({ archived: true }))
      const cleanup = initSearchController(root)
      root.querySelector('[data-keyword="Blue Archive"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await settle()

      root.querySelector<HTMLButtonElement>('[data-keyword="Blue Archive"]')!.click()
      flushFrame()

      expect(visibleRequestCount()).toBeGreaterThan(0)
      expect(panelStateMock.state.archivedVisible).toBe(true)
      expect(document.getElementById('character-alpha')!.classList.contains('hidden')).toBe(true)
      expect(document.getElementById('character-blue')!.classList.contains('hidden')).toBe(false)
      cleanup?.()
    })

    it('reveals archived again for a new archived-only query after archived was collapsed', async () => {
      answerArchivedRequestsSynchronously()
      searchEntriesMock.entries = [
        {
          id: 0,
          domKey: 'character-alpha::alpha',
          searchText: 'alpha',
          searchSuggest: 'Keyword\talpha',
        },
        {
          id: 1,
          domKey: 'character-blue::blue',
          searchText: 'blue archive',
          searchSuggest: 'Character\tBlue Archive',
        },
      ]
      const root = mountSearchRoot()
      root.insertAdjacentHTML('afterend', renderListing({ archived: true }))
      const cleanup = initSearchController(root)
      await settle()

      typeQuery('blue')
      await settle()
      expect(visibleRequestCount()).toBe(1)

      typeQuery('')
      await settle()
      collapseArchivedFromOutside()
      await settle()
      expect(visibleRequestCount()).toBe(1)

      typeQuery('blu')
      await settle()
      expect(visibleRequestCount()).toBe(2)
      expect(panelStateMock.state.archivedVisible).toBe(true)
      cleanup?.()
    })

    it('keeps the ARIA 1.2 combobox state on the input itself', async () => {
      searchEntriesMock.entries = [
        {
          id: 0,
          domKey: 'character-alpha::alpha',
          searchText: 'alpha',
          searchSuggest: 'Keyword\talpha',
        },
      ]
      const root = mountSearchRoot()
      root.insertAdjacentHTML('afterend', renderListing())
      const cleanup = initSearchController(root)
      await settle()
      const input = root.querySelector<HTMLInputElement>('#commission-search-input')!
      const list = root.querySelector<HTMLElement>('#search-suggestion-list')!

      input.focus()
      typeQuery('al')
      await settle()
      expect(input.getAttribute('aria-expanded')).toBe('true')
      const active = document.getElementById(input.getAttribute('aria-activedescendant')!)!
      expect(active.tagName).toBe('LI')
      expect(active.parentElement).toBe(list)

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await settle()
      expect(input.getAttribute('aria-expanded')).toBe('false')
      cleanup?.()
    })

    it('clears the active option when the suggestion panel closes so Enter is not swallowed', async () => {
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
      const root = mountSearchRoot()
      root.insertAdjacentHTML('afterend', renderListing())
      const cleanup = initSearchController(root)
      await settle()
      const input = root.querySelector<HTMLInputElement>('#commission-search-input')!

      input.focus()
      typeQuery('al')
      await settle()
      expect(root.querySelector('[role="option"]')).not.toBeNull()
      expect(input.hasAttribute('aria-activedescendant')).toBe(true)

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(input.hasAttribute('aria-activedescendant')).toBe(false)
      await settle()
      expect(input.hasAttribute('aria-activedescendant')).toBe(false)

      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      input.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(false)
      cleanup?.()
    })

    it('leaves no active option once a closing list empties, even after arrow keys in the close window', async () => {
      searchEntriesMock.entries = [
        {
          id: 0,
          domKey: 'character-alpha::alpha',
          searchText: 'alpha',
          searchSuggest: 'Keyword\talpha',
        },
      ]
      const root = mountSearchRoot()
      root.insertAdjacentHTML('afterend', renderListing())
      const cleanup = initSearchController(root)
      await settle()
      const input = root.querySelector<HTMLInputElement>('#commission-search-input')!
      input.focus()
      typeQuery('al')
      await settle()

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      flushFrame()
      expect(root.querySelector('[role="option"]')).not.toBeNull()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await settle()

      expect(root.querySelector('[role="option"]')).toBeNull()
      expect(input.hasAttribute('aria-activedescendant')).toBe(false)
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      input.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(false)
      cleanup?.()
    })
  })
})
