import {
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
} from '@features/home/commission/archivedCharactersState'
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MENU_TRANSITION_MS } from './constants'
import { mountMobileHamburgerMenu } from './mobileHamburgerMenu'

function renderMenu() {
  document.body.innerHTML = `
    <div
      data-mobile-hamburger="true"
      data-mobile-hamburger-mounted="false"
      data-mobile-hamburger-open="false"
      data-mobile-hamburger-open-label="Open navigation menu"
      data-mobile-hamburger-close-label="Close navigation menu"
    >
      <button data-mobile-hamburger-backdrop="true" class="hidden pointer-events-none opacity-0"></button>
      <button data-mobile-hamburger-toggle="true" aria-expanded="false">
        <span data-mobile-hamburger-toggle-label>Open navigation menu</span>
        <svg data-mobile-hamburger-toggle-icon="true">
          <path data-mobile-hamburger-icon-menu="true"></path>
          <path data-mobile-hamburger-icon-close="true" class="hidden"></path>
        </svg>
      </button>
      <div data-mobile-hamburger-panel="true" aria-hidden="true" class="hidden pointer-events-none opacity-0">
        <button data-mobile-hamburger-search-action="true">Search</button>
        <button data-mobile-hamburger-view-mode-toggle="true" data-view-mode="character" aria-pressed="true">
          <span data-mobile-hamburger-view-mode-indicator="true" class="scale-100 opacity-100"></span>
        </button>
        <button data-mobile-hamburger-view-mode-toggle="true" data-view-mode="timeline" aria-pressed="false">
          <span data-mobile-hamburger-view-mode-indicator="true" class="scale-95 opacity-0"></span>
        </button>
        <div data-mobile-nav-root="true">
          <section data-mobile-character-section="active">
            <button data-mobile-character-section-toggle="true" data-mobile-character-section-key="active" aria-expanded="true">
              <span data-mobile-character-section-chevron="true" class="rotate-180"></span>
            </button>
            <div data-mobile-character-section-panel="active"></div>
          </section>
          <section data-mobile-character-section="archived">
            <button data-mobile-character-section-toggle="true" data-mobile-character-section-key="archived" aria-expanded="false">
              <span data-mobile-character-section-chevron="true"></span>
            </button>
            <div data-mobile-character-section-panel="archived" hidden>
              <a
                href="#archived-item"
                data-mobile-nav-link="true"
                data-mobile-nav-character-status="archived"
                data-mobile-nav-section-id="archived-item"
              >
                Archived
              </a>
            </div>
          </section>
          <div data-mobile-hamburger-nav-panel="character"></div>
          <div data-mobile-hamburger-nav-panel="timeline" class="hidden"></div>
          <a
            href="#active-item"
            data-mobile-nav-link="true"
            data-mobile-nav-character-status="active"
            data-mobile-nav-section-id="active-item"
          >
            Active
          </a>
          <a
            href="#empty-item"
            data-mobile-nav-link="true"
            data-mobile-nav-character-status="active"
            data-mobile-nav-section-id="empty-item"
          >
            Empty
          </a>
          <a href="/?view=timeline#year-2025" data-mobile-nav-link="true" data-mobile-nav-section-id="year-2025">Year</a>
        </div>
      </div>
    </div>
    <section id="active-item"></section>
    <section id="empty-item" data-total-commissions="0"></section>
  `
}

