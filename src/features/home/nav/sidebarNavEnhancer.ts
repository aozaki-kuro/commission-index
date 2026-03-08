import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import {
  getActiveSectionId,
  getScrollThreshold,
  resolveElementsByIds,
} from '#lib/characters/scrollSpy'
import {
  clearHashIfTargetIsStale,
  scrollToHashTargetFromHrefWithoutHash,
} from '#lib/navigation/hashAnchor'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '#features/home/commission/viewModeState'
import type { CommissionViewMode } from '#features/home/commission/CommissionViewModeSearch'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import {
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
} from '#features/home/commission/staleCharactersEvent'

const SIDEBAR_ROOT_ID = 'Character List'
const SIDEBAR_CONTROLS_ROOT_ID = 'Home Controls'
const SEARCH_LINK_SELECTOR = '[data-sidebar-search-link="true"]'
const CHARACTER_LINK_SELECTOR = '[data-sidebar-character-link="true"]'
const NAV_PANEL_SELECTOR = '[data-sidebar-nav-panel]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-sidebar-view-mode-toggle="true"]'
const STALE_DETAILS_SELECTOR = '[data-sidebar-stale-details="true"]'

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100'] as const
const HIDDEN_DOT_CLASSES = ['scale-0', 'opacity-0'] as const

type SidebarNavEnhancerDeps = {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  clearHash: typeof clearHashIfTargetIsStale
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  requestStaleLoad: (win: Window) => void
}

type MountSidebarNavEnhancerOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<SidebarNavEnhancerDeps>
}

const defaultDeps: SidebarNavEnhancerDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  clearHash: clearHashIfTargetIsStale,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  requestStaleLoad: win => {
    win.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))
  },
}

const getCurrentMode = (win: Window): CommissionViewMode => readCommissionViewMode(win)

const getVisibleNavPanel = (root: HTMLElement, mode: CommissionViewMode) =>
  root.querySelector<HTMLElement>(`${NAV_PANEL_SELECTOR}[data-sidebar-nav-panel="${mode}"]`)

const isStaleCharacterLoaded = (doc: Document) =>
  doc.querySelector<HTMLElement>('[data-commission-view-panel="character"]')?.dataset
    .staleLoaded === 'true'

const getVisibleSidebarItemCount = (root: HTMLElement, mode: CommissionViewMode) =>
  getVisibleNavPanel(root, mode)?.querySelectorAll<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    .length ?? 0

const getVisibleTitleIds = (root: HTMLElement, mode: CommissionViewMode) => {
  const panel = getVisibleNavPanel(root, mode)
  if (!panel) return []

  return Array.from(panel.querySelectorAll<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR))
    .map(link => link.dataset.sidebarTitleId)
    .filter((id): id is string => Boolean(id))
}

const toggleDotState = (dot: HTMLElement, active: boolean) => {
  dot.classList.toggle(ACTIVE_DOT_CLASSES[0], active)
  dot.classList.toggle(ACTIVE_DOT_CLASSES[1], active)
  dot.classList.toggle(HIDDEN_DOT_CLASSES[0], !active)
  dot.classList.toggle(HIDDEN_DOT_CLASSES[1], !active)
}

const toggleViewModeButtonState = (button: HTMLButtonElement, active: boolean) => {
  button.classList.toggle('text-gray-900', active)
  button.classList.toggle('dark:text-white', active)
  button.classList.toggle('text-gray-700', !active)
  button.classList.toggle('dark:text-gray-200', !active)

  const indicator = button.querySelector<HTMLElement>('[data-sidebar-view-mode-indicator]')
  if (indicator) {
    toggleDotState(indicator, active)
  }
}

const resolveActiveTitleId = ({ root, mode }: { root: HTMLElement; mode: CommissionViewMode }) => {
  const titleIds = getVisibleTitleIds(root, mode)
  const titleElements = resolveElementsByIds(titleIds)
  if (titleElements.length === 0) return ''

  return getActiveSectionId(titleElements, getScrollThreshold())
}

