import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import {
  parseCommissionViewModeFromSearch,
  type CommissionViewMode,
} from '#features/home/commission/CommissionViewModeSearch'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import { MENU_TRANSITION_MS } from './constants'
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from './hamburgerMenuStateEvent'

const ROOT_SELECTOR = '[data-mobile-hamburger="true"]'
const TOGGLE_SELECTOR = '[data-mobile-hamburger-toggle="true"]'
const TOGGLE_LABEL_SELECTOR = '[data-mobile-hamburger-toggle-label]'
const TOGGLE_ICON_SELECTOR = '[data-mobile-hamburger-toggle-icon="true"]'
const MENU_ICON_SELECTOR = '[data-mobile-hamburger-icon-menu="true"]'
const CLOSE_ICON_SELECTOR = '[data-mobile-hamburger-icon-close="true"]'
const BACKDROP_SELECTOR = '[data-mobile-hamburger-backdrop="true"]'
const PANEL_SELECTOR = '[data-mobile-hamburger-panel="true"]'
const SEARCH_ACTION_SELECTOR = '[data-mobile-hamburger-search-action="true"]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-mobile-hamburger-view-mode-toggle="true"]'
const NAV_PANEL_SELECTOR = '[data-mobile-hamburger-nav-panel]'
const NAV_ROOT_SELECTOR = '[data-mobile-nav-root="true"]'
const NAV_LINK_SELECTOR = '[data-mobile-nav-link="true"]'
const CHARACTER_SECTION_SELECTOR = '[data-mobile-character-section]'
const CHARACTER_SECTION_TOGGLE_SELECTOR = '[data-mobile-character-section-toggle="true"]'

type MobileHamburgerMenuDeps = {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  syncLinkAvailability: typeof syncHiddenSectionLinkAvailability
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

type MountMobileHamburgerMenuOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<MobileHamburgerMenuDeps>
}

type CharacterSectionKey = 'active' | 'stale'

const defaultDeps: MobileHamburgerMenuDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  syncLinkAvailability: syncHiddenSectionLinkAvailability,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

const replaceCommissionViewModeInAddress = (win: Window, mode: CommissionViewMode) => {
  const url = new URL(win.location.href)
  if (mode === 'timeline') {
    url.searchParams.set('view', 'timeline')
  } else {
    url.searchParams.delete('view')
  }

  win.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  win.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
}

const resolveViewModeFromElement = (target: Element | null): CommissionViewMode | null => {
  if (!target) return null
  const mode = target.getAttribute('data-view-mode')
  if (mode === 'character' || mode === 'timeline') return mode
  return null
}

const resolveCharacterSectionKeyFromElement = (
  target: Element | null,
): CharacterSectionKey | null => {
  if (!target) return null
  const key = target.getAttribute('data-mobile-character-section-key')
  if (key === 'active' || key === 'stale') return key
  return null
}

