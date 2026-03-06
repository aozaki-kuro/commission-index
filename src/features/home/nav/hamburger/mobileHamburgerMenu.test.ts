// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { MENU_TRANSITION_MS } from './constants'
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from './hamburgerMenuStateEvent'
import { mountMobileHamburgerMenu } from './mobileHamburgerMenu'

const renderMenu = () => {
  document.body.innerHTML = `
    <div
      data-mobile-hamburger="true"
      data-mobile-hamburger-mounted="false"
      data-mobile-hamburger-open="false"
      data-mobile-hamburger-active-count="2"
      data-mobile-hamburger-stale-count="1"
      data-mobile-hamburger-timeline-count="3"
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
          <span data-mobile-hamburger-view-mode-indicator="true" class="scale-0 opacity-0"></span>
        </button>
        <div data-mobile-nav-root="true">
          <section data-mobile-character-section="active">
            <button data-mobile-character-section-toggle="true" data-mobile-character-section-key="active" aria-expanded="true">
              <span data-mobile-character-section-chevron="true" class="rotate-180"></span>
            </button>
            <div data-mobile-character-section-panel="active"></div>
          </section>
          <section data-mobile-character-section="stale">
            <button data-mobile-character-section-toggle="true" data-mobile-character-section-key="stale" aria-expanded="false">
              <span data-mobile-character-section-chevron="true"></span>
            </button>
            <div data-mobile-character-section-panel="stale" hidden></div>
          </section>
          <div data-mobile-hamburger-nav-panel="character"></div>
          <div data-mobile-hamburger-nav-panel="timeline" class="hidden"></div>
          <a href="#active-item" data-mobile-nav-link="true" data-mobile-nav-section-id="active-item">Active</a>
          <a href="/?view=timeline#year-2025" data-mobile-nav-link="true" data-mobile-nav-section-id="year-2025">Year</a>
        </div>
      </div>
    </div>
  `
}

const getRoot = () => document.querySelector<HTMLElement>('[data-mobile-hamburger="true"]')
const getToggle = () =>
  document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-toggle="true"]')
const getBackdrop = () =>
  document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-backdrop="true"]')
const getSearchAction = () =>
  document.querySelector<HTMLButtonElement>('[data-mobile-hamburger-search-action="true"]')
const getTimelineToggle = () =>
  document.querySelector<HTMLButtonElement>(
    '[data-mobile-hamburger-view-mode-toggle="true"][data-view-mode="timeline"]',
  )

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
      if (!(event instanceof CustomEvent)) return
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
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.hamburgerMenuUsed, {
      active_count: 2,
      stale_count: 1,
    })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'search_link',
      nav_surface: 'hamburger',
      view_mode: 'character',
      item_count: 3,
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

  it('re-syncs link availability on sidebar search state and view mode event', () => {
    const syncLinkAvailability = vi.fn()
    const cleanup = mountMobileHamburgerMenu({
      deps: { syncLinkAvailability },
    })

    expect(syncLinkAvailability).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))
    expect(syncLinkAvailability).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
    expect(syncLinkAvailability).toHaveBeenCalledTimes(3)

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
