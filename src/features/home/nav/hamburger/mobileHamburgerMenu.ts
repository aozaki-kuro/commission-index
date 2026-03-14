import type { RequestActiveCharactersLoadOptions } from '#features/home/commission/activeCharactersEvent'
import type { CommissionViewMode } from '#features/home/commission/CommissionViewModeSearch'
import type { RequestStaleCharactersLoadOptions, StaleCharactersVisibility } from '#features/home/commission/staleCharactersEvent'
import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  hasDeferredActiveCharacterTarget,
  requestActiveCharactersLoad,

} from '#features/home/commission/activeCharactersEvent'
import {
  prefetchDeferredActiveCharacterTarget,
  prefetchDeferredStaleCharacterTarget,
} from '#features/home/commission/deferredCharacterBatchPrefetch'
import {
  hasDeferredStaleCharacterTarget,
  hasStaleCharacterTarget,
  isStaleCharactersVisible,
  requestStaleCharactersLoad,

  requestStaleCharactersVisibility,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,

} from '#features/home/commission/staleCharactersEvent'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '#features/home/commission/viewModeState'
import { dispatchHomeScrollRestoreAbort } from '#features/home/homeScrollRestoreAbort'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
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
const AGE_GATE_ROOT_SELECTOR = '[data-age-gate-root]'
const AGE_GATE_STATE_EVENT = 'age-gate-state-change'

interface MobileHamburgerMenuDeps {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  syncLinkAvailability: typeof syncHiddenSectionLinkAvailability
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  prefetchActiveTarget: (doc: Document, targetId: string | null | undefined) => void
  prefetchStaleTarget: (doc: Document, targetId: string | null | undefined) => void
  requestActiveLoad: (win: Window, options?: RequestActiveCharactersLoadOptions) => void
  requestStaleLoad: (win: Window, options?: RequestStaleCharactersLoadOptions) => void
  requestStaleVisibility: (win: Window, visibility: StaleCharactersVisibility) => void
}

interface MountMobileHamburgerMenuOptions {
  win?: Window
  doc?: Document
  deps?: Partial<MobileHamburgerMenuDeps>
}

type CharacterSectionKey = 'active' | 'stale'
interface CharacterSectionNode {
  key: CharacterSectionKey
  trigger: HTMLButtonElement | null
  panel: HTMLElement | null
  chevron: HTMLElement | null
}

const defaultDeps: MobileHamburgerMenuDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  syncLinkAvailability: syncHiddenSectionLinkAvailability,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  prefetchActiveTarget: prefetchDeferredActiveCharacterTarget,
  prefetchStaleTarget: prefetchDeferredStaleCharacterTarget,
  requestActiveLoad: requestActiveCharactersLoad,
  requestStaleLoad: requestStaleCharactersLoad,
  requestStaleVisibility: requestStaleCharactersVisibility,
}

function resolveCharacterSectionKeyFromElement(target: Element | null): CharacterSectionKey | null {
  if (!target)
    return null
  const key = target.getAttribute('data-mobile-character-section-key')
  if (key === 'active' || key === 'stale')
    return key
  return null
}

function resolveCharacterSectionKeyFromValue(value: string | undefined): CharacterSectionKey | null {
  if (value === 'active' || value === 'stale')
    return value
  return null
}

function resolveViewModeFromPanel(panel: HTMLElement): CommissionViewMode | null {
  const mode = panel.dataset.mobileHamburgerNavPanel
  if (mode === 'character' || mode === 'timeline')
    return mode
  return null
}

function readCount(rawValue: string | undefined) {
  if (!rawValue)
    return 0
  const value = Number(rawValue)
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.floor(value))
}

function readAgeGateOpen(doc: Document) {
  if (doc.documentElement.dataset.ageGateOpen === 'true')
    return true
  return doc.querySelector<HTMLElement>(AGE_GATE_ROOT_SELECTOR)?.dataset.state === 'open'
}

function resolveNavLinkTargetId(link: HTMLAnchorElement) {
  return link.dataset.mobileNavSectionId ?? link.getAttribute('href')
}

function setHtmlScrollLocked(doc: Document, locked: boolean) {
  const html = doc.documentElement
  html.classList.toggle('overflow-hidden', locked)
  html.classList.toggle('touch-none', locked)
}