export const mountSidebarNavEnhancer = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountSidebarNavEnhancerOptions = {}) => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const navRoot = doc.getElementById(SIDEBAR_ROOT_ID)
  if (!navRoot) return () => {}
  const controlsRoot = doc.getElementById(SIDEBAR_CONTROLS_ROOT_ID) ?? navRoot

  let clearHashRafId: number | null = null
  let syncLinksRafId: number | null = null
  let syncDotsRafId: number | null = null
  let hasTrackedSidebarSearchUsage = false
  let disposed = false

  const syncViewModeControls = () => {
    const mode = getCurrentMode(win)

    const toggles = controlsRoot.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    toggles.forEach(toggle => {
      const toggleMode = resolveCommissionViewModeFromElement(toggle)
      const active = toggleMode === mode
      toggle.setAttribute('aria-pressed', String(active))
      toggleViewModeButtonState(toggle, active)
    })

    const panels = navRoot.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR)
    panels.forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.sidebarNavPanel !== mode)
    })
  }

  const syncCharacterLinkAvailability = () => {
    const mode = getCurrentMode(win)
    const panel = getVisibleNavPanel(navRoot, mode)
    if (!panel) return

    syncHiddenSectionLinkAvailability({
      root: panel,
      linkSelector: CHARACTER_LINK_SELECTOR,
      getSectionId: link => {
        const rawHash = link.getAttribute('href')
        return rawHash?.startsWith('#') ? rawHash.slice(1) : null
      },
    })
  }

  const syncActiveDots = () => {
    const mode = getCurrentMode(win)
    const activeTitleId = resolveActiveTitleId({ root: navRoot, mode })
    const activePanel = getVisibleNavPanel(navRoot, mode)

    const allDots = navRoot.querySelectorAll<HTMLElement>('[data-sidebar-dot-for]')
    allDots.forEach(dot => {
      const panel = dot.closest<HTMLElement>(NAV_PANEL_SELECTOR)
      const isCurrentPanel = panel === activePanel
      const isActive = isCurrentPanel && dot.dataset.sidebarDotFor === activeTitleId
      toggleDotState(dot, isActive)
    })
  }

  const scheduleClearHashIfTargetIsStale = () => {
    if (clearHashRafId !== null) return

    clearHashRafId = win.requestAnimationFrame(() => {
      clearHashRafId = null
      deps.clearHash()
    })
  }

  const scheduleSyncCharacterLinkAvailability = () => {
    if (syncLinksRafId !== null) return

    syncLinksRafId = win.requestAnimationFrame(() => {
      syncLinksRafId = null
      syncCharacterLinkAvailability()
    })
  }

  const scheduleSyncActiveDots = () => {
    if (syncDotsRafId !== null) return

    syncDotsRafId = win.requestAnimationFrame(() => {
      syncDotsRafId = null
      syncActiveDots()
    })
  }

  const syncAll = () => {
    syncViewModeControls()
    scheduleSyncCharacterLinkAvailability()
    scheduleSyncActiveDots()
    scheduleClearHashIfTargetIsStale()
  }

  const openStaleDetails = () => {
    const staleDetails = navRoot.querySelector<HTMLDetailsElement>(STALE_DETAILS_SELECTOR)
    if (!staleDetails) return
    staleDetails.open = true
  }

  const trackSidebarCharacterClick = (link: HTMLAnchorElement) => {
    const mode = getCurrentMode(win)
    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      nav_surface: 'sidebar',
      view_mode: mode,
      item_count: getVisibleSidebarItemCount(navRoot, mode),
      character_name: link.textContent?.trim() || 'unknown',
      section_id: link.getAttribute('href')?.replace(/^#/, '') || 'unknown',
    })
  }

  const onSidebarClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const modeToggleButton = target.closest<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    if (modeToggleButton) {
      const currentMode = getCurrentMode(win)
      const nextMode = resolveCommissionViewModeFromElement(modeToggleButton)
      if (!nextMode) return

      deps.trackEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
        from_mode: currentMode,
        to_mode: nextMode,
        already_active: currentMode === nextMode,
      })
      if (nextMode !== currentMode) {
        replaceCommissionViewModeInAddress(win, nextMode)
      } else {
        syncAll()
      }
      return
    }

    const searchLink = target.closest<HTMLAnchorElement>(SEARCH_LINK_SELECTOR)
    if (searchLink) {
      event.preventDefault()

      if (!hasTrackedSidebarSearchUsage) {
        hasTrackedSidebarSearchUsage = true
        const mode = getCurrentMode(win)
        deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
          source: 'search_link',
          nav_surface: 'sidebar',
          view_mode: mode,
          item_count: getVisibleSidebarItemCount(navRoot, mode),
        })
      }

      deps.jumpToSearch()
      return
    }

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink) return

    const isStaleLink = characterLink.dataset.sidebarCharacterStatus === 'stale'
    if (isStaleLink && !isStaleCharacterLoaded(doc)) {
      event.preventDefault()

      const href = characterLink.getAttribute('href')
      const onStaleLoaded = () => {
        deps.scrollToHashWithoutWrite(href)
        scheduleSyncCharacterLinkAvailability()
        scheduleSyncActiveDots()
      }

      win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onStaleLoaded, { once: true })
      deps.requestStaleLoad(win)
      trackSidebarCharacterClick(characterLink)
      return
    }

    if (characterLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    if (getCurrentMode(win) === 'timeline') {
      event.preventDefault()
      deps.scrollToHashWithoutWrite(characterLink.getAttribute('href'))
    }

    trackSidebarCharacterClick(characterLink)
  }

  controlsRoot.addEventListener('click', onSidebarClick)
  if (controlsRoot !== navRoot) {
    navRoot.addEventListener('click', onSidebarClick)
  }
  win.addEventListener('scroll', scheduleSyncActiveDots, { passive: true })
  win.addEventListener('resize', scheduleSyncActiveDots)
  win.addEventListener('scroll', scheduleClearHashIfTargetIsStale, { passive: true })
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncCharacterLinkAvailability)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncActiveDots)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleClearHashIfTargetIsStale)
  win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, openStaleDetails)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncAll)
  win.addEventListener('popstate', syncAll)

  syncAll()

  return () => {
    if (disposed) return
    disposed = true

    controlsRoot.removeEventListener('click', onSidebarClick)
    if (controlsRoot !== navRoot) {
      navRoot.removeEventListener('click', onSidebarClick)
    }
    win.removeEventListener('scroll', scheduleSyncActiveDots)
    win.removeEventListener('resize', scheduleSyncActiveDots)
    win.removeEventListener('scroll', scheduleClearHashIfTargetIsStale)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncCharacterLinkAvailability)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncActiveDots)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleClearHashIfTargetIsStale)
    win.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, openStaleDetails)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncAll)
    win.removeEventListener('popstate', syncAll)

    if (clearHashRafId !== null) {
      win.cancelAnimationFrame(clearHashRafId)
      clearHashRafId = null
    }
    if (syncLinksRafId !== null) {
      win.cancelAnimationFrame(syncLinksRafId)
      syncLinksRafId = null
    }
    if (syncDotsRafId !== null) {
      win.cancelAnimationFrame(syncDotsRafId)
      syncDotsRafId = null
    }
  }
}
