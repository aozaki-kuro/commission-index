// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { ACTIVE_CHARACTERS_LOADED_EVENT } from '#features/home/commission/activeCharactersEvent'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { STALE_CHARACTERS_STATE_CHANGE_EVENT } from '#features/home/commission/staleCharactersEvent'
import { mountSidebarNavEnhancer } from './sidebarNavEnhancer'

const renderSidebarRoot = () => {
  document.body.innerHTML = `
    <div id="Character List">
      <button data-sidebar-view-mode-toggle="true" data-view-mode="character" aria-pressed="true">
        <span data-sidebar-view-mode-indicator class="scale-100 opacity-100"></span>
      </button>
      <button data-sidebar-view-mode-toggle="true" data-view-mode="timeline" aria-pressed="false">
        <span data-sidebar-view-mode-indicator class="scale-0 opacity-0"></span>
      </button>
      <a href="#commission-search" data-sidebar-search-link="true">Search</a>

      <ul data-sidebar-nav-panel="character">
        <li>
          <span data-sidebar-dot-for="title-alpha" class="scale-0 opacity-0"></span>
          <a href="#section-alpha" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="title-alpha">Alpha</a>
        </li>
        <li>
          <details data-sidebar-stale-details="true">
            <summary data-load-stale-characters="true">Stale Characters</summary>
            <span data-sidebar-dot-for="title-stale" class="scale-0 opacity-0"></span>
            <a href="#section-stale" data-sidebar-character-link="true" data-sidebar-character-status="stale" data-sidebar-title-id="title-stale">Stale</a>
          </details>
        </li>
      </ul>
      <ul data-sidebar-nav-panel="timeline" class="hidden">
        <li>
          <span data-sidebar-dot-for="timeline-title-2026" class="scale-0 opacity-0"></span>
          <a href="#timeline-year-2026" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="timeline-title-2026">2026</a>
        </li>
      </ul>
    </div>
    <h2 id="title-introduction"></h2>
    <h2 id="title-alpha"></h2>
    <section id="section-alpha"></section>
    <h2 id="timeline-title-2026"></h2>
    <section id="timeline-year-2026"></section>
    <div data-commission-view-panel="character" data-stale-loaded="false" data-stale-visibility="hidden"></div>
  `
}