const getRoot = () => document.querySelector<HTMLElement>('[data-mobile-hamburger="true"]')
function getToggle() {
  return document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-toggle="true"]')
}
function getBackdrop() {
  return document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-backdrop="true"]')
}
function getSearchAction() {
  return document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-search-action="true"]')
}
function getTimelineToggle() {
  return document.querySelector<HTMLButtonElement>(
    '[data-mobile-hamburger-view-mode-toggle="true"][data-view-mode="timeline"]',
  )
}
function getArchivedSectionToggle() {
  return document.querySelector<HTMLButtonElement>(
    '[data-mobile-character-section-toggle="true"][data-mobile-character-section-key="archived"]',
  )
}
function getArchivedSectionPanel() {
  return document.querySelector<HTMLElement>('[data-mobile-character-section-panel="archived"]')
}
function getArchivedLink() {
  return document.querySelector<HTMLAnchorElement>(
    '[data-mobile-nav-link="true"][data-mobile-nav-character-status="archived"]',
  )
}
function getEmptyActiveLink() {
  return [
    ...document.querySelectorAll<HTMLAnchorElement>('[data-mobile-nav-link="true"]'),
  ]
    .find(link => link.dataset.mobileNavSectionId === 'empty-item') ?? null
}
describe('mobileHamburgerMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    window.history.replaceState(null, '', '/')
    document.documentElement.className = ''
    renderMenu()
  })

  it('opens and closes with mounted state events and html scroll lock', () => {
    const mountedEvents: boolean[] = []
    const onMountedChanged = (event: Event) => {
      if (!(event instanceof CustomEvent))
        return
      mountedEvents.push(Boolean((event.detail as { mounted?: boolean }).mounted))
    }

    window.addEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onMountedChanged)
    const cleanup = mountMobileHamburgerMenu()

    getToggle()!.click()
    expect(getRoot()?.dataset.mobileHamburgerMounted).toBe('true')
    expect(getRoot()?.dataset.mobileHamburgerOpen).toBe('true')
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(true)
    expect(mountedEvents).toEqual([true])

    getBackdrop()!.click()
    expect(getRoot()?.dataset.mobileHamburgerOpen).toBe('false')
    vi.advanceTimersByTime(MENU_TRANSITION_MS)
    expect(getRoot()?.dataset.mobileHamburgerMounted).toBe('false')
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(false)
    expect(mountedEvents).toEqual([true, false])

    cleanup()
    window.removeEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onMountedChanged)
  })

  it('runs search action on pointerdown and keeps analytics payloads', () => {
    const trackEvent = vi.fn()
    const jumpToSearch = vi.fn()
    const syncLinkAvailability = vi.fn()

    const cleanup = mountMobileHamburgerMenu({
      deps: { trackEvent, jumpToSearch, syncLinkAvailability },
    })

    getToggle()!.click()
    getSearchAction()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    expect(jumpToSearch).toHaveBeenCalledWith({ topGap: 40, focusMode: 'immediate' })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'search_link',
      layout: 'mobile',
      view_mode: 'character',
    })

    vi.advanceTimersByTime(MENU_TRANSITION_MS)
    cleanup()
  })

  it('switches view mode from menu and syncs aria state', () => {
    const cleanup = mountMobileHamburgerMenu()
    const timelineToggle = getTimelineToggle()

    timelineToggle!.click()

    expect(window.location.search).toBe('?view=timeline')
    expect(timelineToggle?.getAttribute('aria-pressed')).toBe('true')

    cleanup()
  })

  it('disables menu links for characters without commissions', () => {
    const cleanup = mountMobileHamburgerMenu()

    expect(getEmptyActiveLink()?.getAttribute('aria-disabled')).toBe('true')
    expect(getEmptyActiveLink()?.tabIndex).toBe(-1)

    cleanup()
  })

  it('lets the archived section toggle collapse back shut without hiding archived content', () => {
    const requestArchivedVisibility = vi.fn()
    const cleanup = mountMobileHamburgerMenu({
      deps: { requestArchivedVisibility },
    })

    getToggle()!.click()
    getArchivedSectionToggle()!.click()
    getArchivedSectionToggle()!.click()

    expect(requestArchivedVisibility).toHaveBeenCalledTimes(1)
    expect(getArchivedSectionToggle()?.getAttribute('aria-expanded')).toBe('false')
    expect(getArchivedSectionPanel()?.hidden).toBe(true)

    cleanup()
  })

  it('reveals archived characters and jumps when an archived link is selected while collapsed', () => {
    const trackEvent = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()
    const requestArchivedVisibility = vi.fn(() => {
      const archivedSection = document.createElement('section')
      archivedSection.id = 'archived-item'
      document.body.append(archivedSection)
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.setAttribute('data-archived-visibility', 'visible')
      window.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible' },
        }),
      )
    })

    const cleanup = mountMobileHamburgerMenu({
      deps: { requestArchivedVisibility, scrollToHashWithoutWrite, trackEvent },
    })

    getToggle()!.click()
    getArchivedLink()!.click()

    expect(requestArchivedVisibility).toHaveBeenCalledWith(window, 'visible')
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#archived-item')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      layout: 'mobile',
      view_mode: 'character',
    })
    expect(getRoot()?.dataset.mobileHamburgerOpen).toBe('false')

    vi.advanceTimersByTime(MENU_TRANSITION_MS)
    cleanup()
  })

  it('leaves modified clicks on menu links to the browser', () => {
    const trackEvent = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()
    const requestArchivedVisibility = vi.fn()
    const cleanup = mountMobileHamburgerMenu({
      deps: { requestArchivedVisibility, scrollToHashWithoutWrite, trackEvent },
    })

    getToggle()!.click()
    trackEvent.mockClear()
    const link = getArchivedLink()!
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { button: 1 },
    ]) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
      link.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(requestArchivedVisibility).not.toHaveBeenCalled()
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(getRoot()?.dataset.mobileHamburgerOpen).toBe('true')

    vi.advanceTimersByTime(MENU_TRANSITION_MS)
    cleanup()
  })

  it('hides and disables the hamburger menu while age gate is open', () => {
    const cleanup = mountMobileHamburgerMenu()
    const toggle = getToggle()
    const root = getRoot()

    window.dispatchEvent(
      new CustomEvent('age-gate-state-change', {
        detail: { open: true },
      }),
    )

    expect(root?.classList.contains('invisible')).toBe(true)
    expect(root?.classList.contains('pointer-events-none')).toBe(true)
    expect(toggle?.disabled).toBe(true)

    toggle!.click()
    expect(root?.dataset.mobileHamburgerMounted).toBe('false')
    expect(root?.dataset.mobileHamburgerOpen).toBe('false')

    window.dispatchEvent(
      new CustomEvent('age-gate-state-change', {
        detail: { open: false },
      }),
    )

    expect(root?.classList.contains('invisible')).toBe(false)
    expect(toggle?.disabled).toBe(false)

    cleanup()
  })
})
