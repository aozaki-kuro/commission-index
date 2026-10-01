import {
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
} from '@features/home/commission/loader/archivedCharactersEvent'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '@features/home/events'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarNavEnhancer } from './sidebarNavEnhancer'

function renderSidebarRoot() {
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
          <span data-sidebar-dot-for="title-empty" class="scale-0 opacity-0"></span>
          <a href="#section-empty" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="title-empty">Empty</a>
        </li>
        <li>
          <details data-sidebar-archived-details="true">
            <summary data-load-archived-characters="true">Archived Characters</summary>
            <span data-sidebar-dot-for="title-archived" class="scale-0 opacity-0"></span>
            <a href="#section-archived" data-sidebar-character-link="true" data-sidebar-character-status="archived" data-sidebar-title-id="title-archived">Archived</a>
          </details>
        </li>
      </ul>
      <ul data-sidebar-nav-panel="timeline" class="hidden">
        <li>
          <span data-sidebar-dot-for="timeline-title-2026" class="scale-0 opacity-0"></span>
          <a href="#timeline-year-2026" data-sidebar-character-link="true" data-sidebar-character-status="active" data-sidebar-title-id="timeline-title-2026">2026</a>
        </li>
      </ul>
      <button
        data-sidebar-back-to-top-button="true"
        class="pointer-events-none opacity-0 translate-y-1"
      >
        Back to top
      </button>
    </div>
    <h2 id="title-introduction"></h2>
    <h2 id="title-alpha"></h2>
    <section id="section-alpha"></section>
    <h2 id="title-empty"></h2>
    <section id="section-empty" data-total-commissions="0"></section>
    <h2 id="timeline-title-2026"></h2>
    <section id="timeline-year-2026"></section>
    <div data-commission-view-panel="character" data-archived-loaded="false" data-archived-visibility="hidden"></div>
  `
}

describe('sidebarNavEnhancer', () => {
  beforeEach(() => {
    renderSidebarRoot()
    window.history.replaceState(null, '', '/')

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
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
        ?.classList
        .contains('hidden'),
    ).toBe(true)
    expect(
      document
        .querySelector<HTMLElement>('[data-sidebar-nav-panel="timeline"]')
        ?.classList
        .contains('hidden'),
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

  it('disables sidebar links for characters without commissions', () => {
    const cleanup = mountSidebarNavEnhancer()

    const emptyLink = [...document.querySelectorAll<HTMLAnchorElement>('[data-sidebar-character-link="true"]')]
      .find(link => link.getAttribute('href') === '#section-empty')

    expect(emptyLink?.getAttribute('aria-disabled')).toBe('true')
    expect(emptyLink?.tabIndex).toBe(-1)

    cleanup()
  })

  it('does not light the active dot for disabled empty characters', () => {
    const title = document.getElementById('title-alpha')
    const emptyTitle = document.getElementById('title-empty')
    const introduction = document.getElementById('title-introduction')

    emptyTitle!.getBoundingClientRect = () => new DOMRect(0, 180, 200, 40)
    emptyTitle!.getClientRects = () =>
      [emptyTitle!.getBoundingClientRect()] as unknown as DOMRectList
    title!.getBoundingClientRect = () => new DOMRect(0, 900, 200, 40)
    title!.getClientRects = () => [title!.getBoundingClientRect()] as unknown as DOMRectList
    introduction!.getBoundingClientRect = () => new DOMRect(0, -200, 200, 100)
    introduction!.getClientRects = () =>
      [introduction!.getBoundingClientRect()] as unknown as DOMRectList

    Object.defineProperty(window, 'scrollY', { value: 300, writable: true })

    const cleanup = mountSidebarNavEnhancer()
    window.dispatchEvent(new Event('scroll'))

    const emptyDot = document.querySelector<HTMLElement>('[data-sidebar-dot-for="title-empty"]')
    expect(emptyDot?.classList.contains('scale-100')).toBe(false)
    expect(emptyDot?.classList.contains('opacity-100')).toBe(false)

    cleanup()
  })

  it('updates active dots on scroll', () => {
    const title = document.getElementById('title-alpha')
    const introduction = document.getElementById('title-introduction')

    title!.getBoundingClientRect = () => new DOMRect(0, 200, 200, 40)
    title!.getClientRects = () => [title!.getBoundingClientRect()] as unknown as DOMRectList
    introduction!.getBoundingClientRect = () => new DOMRect(0, -200, 200, 100)
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

  it('reveals back-to-top button on scroll and scrolls to top when clicked', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const onRestoreAbort = vi.fn()
    window.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)

    const cleanup = mountSidebarNavEnhancer()
    const backToTopButton = document.querySelector<HTMLButtonElement>(
      '[data-sidebar-back-to-top-button="true"]',
    )
    expect(backToTopButton?.classList.contains('opacity-0')).toBe(true)
    expect(backToTopButton?.classList.contains('pointer-events-none')).toBe(true)

    window.scrollY = 500
    window.dispatchEvent(new Event('scroll'))

    expect(backToTopButton?.classList.contains('opacity-100')).toBe(true)
    expect(backToTopButton?.classList.contains('pointer-events-auto')).toBe(true)

    backToTopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onRestoreAbort).toHaveBeenCalledTimes(1)
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    })

    cleanup()
    scrollToSpy.mockRestore()
    window.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)
  })

  it('requests archived loading then scrolls when archived link is clicked', () => {
    const scrollToHashWithoutWrite = vi.fn()
    const onRestoreAbort = vi.fn()
    const requestArchivedVisibility = vi.fn((win, visibility: 'visible' | 'hidden') => {
      expect(visibility).toBe('visible')
      const archivedSection = document.createElement('section')
      archivedSection.id = 'section-archived'
      document.body.append(archivedSection)
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.setAttribute('data-archived-visibility', 'visible')
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.setAttribute('data-archived-loaded', 'false')
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible', loaded: false },
        }),
      )
    })
    window.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)

    const cleanup = mountSidebarNavEnhancer({
      deps: {
        scrollToHashWithoutWrite,
        requestArchivedVisibility,
      },
    })

    const archivedLink = [...document.querySelectorAll<HTMLAnchorElement>('[data-sidebar-character-link="true"]')].find(link => link.getAttribute('href') === '#section-archived')
    archivedLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(requestArchivedVisibility).toHaveBeenCalledTimes(1)
    expect(onRestoreAbort).toHaveBeenCalledTimes(1)
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-archived')

    cleanup()
    window.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, onRestoreAbort)
  })

  it('collapses archived sections when archived details close after content is loaded', () => {
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-archived-loaded', 'true')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-archived-visibility', 'visible')

    const requestArchivedVisibility = vi.fn()
    const cleanup = mountSidebarNavEnhancer({
      deps: {
        requestArchivedVisibility,
      },
    })

    const archivedDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-archived-details="true"]',
    )
    archivedDetails!.open = true
    archivedDetails!.open = false
    archivedDetails?.dispatchEvent(new Event('toggle'))

    expect(requestArchivedVisibility).toHaveBeenCalledWith(window, 'hidden')

    cleanup()
  })

  it('closes archived details when archived sections collapse externally', () => {
    const archivedDetails = document.querySelector<HTMLDetailsElement>(
      '[data-sidebar-archived-details="true"]',
    )
    archivedDetails!.open = true

    const cleanup = mountSidebarNavEnhancer()
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-archived-visibility', 'hidden')
    document
      .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
      ?.setAttribute('data-archived-loaded', 'false')
    window.dispatchEvent(
      new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
        detail: { visibility: 'hidden', loaded: false },
      }),
    )

    expect(archivedDetails?.open).toBe(false)
    cleanup()
  })
})
