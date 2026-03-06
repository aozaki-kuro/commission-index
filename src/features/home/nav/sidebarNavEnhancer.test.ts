// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
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
          <a href="#section-alpha" data-sidebar-character-link="true" data-sidebar-title-id="title-alpha">Alpha</a>
        </li>
      </ul>
      <ul data-sidebar-nav-panel="timeline" class="hidden">
        <li>
          <span data-sidebar-dot-for="timeline-title-2026" class="scale-0 opacity-0"></span>
          <a href="#timeline-year-2026" data-sidebar-character-link="true" data-sidebar-title-id="timeline-title-2026">2026</a>
        </li>
      </ul>
    </div>
    <h2 id="title-introduction"></h2>
    <h2 id="title-alpha"></h2>
    <section id="section-alpha"></section>
    <h2 id="timeline-title-2026"></h2>
    <section id="timeline-year-2026"></section>
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
})