describe('sidebarNavEnhancer', () => {
  beforeEach(() => {
    renderSidebarRoot()
    window.history.replaceState(null, '', '/')

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  it('syncs URL and panel visibility when view mode toggles', () => {
    const trackEvent = vi.fn()
    const cleanup = mountSidebarNavEnhancer({
      deps: {
        trackEvent,
      },
    })

    const timelineButton = document.querySelector<HTMLButtonElement>(
      '[data-sidebar-view-mode-toggle="true"][data-view-mode="timeline"]',
    )
    timelineButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(window.location.search).toBe('?view=timeline')
    expect(
      document
        .querySelector<HTMLElement>('[data-sidebar-nav-panel="character"]')
        ?.classList.contains('hidden'),
    ).toBe(true)
    expect(
      document
        .querySelector<HTMLElement>('[data-sidebar-nav-panel="timeline"]')
        ?.classList.contains('hidden'),
    ).toBe(false)
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.sidebarViewModeToggleUsed,
      expect.objectContaining({
        from_mode: 'character',
        to_mode: 'timeline',
      }),
    )

    cleanup()
  })

  it('disables sidebar links that point to hidden sections', () => {
    const section = document.getElementById('section-alpha')
    section?.classList.add('hidden')

    const cleanup = mountSidebarNavEnhancer()
    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))

    const characterLink = document.querySelector<HTMLAnchorElement>(
      '[data-sidebar-character-link="true"]',
    )
    expect(characterLink?.getAttribute('aria-disabled')).toBe('true')
    expect(characterLink?.tabIndex).toBe(-1)

    cleanup()
  })

  it('updates active dots on scroll', () => {
    const title = document.getElementById('title-alpha')
    const introduction = document.getElementById('title-introduction')

    title!.getBoundingClientRect = () =>
      ({
        top: 200,
        bottom: 240,
        left: 0,
        right: 0,
        width: 200,
        height: 40,
        x: 0,
        y: 200,
        toJSON: () => ({}),
      }) as DOMRect
    title!.getClientRects = () => [title!.getBoundingClientRect()] as unknown as DOMRectList
    introduction!.getBoundingClientRect = () =>
      ({
        top: -200,
        bottom: -100,
        left: 0,
        right: 0,
        width: 200,
        height: 40,
        x: 0,
        y: -200,
        toJSON: () => ({}),
      }) as DOMRect
    introduction!.getClientRects = () =>
      [introduction!.getBoundingClientRect()] as unknown as DOMRectList

    Object.defineProperty(window, 'scrollY', { value: 300, writable: true })

    const cleanup = mountSidebarNavEnhancer()
    window.dispatchEvent(new Event('scroll'))

    const dot = document.querySelector<HTMLElement>('[data-sidebar-dot-for="title-alpha"]')
    expect(dot?.classList.contains('scale-100')).toBe(true)
    expect(dot?.classList.contains('opacity-100')).toBe(true)

    cleanup()
  })

  it('reuses panel title mapping across scroll frames', () => {
    const cleanup = mountSidebarNavEnhancer()
    const getElementByIdSpy = vi.spyOn(document, 'getElementById')
    getElementByIdSpy.mockClear()
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))

    expect(getElementByIdSpy).not.toHaveBeenCalled()

    getElementByIdSpy.mockRestore()
    cleanup()
  })

  it('invalidates cached panel title mapping on sidebar search sync events', () => {
    const cleanup = mountSidebarNavEnhancer()
    const characterPanel = document.querySelector<HTMLElement>(
      '[data-sidebar-nav-panel="character"]',
    )
    characterPanel?.insertAdjacentHTML(
      'beforeend',
      `
        <li>
          <span data-sidebar-dot-for="title-beta" class="scale-0 opacity-0"></span>
          <a href="#section-beta" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="title-beta">Beta</a>
        </li>
      `,
    )

    const alphaTitle = document.getElementById('title-alpha') as HTMLElement
    const betaTitle = document.createElement('h2')
    betaTitle.id = 'title-beta'
    document.body.append(betaTitle)
    const betaSection = document.createElement('section')
    betaSection.id = 'section-beta'
    document.body.append(betaSection)

    alphaTitle.getBoundingClientRect = () =>
      ({
        top: -200,
        bottom: -160,
        left: 0,
        right: 0,
        width: 200,
        height: 40,
        x: 0,
        y: -200,
        toJSON: () => ({}),
      }) as DOMRect
    alphaTitle.getClientRects = () => [] as unknown as DOMRectList

    betaTitle.getBoundingClientRect = () =>
      ({
        top: 120,
        bottom: 160,
        left: 0,
        right: 0,
        width: 200,
        height: 40,
        x: 0,
        y: 120,
        toJSON: () => ({}),
      }) as DOMRect
    betaTitle.getClientRects = () => [betaTitle.getBoundingClientRect()] as unknown as DOMRectList

    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))
    window.dispatchEvent(new Event('scroll'))
    const betaDot = document.querySelector<HTMLElement>('[data-sidebar-dot-for="title-beta"]')
    expect(betaDot?.classList.contains('scale-100')).toBe(true)
    expect(betaDot?.classList.contains('opacity-100')).toBe(true)

    betaSection.remove()
    betaTitle.remove()
    cleanup()
  })

  it('keeps the first character dot active near the top like timeline mode', () => {
    const title = document.getElementById('title-alpha')
    const introduction = document.getElementById('title-introduction')

    title!.getBoundingClientRect = () =>
      ({
        top: 420,
        bottom: 460,
        left: 0,
        right: 0,
        width: 200,
        height: 40,
        x: 0,
        y: 420,
        toJSON: () => ({}),
      }) as DOMRect
    title!.getClientRects = () => [title!.getBoundingClientRect()] as unknown as DOMRectList
    introduction!.getBoundingClientRect = () =>
      ({
        top: 80,
        bottom: 180,
        left: 0,
        right: 0,
        width: 200,
        height: 100,
        x: 0,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect
    introduction!.getClientRects = () =>
      [introduction!.getBoundingClientRect()] as unknown as DOMRectList

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true })

    const cleanup = mountSidebarNavEnhancer()
    window.dispatchEvent(new Event('scroll'))

    const dot = document.querySelector<HTMLElement>('[data-sidebar-dot-for="title-alpha"]')
    expect(dot?.classList.contains('scale-100')).toBe(true)
    expect(dot?.classList.contains('opacity-100')).toBe(true)

    cleanup()
  })

  it('removes all listeners on cleanup', () => {
    const jumpToSearch = vi.fn()
    const clearHash = vi.fn()

    const cleanup = mountSidebarNavEnhancer({
      deps: {
        jumpToSearch,
        clearHash,
      },
    })

    cleanup()
    jumpToSearch.mockClear()
    clearHash.mockClear()

    const searchLink = document.querySelector<HTMLAnchorElement>(
      '[data-sidebar-search-link="true"]',
    )
    searchLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    window.dispatchEvent(new Event('scroll'))

    expect(jumpToSearch).not.toHaveBeenCalled()
    expect(clearHash).not.toHaveBeenCalled()
  })

  it('opens stale details immediately when stale summary is clicked before load', () => {
    const staleDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-stale-details="true"]',
    )
    const cleanup = mountSidebarNavEnhancer()
    const summary = document.querySelector<HTMLElement>('[data-load-stale-characters="true"]')
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })

    expect(staleDetails?.open).toBe(false)
    expect(summary?.dispatchEvent(clickEvent)).toBe(false)
    expect(staleDetails?.open).toBe(true)

    cleanup()
  })

  it('requests stale loading then scrolls when stale link is clicked', () => {
    const scrollToHashWithoutWrite = vi.fn()
    const requestStaleVisibility = vi.fn((win, visibility: 'visible' | 'hidden') => {
      expect(visibility).toBe('visible')
      const staleSection = document.createElement('section')
      staleSection.id = 'section-stale'
      document.body.append(staleSection)
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.setAttribute('data-stale-visibility', 'visible')
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.setAttribute('data-stale-loaded', 'true')
      win.dispatchEvent(new Event('home:stale-loaded'))
    })

    const cleanup = mountSidebarNavEnhancer({
      deps: {
        scrollToHashWithoutWrite,
        requestStaleVisibility,
      },
    })

    const staleLink = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-sidebar-character-link="true"]'),
    ).find(link => link.getAttribute('href') === '#section-stale')
    staleLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(requestStaleVisibility).toHaveBeenCalledTimes(1)
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-stale')

    cleanup()
  })

  it('keeps deferred active links enabled and loads them on click', () => {
    document.querySelector<HTMLElement>('[data-sidebar-nav-panel="character"]')?.insertAdjacentHTML(
      'beforeend',
      `
        <li>
          <span data-sidebar-dot-for="title-beta" class="scale-0 opacity-0"></span>
          <a href="#section-beta" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="title-beta">Beta</a>
        </li>
      `,
    )
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <template data-active-sections-template="true">
          <h2 id="title-beta"></h2>
          <section id="section-beta"></section>
        </template>
      `,
    )

    const scrollToHashWithoutWrite = vi.fn()
    const requestActiveLoad = vi.fn(win => {
      const title = document.createElement('h2')
      title.id = 'title-beta'
      document.body.append(title)

      const section = document.createElement('section')
      section.id = 'section-beta'
      document.body.append(section)

      win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))
    })

    const cleanup = mountSidebarNavEnhancer({
      deps: {
        requestActiveLoad,
        scrollToHashWithoutWrite,
      },
    })

    const betaLink = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-sidebar-character-link="true"]'),
    ).find(link => link.getAttribute('href') === '#section-beta')

    expect(betaLink?.getAttribute('aria-disabled')).toBeNull()
    betaLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(requestActiveLoad).toHaveBeenCalledWith(window)
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-beta')

    cleanup()
    document.getElementById('title-beta')?.remove()
    document.getElementById('section-beta')?.remove()
    document.querySelector('template[data-active-sections-template="true"]')?.remove()
  })

  it('collapses stale sections when stale details close after content is loaded', () => {
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-loaded', 'true')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-visibility', 'visible')

    const requestStaleVisibility = vi.fn()
    const cleanup = mountSidebarNavEnhancer({
      deps: {
        requestStaleVisibility,
      },
    })

    const staleDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-stale-details="true"]',
    )
    staleDetails!.open = true
    staleDetails!.open = false
    staleDetails?.dispatchEvent(new Event('toggle'))

    expect(requestStaleVisibility).toHaveBeenCalledWith(window, 'hidden')

    cleanup()
  })

  it('opens stale details when stale sections are loaded externally', () => {
    const staleDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-stale-details="true"]',
    )
    expect(staleDetails?.open).toBe(false)

    const cleanup = mountSidebarNavEnhancer()
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-visibility', 'visible')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-loaded', 'true')
    window.dispatchEvent(
      new CustomEvent(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
        detail: { visibility: 'visible', loaded: true },
      }),
    )

    expect(staleDetails?.open).toBe(true)
    cleanup()
  })

  it('closes stale details when stale sections collapse externally', () => {
    const staleDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-stale-details="true"]',
    )
    staleDetails!.open = true

    const cleanup = mountSidebarNavEnhancer()
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-visibility', 'hidden')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-stale-loaded', 'false')
    window.dispatchEvent(
      new CustomEvent(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
        detail: { visibility: 'hidden', loaded: false },
      }),
    )

    expect(staleDetails?.open).toBe(false)
    cleanup()
  })
})