function syncViewModeIndicatorState(button: HTMLButtonElement, active: boolean) {
  button.setAttribute('aria-pressed', String(active))
  button.classList.toggle('text-gray-900', active)
  button.classList.toggle('dark:text-white', active)
  button.classList.toggle('text-gray-700', !active)
  button.classList.toggle('dark:text-gray-200', !active)

  const indicator = button.querySelector<HTMLElement>('[data-mobile-hamburger-view-mode-indicator]')
  if (!indicator)
    return

  indicator.classList.toggle('scale-100', active)
  indicator.classList.toggle('opacity-100', active)
  indicator.classList.toggle('scale-0', !active)
  indicator.classList.toggle('opacity-0', !active)
}

export function mountMobileHamburgerMenu({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountMobileHamburgerMenuOptions = {}) {
  const deps = { ...defaultDeps, ...depsOverrides }
  const root = doc.querySelector<HTMLElement>(ROOT_SELECTOR)
  const toggle = root?.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR) ?? null
  const toggleLabel = root?.querySelector<HTMLElement>(TOGGLE_LABEL_SELECTOR) ?? null
  const toggleIcon = root?.querySelector<HTMLElement>(TOGGLE_ICON_SELECTOR) ?? null
  const menuIcon = root?.querySelector<HTMLElement>(MENU_ICON_SELECTOR) ?? null
  const closeIcon = root?.querySelector<HTMLElement>(CLOSE_ICON_SELECTOR) ?? null
  const backdrop = root?.querySelector<HTMLButtonElement>(BACKDROP_SELECTOR) ?? null
  const panel = root?.querySelector<HTMLElement>(PANEL_SELECTOR) ?? null
  const navRoot = root?.querySelector<HTMLElement>(NAV_ROOT_SELECTOR) ?? null
  const searchAction = root?.querySelector<HTMLButtonElement>(SEARCH_ACTION_SELECTOR) ?? null
  if (!root || !toggle || !toggleLabel || !backdrop || !panel || !navRoot || !searchAction)
    return () => {}

  const viewModeToggles = [...root.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)]
  const navPanels = [...root.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR)]
  const navPanelByMode = new Map<CommissionViewMode, HTMLElement>()
  navPanels.forEach((panelNode) => {
    const mode = resolveViewModeFromPanel(panelNode)
    if (!mode)
      return
    navPanelByMode.set(mode, panelNode)
  })
  const characterSections: CharacterSectionNode[] = Array.from(root.querySelectorAll<HTMLElement>(CHARACTER_SECTION_SELECTOR), (section) => {
    const key = resolveCharacterSectionKeyFromValue(section.dataset.mobileCharacterSection)
    if (!key)
      return null
    return {
      key,
      trigger: section.querySelector<HTMLButtonElement>(CHARACTER_SECTION_TOGGLE_SELECTOR),
      panel: section.querySelector<HTMLElement>(`[data-mobile-character-section-panel="${key}"]`),
      chevron: section.querySelector<HTMLElement>(
        '[data-mobile-character-section-chevron="true"]',
      ),
    }
  })
    .filter((section): section is CharacterSectionNode => Boolean(section))

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
  let expandedCharacterSection: CharacterSectionKey | null = 'active'
  let ageGateOpen = readAgeGateOpen(doc)

  const clearCloseTimer = () => {
    if (closeTimerId === null)
      return
    win.clearTimeout(closeTimerId)
    closeTimerId = null
  }

  const clearOpenRaf = () => {
    if (openRafId === null)
      return
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

    root.classList.toggle('invisible', ageGateOpen)
    root.classList.toggle('opacity-0', ageGateOpen)
    root.classList.toggle('pointer-events-none', ageGateOpen)
    root.classList.toggle('opacity-100', !ageGateOpen)
    toggle.disabled = ageGateOpen
    toggle.setAttribute('aria-hidden', String(ageGateOpen))

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
    if (mounted === nextMounted)
      return
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
    if (ageGateOpen)
      return

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
    if (ageGateOpen)
      return

    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }

  const syncCharacterSectionState = () => {
    characterSections.forEach((section) => {
      const expanded = section.key === expandedCharacterSection
      section.trigger?.setAttribute('aria-expanded', String(expanded))
      if (section.panel)
        section.panel.hidden = !expanded
      section.chevron?.classList.toggle('rotate-180', expanded)
    })
  }

  const syncViewModeState = () => {
    const mode = readCommissionViewMode(win)
    viewModeToggles.forEach((button) => {
      const buttonMode = resolveCommissionViewModeFromElement(button)
      syncViewModeIndicatorState(button, buttonMode === mode)
    })

    navPanels.forEach((currentPanel) => {
      currentPanel.classList.toggle('hidden', currentPanel.dataset.mobileHamburgerNavPanel !== mode)
    })
  }

  const resolveLinkAvailabilityRoot = (): ParentNode => {
    const mode = readCommissionViewMode(win)
    const currentPanel = navPanelByMode.get(mode)
    if (!currentPanel)
      return navRoot

    return currentPanel.querySelector(NAV_LINK_SELECTOR) ? currentPanel : navRoot
  }

  const syncLinkAvailability = () => {
    deps.syncLinkAvailability({
      root: resolveLinkAvailabilityRoot(),
      linkSelector: NAV_LINK_SELECTOR,
      getSectionId: link => link.dataset.mobileNavSectionId ?? null,
      isDeferredTarget: (sectionId, link) =>
        (link.dataset.mobileNavCharacterStatus === 'active'
          && hasDeferredActiveCharacterTarget(doc, sectionId))
        || (link.dataset.mobileNavCharacterStatus === 'stale'
          && hasStaleCharacterTarget(doc, sectionId)),
    })
  }

  const syncUiState = () => {
    syncViewModeState()
    syncCharacterSectionState()
    syncLinkAvailability()
  }

  const prefetchNavLinkTarget = (link: HTMLAnchorElement) => {
    const targetId = resolveNavLinkTargetId(link)
    if (link.dataset.mobileNavCharacterStatus === 'active') {
      deps.prefetchActiveTarget(doc, targetId)
      return
    }

    if (link.dataset.mobileNavCharacterStatus === 'stale') {
      deps.prefetchStaleTarget(doc, targetId)
    }
  }

  const getVisibleItemCount = (mode: CommissionViewMode) =>
    mode === 'timeline' ? timelineCount : activeCount + staleCount

  const trackCharacterNavClick = (navLink: HTMLAnchorElement) => {
    const mode = readCommissionViewMode(win)
    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      nav_surface: 'hamburger',
      view_mode: mode,
      item_count: getVisibleItemCount(mode),
      character_name: navLink.textContent?.trim() || 'unknown',
      section_id: navLink.dataset.mobileNavSectionId ?? 'unknown',
    })
  }

  const handleDeferredNavLinkLoad = ({
    event,
    href,
    loadedEvent,
    navLink,
    requestLoad,
  }: {
    event: MouseEvent
    href: string | null
    loadedEvent: string
    navLink: HTMLAnchorElement
    requestLoad: () => void
  }) => {
    event.preventDefault()
    dispatchHomeScrollRestoreAbort(win)

    const onLoaded = () => {
      deps.scrollToHashWithoutWrite(href)
      syncLinkAvailability()
    }

    win.addEventListener(loadedEvent, onLoaded, { once: true })
    requestLoad()
    trackCharacterNavClick(navLink)
    closeMenu()
  }

  const runSearchAction = () => {
    const mode = readCommissionViewMode(win)
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
    if (!(target instanceof Element))
      return

    const actionButton = target.closest<HTMLButtonElement>(SEARCH_ACTION_SELECTOR)
    if (!actionButton)
      return

    event.preventDefault()
    didHandleSearchPointerDown = true
    runSearchAction()
  }

  const onNavPreview = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const navLink = target.closest<HTMLAnchorElement>(NAV_LINK_SELECTOR)
    if (!navLink)
      return

    prefetchNavLinkTarget(navLink)
  }

  const onRootClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const clickedToggle = target.closest<HTMLButtonElement>(TOGGLE_SELECTOR)
    if (clickedToggle) {
      toggleMenu()
      return
    }

    const viewModeToggle = target.closest<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    if (viewModeToggle) {
      const currentMode = readCommissionViewMode(win)
      const nextMode = resolveCommissionViewModeFromElement(viewModeToggle)
      if (!nextMode)
        return

      deps.trackEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
        from_mode: currentMode,
        to_mode: nextMode,
        already_active: currentMode === nextMode,
      })

      if (currentMode !== nextMode) {
        replaceCommissionViewModeInAddress(win, nextMode)
      }
      else {
        syncUiState()
      }
      return
    }

    const characterSectionToggle = target.closest<HTMLButtonElement>(
      CHARACTER_SECTION_TOGGLE_SELECTOR,
    )
    if (characterSectionToggle) {
      const sectionKey = resolveCharacterSectionKeyFromElement(characterSectionToggle)
      if (!sectionKey)
        return
      expandedCharacterSection = expandedCharacterSection === sectionKey ? null : sectionKey
      syncCharacterSectionState()
      if (expandedCharacterSection === 'stale' && !isStaleCharactersVisible(doc)) {
        deps.requestStaleVisibility(win, 'visible')
      }
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
    if (!navLink)
      return

    const navTargetId = resolveNavLinkTargetId(navLink)
    const isDeferredActiveLink
      = navLink.dataset.mobileNavCharacterStatus === 'active'
        && hasDeferredActiveCharacterTarget(doc, navTargetId)
    if (isDeferredActiveLink) {
      const href = navLink.getAttribute('href')
      handleDeferredNavLinkLoad({
        event,
        href,
        loadedEvent: ACTIVE_CHARACTERS_LOADED_EVENT,
        navLink,
        requestLoad: () => {
          deps.requestActiveLoad(win, {
            strategy: 'target',
            targetId: href ?? navTargetId ?? undefined,
          })
        },
      })
      return
    }

    const isStaleLink = navLink.dataset.mobileNavCharacterStatus === 'stale'
    const isDeferredStaleLink = isStaleLink && hasDeferredStaleCharacterTarget(doc, navTargetId)
    if (isDeferredStaleLink) {
      const href = navLink.getAttribute('href')
      handleDeferredNavLinkLoad({
        event,
        href,
        loadedEvent: STALE_CHARACTERS_LOADED_EVENT,
        navLink,
        requestLoad: () => {
          deps.requestStaleLoad(win, {
            preserveScroll: false,
            strategy: 'target',
            targetId: href ?? navTargetId ?? undefined,
          })
        },
      })
      return
    }
    if (isStaleLink && !isStaleCharactersVisible(doc)) {
      event.preventDefault()
      dispatchHomeScrollRestoreAbort(win)

      const href = navLink.getAttribute('href')
      const onStaleShown = (staleEvent: Event) => {
        if (!(staleEvent instanceof CustomEvent) || staleEvent.detail?.visibility !== 'visible') {
          return
        }

        deps.scrollToHashWithoutWrite(href)
        syncLinkAvailability()
      }

      win.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStaleShown, { once: true })
      deps.requestStaleVisibility(win, 'visible')
      trackCharacterNavClick(navLink)
      closeMenu()
      return
    }
    if (navLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    dispatchHomeScrollRestoreAbort(win)

    const mode = readCommissionViewMode(win)

    if (mode === 'timeline') {
      event.preventDefault()
      deps.scrollToHashWithoutWrite(navLink.getAttribute('href'))
    }

    trackCharacterNavClick(navLink)
    closeMenu()
  }

  const onBackdropClick = () => {
    closeMenu()
  }

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape')
      return
    closeMenu()
  }

  const onViewModeChanged = () => {
    syncUiState()
  }

  const onLinkAvailabilityRelatedStateChanged = () => {
    syncLinkAvailability()
  }

  const onPopState = () => {
    syncUiState()
  }

  const onAgeGateStateChanged = (event: Event) => {
    const nextOpen
      = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? Boolean((event.detail as { open?: unknown }).open)
        : readAgeGateOpen(doc)
    if (ageGateOpen === nextOpen)
      return

    ageGateOpen = nextOpen
    if (ageGateOpen) {
      clearCloseTimer()
      clearOpenRaf()
      open = false
      setMounted(false)
      setHtmlScrollLocked(doc, false)
      syncOpenState()
    }
    else {
      syncOpenState()
    }
  }

  root.addEventListener('pointerdown', onRootPointerDown)
  root.addEventListener('click', onRootClick)
  navRoot.addEventListener('pointerdown', onNavPreview)
  navRoot.addEventListener('focusin', onNavPreview)
  backdrop.addEventListener('click', onBackdropClick)
  doc.addEventListener('keydown', onDocumentKeyDown)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onLinkAvailabilityRelatedStateChanged)
  win.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onLinkAvailabilityRelatedStateChanged)
  win.addEventListener('popstate', onPopState)
  win.addEventListener(AGE_GATE_STATE_EVENT, onAgeGateStateChanged)

  syncUiState()
  syncOpenState()

  return () => {
    if (disposed)
      return
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
    navRoot.removeEventListener('pointerdown', onNavPreview)
    navRoot.removeEventListener('focusin', onNavPreview)
    backdrop.removeEventListener('click', onBackdropClick)
    doc.removeEventListener('keydown', onDocumentKeyDown)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onLinkAvailabilityRelatedStateChanged)
    win.removeEventListener(
      STALE_CHARACTERS_STATE_CHANGE_EVENT,
      onLinkAvailabilityRelatedStateChanged,
    )
    win.removeEventListener('popstate', onPopState)
    win.removeEventListener(AGE_GATE_STATE_EVENT, onAgeGateStateChanged)
  }
}
