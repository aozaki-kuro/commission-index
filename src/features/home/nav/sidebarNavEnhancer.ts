import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import {
  getActiveSectionId,
  getScrollThreshold,
  isElementAtThreshold,
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
  parseCommissionViewModeFromSearch,
  type CommissionViewMode,
} from '#features/home/commission/CommissionViewModeSearch'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'

const SIDEBAR_ROOT_ID = 'Character List'
const SEARCH_LINK_SELECTOR = '[data-sidebar-search-link="true"]'
const CHARACTER_LINK_SELECTOR = '[data-sidebar-character-link="true"]'
const NAV_PANEL_SELECTOR = '[data-sidebar-nav-panel]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-sidebar-view-mode-toggle="true"]'

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100'] as const
const HIDDEN_DOT_CLASSES = ['scale-0', 'opacity-0'] as const

type SidebarNavEnhancerDeps = {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  clearHash: typeof clearHashIfTargetIsStale
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
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
}

const getCurrentMode = (win: Window): CommissionViewMode =>
  parseCommissionViewModeFromSearch(win.location.search)

const hasSearchQueryInUrl = (win: Window) =>
  Boolean(new URLSearchParams(win.location.search).get('q')?.trim())

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
  if (mode === 'timeline' || mode === 'character') return mode
  return null
}

const getVisibleNavPanel = (root: HTMLElement, mode: CommissionViewMode) =>
  root.querySelector<HTMLElement>(`${NAV_PANEL_SELECTOR}[data-sidebar-nav-panel="${mode}"]`)

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

const resolveActiveTitleId = ({
  root,
  mode,
  win,
  doc,
}: {
  root: HTMLElement
  mode: CommissionViewMode
  win: Window
  doc: Document
}) => {
  const titleIds = getVisibleTitleIds(root, mode)
  const titleElements = resolveElementsByIds(titleIds)
  if (titleElements.length === 0) return ''

  const threshold = getScrollThreshold()
  if (mode === 'character') {
    const introductionElement = doc.getElementById('title-introduction')
    if (
      !hasSearchQueryInUrl(win) &&
      (win.scrollY === 0 ||
        (introductionElement && isElementAtThreshold(introductionElement, threshold)))
    ) {
      return ''
    }
  }

  return getActiveSectionId(titleElements, threshold)
}

export const mountSidebarNavEnhancer = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountSidebarNavEnhancerOptions = {}) => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const root = doc.getElementById(SIDEBAR_ROOT_ID)
  if (!root) return () => {}

  let clearHashRafId: number | null = null
  let syncLinksRafId: number | null = null
  let syncDotsRafId: number | null = null
  let hasTrackedSidebarSearchUsage = false
  let disposed = false

  const syncViewModeControls = () => {
    const mode = getCurrentMode(win)

    const toggles = root.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    toggles.forEach(toggle => {
      const toggleMode = resolveViewModeFromElement(toggle)
      const active = toggleMode === mode
      toggle.setAttribute('aria-pressed', String(active))
      toggleViewModeButtonState(toggle, active)
    })

    const panels = root.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR)
    panels.forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.sidebarNavPanel !== mode)
    })
  }

  const syncCharacterLinkAvailability = () => {
    const mode = getCurrentMode(win)
    const panel = getVisibleNavPanel(root, mode)
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
    const activeTitleId = resolveActiveTitleId({ root, mode, win, doc })
    const activePanel = getVisibleNavPanel(root, mode)

    const allDots = root.querySelectorAll<HTMLElement>('[data-sidebar-dot-for]')
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

  const trackSidebarCharacterClick = (link: HTMLAnchorElement) => {
    const mode = getCurrentMode(win)
    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      nav_surface: 'sidebar',
      view_mode: mode,
      item_count: getVisibleSidebarItemCount(root, mode),
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
      const nextMode = resolveViewModeFromElement(modeToggleButton)
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
          item_count: getVisibleSidebarItemCount(root, mode),
        })
      }

      deps.jumpToSearch()
      return
    }

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink) return

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

  root.addEventListener('click', onSidebarClick)
  win.addEventListener('scroll', scheduleSyncActiveDots, { passive: true })
  win.addEventListener('resize', scheduleSyncActiveDots)
  win.addEventListener('scroll', scheduleClearHashIfTargetIsStale, { passive: true })
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncCharacterLinkAvailability)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncActiveDots)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleClearHashIfTargetIsStale)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncAll)
  win.addEventListener('popstate', syncAll)

  syncAll()

  return () => {
    if (disposed) return
    disposed = true

    root.removeEventListener('click', onSidebarClick)
    win.removeEventListener('scroll', scheduleSyncActiveDots)
    win.removeEventListener('resize', scheduleSyncActiveDots)
    win.removeEventListener('scroll', scheduleClearHashIfTargetIsStale)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncCharacterLinkAvailability)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleSyncActiveDots)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleClearHashIfTargetIsStale)
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