const readCount = (rawValue: string | undefined) => {
  if (!rawValue) return 0
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

const readCurrentMode = (win: Window) => parseCommissionViewModeFromSearch(win.location.search)

const setHtmlScrollLocked = (doc: Document, locked: boolean) => {
  const html = doc.documentElement
  html.classList.toggle('overflow-hidden', locked)
  html.classList.toggle('touch-none', locked)
}

const syncViewModeIndicatorState = (button: HTMLButtonElement, active: boolean) => {
  button.setAttribute('aria-pressed', String(active))
  button.classList.toggle('text-gray-900', active)
  button.classList.toggle('dark:text-white', active)
  button.classList.toggle('text-gray-700', !active)
  button.classList.toggle('dark:text-gray-200', !active)

  const indicator = button.querySelector<HTMLElement>('[data-mobile-hamburger-view-mode-indicator]')
  if (!indicator) return

  indicator.classList.toggle('scale-100', active)
  indicator.classList.toggle('opacity-100', active)
  indicator.classList.toggle('scale-0', !active)
  indicator.classList.toggle('opacity-0', !active)
}

export const mountMobileHamburgerMenu = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountMobileHamburgerMenuOptions = {}) => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const root = doc.querySelector<HTMLElement>(ROOT_SELECTOR)
  const toggle = root?.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR) ?? null
  const toggleLabel = root?.querySelector<HTMLElement>(TOGGLE_LABEL_SELECTOR) ?? null
  const toggleIcon = root?.querySelector<SVGElement>(TOGGLE_ICON_SELECTOR) ?? null
  const menuIcon = root?.querySelector<SVGPathElement>(MENU_ICON_SELECTOR) ?? null
  const closeIcon = root?.querySelector<SVGPathElement>(CLOSE_ICON_SELECTOR) ?? null
  const backdrop = root?.querySelector<HTMLButtonElement>(BACKDROP_SELECTOR) ?? null
  const panel = root?.querySelector<HTMLElement>(PANEL_SELECTOR) ?? null
  const navRoot = root?.querySelector<HTMLElement>(NAV_ROOT_SELECTOR) ?? null
  const searchAction = root?.querySelector<HTMLButtonElement>(SEARCH_ACTION_SELECTOR) ?? null
  if (!root || !toggle || !toggleLabel || !backdrop || !panel || !navRoot || !searchAction)
    return () => {}

  const activeCount = readCount(root.dataset.mobileHamburgerActiveCount)
  const staleCount = readCount(root.dataset.mobileHamburgerStaleCount)
  const timelineCount = readCount(root.dataset.mobileHamburgerTimelineCount)
  const openNavigationLabel = root.dataset.mobileHamburgerOpenLabel ?? 'Open navigation menu'
  const closeNavigationLabel = root.dataset.mobileHamburgerCloseLabel ?? 'Close navigation menu'

  let open = false
  let mounted = false
  let disposed = false
  let closeTimerId: number | null = null
  let openRafId: number | null = null
  let hasTrackedHamburgerUsage = false
  let hasTrackedSearchUsage = false
  let didHandleSearchPointerDown = false
  let expandedCharacterSection: CharacterSectionKey = 'active'

  const clearCloseTimer = () => {
    if (closeTimerId === null) return
    win.clearTimeout(closeTimerId)
    closeTimerId = null
  }

  const clearOpenRaf = () => {
    if (openRafId === null) return
    win.cancelAnimationFrame(openRafId)
    openRafId = null
  }

  const dispatchMountedChange = (nextMounted: boolean) => {
    win.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, {
        detail: { mounted: nextMounted },
      }),
    )
  }

  const syncOpenState = () => {
    const isVisible = mounted

    root.dataset.mobileHamburgerMounted = isVisible ? 'true' : 'false'
    root.dataset.mobileHamburgerOpen = open ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? closeNavigationLabel : openNavigationLabel)
    toggleLabel.textContent = open ? closeNavigationLabel : openNavigationLabel
    panel.setAttribute('aria-hidden', String(!open))

    backdrop.classList.toggle('hidden', !isVisible)
    panel.classList.toggle('hidden', !isVisible)

    backdrop.classList.toggle('pointer-events-auto', open)
    backdrop.classList.toggle('opacity-100', open)
    backdrop.classList.toggle('pointer-events-none', !open)
    backdrop.classList.toggle('opacity-0', !open)

    panel.classList.toggle('pointer-events-auto', open)
    panel.classList.toggle('translate-y-0', open)
    panel.classList.toggle('opacity-100', open)
    panel.classList.toggle('pointer-events-none', !open)
    panel.classList.toggle('opacity-0', !open)

    if (toggleIcon) {
      toggleIcon.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)'
    }
    menuIcon?.classList.toggle('hidden', open)
    closeIcon?.classList.toggle('hidden', !open)

    setHtmlScrollLocked(doc, open)
  }

  const setMounted = (nextMounted: boolean) => {
    if (mounted === nextMounted) return
    mounted = nextMounted
    syncOpenState()
    dispatchMountedChange(nextMounted)
  }

  const closeMenu = () => {
    clearOpenRaf()
    open = false
    syncOpenState()
    clearCloseTimer()
    closeTimerId = win.setTimeout(() => {
      closeTimerId = null
      setMounted(false)
    }, MENU_TRANSITION_MS)
  }

  const openMenu = () => {
    if (!hasTrackedHamburgerUsage) {
      hasTrackedHamburgerUsage = true
      deps.trackEvent(ANALYTICS_EVENTS.hamburgerMenuUsed, {
        active_count: activeCount,
        stale_count: staleCount,
      })
    }

    clearCloseTimer()
    clearOpenRaf()
    setMounted(true)
    openRafId = win.requestAnimationFrame(() => {
      open = true
      syncOpenState()
      openRafId = null
    })
  }

  const toggleMenu = () => {
    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }

  const syncCharacterSectionState = () => {
    const sections = root.querySelectorAll<HTMLElement>(CHARACTER_SECTION_SELECTOR)
    sections.forEach(section => {
      const key = section.dataset.mobileCharacterSection as CharacterSectionKey | undefined
      if (!key) return

      const expanded = key === expandedCharacterSection
      const trigger = section.querySelector<HTMLButtonElement>(CHARACTER_SECTION_TOGGLE_SELECTOR)
      const panel = section.querySelector<HTMLElement>(
        `[data-mobile-character-section-panel="${key}"]`,
      )
      const chevron = section.querySelector<HTMLElement>(
        '[data-mobile-character-section-chevron="true"]',
      )

      trigger?.setAttribute('aria-expanded', String(expanded))
      if (panel) panel.hidden = !expanded
      chevron?.classList.toggle('rotate-180', expanded)
    })
  }

  const syncViewModeState = () => {
    const mode = readCurrentMode(win)
    const toggles = root.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    toggles.forEach(button => {
      const buttonMode = resolveViewModeFromElement(button)
      syncViewModeIndicatorState(button, buttonMode === mode)
    })

    const panels = root.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR)
    panels.forEach(currentPanel => {
      currentPanel.classList.toggle('hidden', currentPanel.dataset.mobileHamburgerNavPanel !== mode)
    })
  }

  const syncLinkAvailability = () => {
    deps.syncLinkAvailability({
      root: navRoot,
      linkSelector: NAV_LINK_SELECTOR,
      getSectionId: link => link.dataset.mobileNavSectionId ?? null,
    })
  }

  const syncUiState = () => {
    syncViewModeState()
    syncCharacterSectionState()
    syncLinkAvailability()
  }

  const getVisibleItemCount = (mode: CommissionViewMode) =>
    mode === 'timeline' ? timelineCount : activeCount + staleCount

  const runSearchAction = () => {
    const mode = readCurrentMode(win)
    if (!hasTrackedSearchUsage) {
      hasTrackedSearchUsage = true
      deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source: 'search_link',
        nav_surface: 'hamburger',
        view_mode: mode,
        item_count: getVisibleItemCount(mode),
      })
    }

    setHtmlScrollLocked(doc, false)
    deps.jumpToSearch({ topGap: 40, focusMode: 'immediate' })
    closeMenu()
  }

  const onRootPointerDown = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const actionButton = target.closest<HTMLButtonElement>(SEARCH_ACTION_SELECTOR)
    if (!actionButton) return

    event.preventDefault()
    didHandleSearchPointerDown = true
    runSearchAction()
  }

  const onRootClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const clickedToggle = target.closest<HTMLButtonElement>(TOGGLE_SELECTOR)
    if (clickedToggle) {
      toggleMenu()
      return
    }

    const viewModeToggle = target.closest<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    if (viewModeToggle) {
      const currentMode = readCurrentMode(win)
      const nextMode = resolveViewModeFromElement(viewModeToggle)
      if (!nextMode) return

      deps.trackEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
        from_mode: currentMode,
        to_mode: nextMode,
        already_active: currentMode === nextMode,
      })

      if (currentMode !== nextMode) {
        replaceCommissionViewModeInAddress(win, nextMode)
      } else {
        syncUiState()
      }
      return
    }

    const characterSectionToggle = target.closest<HTMLButtonElement>(
      CHARACTER_SECTION_TOGGLE_SELECTOR,
    )
    if (characterSectionToggle) {
      const sectionKey = resolveCharacterSectionKeyFromElement(characterSectionToggle)
      if (!sectionKey) return
      expandedCharacterSection = sectionKey
      syncCharacterSectionState()
      return
    }

    const searchButton = target.closest<HTMLButtonElement>(SEARCH_ACTION_SELECTOR)
    if (searchButton) {
      if (didHandleSearchPointerDown) {
        didHandleSearchPointerDown = false
        return
      }
      runSearchAction()
      return
    }

    const navLink = target.closest<HTMLAnchorElement>(NAV_LINK_SELECTOR)
    if (!navLink) return
    if (navLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    const mode = readCurrentMode(win)
    const sectionId = navLink.dataset.mobileNavSectionId ?? 'unknown'
    const characterName = navLink.textContent?.trim() || 'unknown'

    if (mode === 'timeline') {
      event.preventDefault()
      deps.scrollToHashWithoutWrite(navLink.getAttribute('href'))
    }

    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      nav_surface: 'hamburger',
      view_mode: mode,
      item_count: getVisibleItemCount(mode),
      character_name: characterName,
      section_id: sectionId,
    })

    closeMenu()
  }

  const onBackdropClick = () => {
    closeMenu()
  }

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    closeMenu()
  }

  const onViewModeChanged = () => {
    syncUiState()
  }

  const onSearchStateChanged = () => {
    syncLinkAvailability()
  }

  const onPopState = () => {
    syncUiState()
  }

  root.addEventListener('pointerdown', onRootPointerDown)
  root.addEventListener('click', onRootClick)
  backdrop.addEventListener('click', onBackdropClick)
  doc.addEventListener('keydown', onDocumentKeyDown)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSearchStateChanged)
  win.addEventListener('popstate', onPopState)

  syncUiState()
  syncOpenState()

  return () => {
    if (disposed) return
    disposed = true

    clearCloseTimer()
    clearOpenRaf()
    setHtmlScrollLocked(doc, false)
    if (mounted) {
      mounted = false
      dispatchMountedChange(false)
    }

    root.removeEventListener('pointerdown', onRootPointerDown)
    root.removeEventListener('click', onRootClick)
    backdrop.removeEventListener('click', onBackdropClick)
    doc.removeEventListener('keydown', onDocumentKeyDown)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSearchStateChanged)
    win.removeEventListener('popstate', onPopState)
  }
}
