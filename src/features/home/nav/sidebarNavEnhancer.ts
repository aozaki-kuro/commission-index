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
import { dispatchHomeScrollRestoreAbort } from '#features/home/homeScrollRestoreAbort'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '#features/home/commission/viewModeState'
import type { CommissionViewMode } from '#features/home/commission/CommissionViewModeSearch'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import {
  prefetchDeferredActiveCharacterTarget,
  prefetchDeferredStaleCharacterTarget,
} from '#features/home/commission/deferredCharacterBatchPrefetch'
import { normalizeHomeCharacterTargetId } from '#features/home/commission/homeCharacterBatchManifest'
import {
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
  hasDeferredStaleCharacterTarget,
  hasStaleCharacterTarget,
  isStaleCharactersVisible,
  requestStaleCharactersLoad,
  requestStaleCharactersVisibility,
  type RequestStaleCharactersLoadOptions,
  type StaleCharactersState,
  type StaleCharactersVisibility,
} from '#features/home/commission/staleCharactersEvent'
import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  hasDeferredActiveCharacterTarget,
  requestActiveCharactersLoad,
  type RequestActiveCharactersLoadOptions,
} from '#features/home/commission/activeCharactersEvent'

const SIDEBAR_ROOT_ID = 'Character List'
const SIDEBAR_CONTROLS_ROOT_ID = 'Home Controls'
const SEARCH_LINK_SELECTOR = '[data-sidebar-search-link="true"]'
const CHARACTER_LINK_SELECTOR = '[data-sidebar-character-link="true"]'
const NAV_PANEL_SELECTOR = '[data-sidebar-nav-panel]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-sidebar-view-mode-toggle="true"]'
const STALE_DETAILS_SELECTOR = '[data-sidebar-stale-details="true"]'
const STALE_LOAD_TRIGGER_SELECTOR = '[data-load-stale-characters="true"]'

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100'] as const
const HIDDEN_DOT_CLASSES = ['scale-0', 'opacity-0'] as const
const SIDEBAR_DOT_SELECTOR = '[data-sidebar-dot-for]'

type SidebarNavEnhancerDeps = {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  clearHash: typeof clearHashIfTargetIsStale
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  prefetchActiveTarget: (doc: Document, targetId: string | null | undefined) => void
  prefetchStaleTarget: (doc: Document, targetId: string | null | undefined) => void
  requestActiveLoad: (win: Window, options?: RequestActiveCharactersLoadOptions) => void
  requestStaleLoad: (win: Window, options?: RequestStaleCharactersLoadOptions) => void
  requestStaleVisibility: (win: Window, visibility: StaleCharactersVisibility) => void
}

type MountSidebarNavEnhancerOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<SidebarNavEnhancerDeps>
}

type SidebarActivePanelSnapshot = {
  mode: CommissionViewMode
  panel: HTMLElement | null
  titleIds: string[]
  titleElements: HTMLElement[]
}

const defaultDeps: SidebarNavEnhancerDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  clearHash: clearHashIfTargetIsStale,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  prefetchActiveTarget: prefetchDeferredActiveCharacterTarget,
  prefetchStaleTarget: prefetchDeferredStaleCharacterTarget,
  requestActiveLoad: requestActiveCharactersLoad,
  requestStaleLoad: requestStaleCharactersLoad,
  requestStaleVisibility: requestStaleCharactersVisibility,
}

const getCurrentMode = (win: Window): CommissionViewMode => readCommissionViewMode(win)

const getVisibleNavPanel = (root: HTMLElement, mode: CommissionViewMode) =>
  root.querySelector<HTMLElement>(`${NAV_PANEL_SELECTOR}[data-sidebar-nav-panel="${mode}"]`)

const getVisibleSidebarItemCount = (root: HTMLElement, mode: CommissionViewMode) =>
  getVisibleNavPanel(root, mode)?.querySelectorAll<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    .length ?? 0

const getVisibleTitleIds = (panel: HTMLElement | null) => {
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

const createActivePanelSnapshot = ({
  mode,
  panel,
}: {
  mode: CommissionViewMode
  panel: HTMLElement | null
}): SidebarActivePanelSnapshot => {
  const titleIds = getVisibleTitleIds(panel)
  const titleElements = resolveElementsByIds(titleIds)

  return {
    mode,
    panel,
    titleIds,
    titleElements,
  }
}

const resolveActiveTitleId = (titleElements: HTMLElement[]) => {
  if (titleElements.length === 0) return ''

  return getActiveSectionId(titleElements, getScrollThreshold())
}

const resolveSectionIdFromHref = (rawHref: string | null) =>
  normalizeHomeCharacterTargetId(rawHref) || null

export const mountSidebarNavEnhancer = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountSidebarNavEnhancerOptions = {}) => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const navRoot = doc.getElementById(SIDEBAR_ROOT_ID)
  if (!navRoot) return () => {}
  const controlsRoot = doc.getElementById(SIDEBAR_CONTROLS_ROOT_ID) ?? navRoot
  const viewModeToggles = Array.from(
    controlsRoot.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR),
  )
  const navPanels = Array.from(navRoot.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR))
  const allSidebarDots = Array.from(navRoot.querySelectorAll<HTMLElement>(SIDEBAR_DOT_SELECTOR))

  let clearHashRafId: number | null = null
  let syncLinksRafId: number | null = null
  let syncDotsRafId: number | null = null
  let activePanelSnapshot: SidebarActivePanelSnapshot | null = null
  let activeDots: HTMLElement[] = []
  const panelDotIndexCache = new WeakMap<HTMLElement, Map<string, HTMLElement[]>>()
  let dotsInitialized = false
  let hasTrackedSidebarSearchUsage = false
  let disposed = false

  const clearActivePanelSnapshot = () => {
    activePanelSnapshot = null
  }

  const resetAllDots = () => {
    allSidebarDots.forEach(dot => {
      toggleDotState(dot, false)
    })
    activeDots = []
    dotsInitialized = true
  }

  const getPanelDotIndex = (panel: HTMLElement) => {
    const cachedIndex = panelDotIndexCache.get(panel)
    if (cachedIndex) return cachedIndex

    const nextIndex = new Map<string, HTMLElement[]>()
    panel.querySelectorAll<HTMLElement>(SIDEBAR_DOT_SELECTOR).forEach(dot => {
      const titleId = dot.dataset.sidebarDotFor
      if (!titleId) return

      const dots = nextIndex.get(titleId)
      if (dots) {
        dots.push(dot)
        return
      }

      nextIndex.set(titleId, [dot])
    })

    panelDotIndexCache.set(panel, nextIndex)
    return nextIndex
  }

  const resolveActiveDots = ({
    panel,
    titleId,
  }: {
    panel: HTMLElement | null
    titleId: string
  }) => {
    if (!panel || !titleId) return []

    return getPanelDotIndex(panel).get(titleId) ?? []
  }

  const syncActiveDotSet = (nextDots: HTMLElement[]) => {
    const prevDotSet = new Set(activeDots)
    const nextDotSet = new Set(nextDots)

    for (const dot of activeDots) {
      if (nextDotSet.has(dot)) continue
      toggleDotState(dot, false)
    }

    for (const dot of nextDots) {
      if (prevDotSet.has(dot)) continue
      toggleDotState(dot, true)
    }

    activeDots = nextDots
  }

  const getActivePanelSnapshot = () => {
    const mode = getCurrentMode(win)
    const panel = getVisibleNavPanel(navRoot, mode)
    if (
      activePanelSnapshot &&
      activePanelSnapshot.mode === mode &&
      activePanelSnapshot.panel === panel
    ) {
      return activePanelSnapshot
    }

    const nextSnapshot = createActivePanelSnapshot({ mode, panel })
    activePanelSnapshot = nextSnapshot
    return nextSnapshot
  }

  const syncViewModeControls = () => {
    const mode = getCurrentMode(win)

    viewModeToggles.forEach(toggle => {
      const toggleMode = resolveCommissionViewModeFromElement(toggle)
      const active = toggleMode === mode
      toggle.setAttribute('aria-pressed', String(active))
      toggleViewModeButtonState(toggle, active)
    })

    navPanels.forEach(panel => {
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
        return resolveSectionIdFromHref(link.getAttribute('href'))
      },
      isDeferredTarget: (sectionId, link) =>
        (link.dataset.sidebarCharacterStatus === 'active' &&
          hasDeferredActiveCharacterTarget(doc, sectionId)) ||
        (link.dataset.sidebarCharacterStatus === 'stale' &&
          hasStaleCharacterTarget(doc, sectionId)),
    })
  }

  const syncActiveDots = () => {
    const activeSnapshot = getActivePanelSnapshot()
    const activeTitleId = resolveActiveTitleId(activeSnapshot.titleElements)
    if (!dotsInitialized) {
      resetAllDots()
    }

    syncActiveDotSet(
      resolveActiveDots({
        panel: activeSnapshot.panel,
        titleId: activeTitleId,
      }),
    )
  }

  const scheduleClearHashIfTargetIsStale = () => {
    if (clearHashRafId !== null) return

    let didRunSynchronously = false
    const frameId = win.requestAnimationFrame(() => {
      didRunSynchronously = true
      clearHashRafId = null
      deps.clearHash()
    })
    clearHashRafId = didRunSynchronously ? null : frameId
  }

  const scheduleSyncCharacterLinkAvailability = ({
    invalidateSnapshot = false,
  }: {
    invalidateSnapshot?: boolean
  } = {}) => {
    if (invalidateSnapshot) {
      clearActivePanelSnapshot()
    }
    if (syncLinksRafId !== null) return

    let didRunSynchronously = false
    const frameId = win.requestAnimationFrame(() => {
      didRunSynchronously = true
      syncLinksRafId = null
      syncCharacterLinkAvailability()
    })
    syncLinksRafId = didRunSynchronously ? null : frameId
  }

  const scheduleSyncActiveDots = () => {
    if (syncDotsRafId !== null) return

    let didRunSynchronously = false
    const frameId = win.requestAnimationFrame(() => {
      didRunSynchronously = true
      syncDotsRafId = null
      syncActiveDots()
    })
    syncDotsRafId = didRunSynchronously ? null : frameId
  }

  const syncAll = () => {
    clearActivePanelSnapshot()
    syncViewModeControls()
    scheduleSyncCharacterLinkAvailability()
    scheduleSyncActiveDots()
    scheduleClearHashIfTargetIsStale()
  }

  const openStaleDetails = () => {
    const staleDetails = navRoot.querySelector<HTMLDetailsElement>(STALE_DETAILS_SELECTOR)
    if (!staleDetails) return
    if (staleDetails.open) return
    staleDetails.open = true
  }

  const closeStaleDetails = () => {
    const staleDetails = navRoot.querySelector<HTMLDetailsElement>(STALE_DETAILS_SELECTOR)
    if (!staleDetails) return
    if (!staleDetails.open) return
    staleDetails.open = false
  }

  const setStaleDetailsVisibility = (visibility: StaleCharactersVisibility) => {
    if (visibility === 'visible') {
      openStaleDetails()
      return
    }

    closeStaleDetails()
  }

  const resolveVisibilityFromStateEvent = (event: Event): StaleCharactersVisibility => {
    if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
      const visibility = (event.detail as Partial<StaleCharactersState>).visibility
      if (visibility === 'visible' || visibility === 'hidden') return visibility
    }

    return isStaleCharactersVisible(doc) ? 'visible' : 'hidden'
  }

  const onStaleDetailsToggle = (event: Event) => {
    const staleDetails = event.currentTarget
    if (!(staleDetails instanceof HTMLDetailsElement)) return

    const nextVisibility: StaleCharactersVisibility = staleDetails.open ? 'visible' : 'hidden'
    const currentVisibility: StaleCharactersVisibility = isStaleCharactersVisible(doc)
      ? 'visible'
      : 'hidden'
    if (nextVisibility === currentVisibility) {
      return
    }

    deps.requestStaleVisibility(win, nextVisibility)
  }

  const onStaleStateChanged = (event: Event) => {
    clearActivePanelSnapshot()
    setStaleDetailsVisibility(resolveVisibilityFromStateEvent(event))
    scheduleSyncCharacterLinkAvailability()
    scheduleSyncActiveDots()
  }

  const prefetchCharacterTarget = (link: HTMLAnchorElement) => {
    const href = link.getAttribute('href')
    if (link.dataset.sidebarCharacterStatus === 'active') {
      deps.prefetchActiveTarget(doc, href)
      return
    }

    if (link.dataset.sidebarCharacterStatus === 'stale') {
      deps.prefetchStaleTarget(doc, href)
    }
  }

  const onSidebarPreview = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink) return

    prefetchCharacterTarget(characterLink)
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

    const staleLoadTrigger = target.closest<HTMLElement>(STALE_LOAD_TRIGGER_SELECTOR)
    if (
      staleLoadTrigger &&
      staleLoadTrigger.closest(STALE_DETAILS_SELECTOR) &&
      !isStaleCharactersVisible(doc)
    ) {
      event.preventDefault()
      openStaleDetails()
      return
    }

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink) return

    const href = characterLink.getAttribute('href')
    const isDeferredActiveLink =
      characterLink.dataset.sidebarCharacterStatus === 'active' &&
      hasDeferredActiveCharacterTarget(doc, href)
    if (isDeferredActiveLink) {
      event.preventDefault()
      dispatchHomeScrollRestoreAbort(win)

      const onActiveLoaded = () => {
        deps.scrollToHashWithoutWrite(href)
        scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
        scheduleSyncActiveDots()
      }

      win.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onActiveLoaded, { once: true })
      deps.requestActiveLoad(win, { strategy: 'target', targetId: href ?? undefined })
      trackSidebarCharacterClick(characterLink)
      return
    }

    const isStaleLink = characterLink.dataset.sidebarCharacterStatus === 'stale'
    const isDeferredStaleLink = isStaleLink && hasDeferredStaleCharacterTarget(doc, href)
    if (isDeferredStaleLink) {
      event.preventDefault()
      dispatchHomeScrollRestoreAbort(win)

      const onStaleLoaded = () => {
        deps.scrollToHashWithoutWrite(href)
        scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
        scheduleSyncActiveDots()
      }

      win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onStaleLoaded, { once: true })
      deps.requestStaleLoad(win, {
        preserveScroll: false,
        strategy: 'target',
        targetId: href ?? undefined,
      })
      trackSidebarCharacterClick(characterLink)
      return
    }

    if (isStaleLink && !isStaleCharactersVisible(doc)) {
      event.preventDefault()
      dispatchHomeScrollRestoreAbort(win)

      const onStaleShown = (staleEvent: Event) => {
        if (!(staleEvent instanceof CustomEvent) || staleEvent.detail?.visibility !== 'visible') {
          return
        }

        deps.scrollToHashWithoutWrite(href)
        scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
        scheduleSyncActiveDots()
      }

      win.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStaleShown, { once: true })
      deps.requestStaleVisibility(win, 'visible')
      trackSidebarCharacterClick(characterLink)
      return
    }

    if (characterLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    dispatchHomeScrollRestoreAbort(win)

    if (getCurrentMode(win) === 'timeline') {
      event.preventDefault()
      deps.scrollToHashWithoutWrite(characterLink.getAttribute('href'))
    }

    trackSidebarCharacterClick(characterLink)
  }

  const staleDetails = navRoot.querySelector<HTMLDetailsElement>(STALE_DETAILS_SELECTOR)
  const onSidebarSearchState = () => {
    scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
    scheduleSyncActiveDots()
    scheduleClearHashIfTargetIsStale()
  }
  const onViewModeMaybeChanged = () => {
    clearActivePanelSnapshot()
    syncAll()
  }

  controlsRoot.addEventListener('click', onSidebarClick)
  if (controlsRoot !== navRoot) {
    navRoot.addEventListener('click', onSidebarClick)
  }
  navRoot.addEventListener('pointerover', onSidebarPreview)
  navRoot.addEventListener('focusin', onSidebarPreview)
  staleDetails?.addEventListener('toggle', onStaleDetailsToggle)
  win.addEventListener('scroll', scheduleSyncActiveDots, { passive: true })
  win.addEventListener('resize', scheduleSyncActiveDots)
  win.addEventListener('scroll', scheduleClearHashIfTargetIsStale, { passive: true })
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSearchState)
  win.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStaleStateChanged)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeMaybeChanged)
  win.addEventListener('popstate', onViewModeMaybeChanged)

  syncAll()
  setStaleDetailsVisibility(isStaleCharactersVisible(doc) ? 'visible' : 'hidden')

  return () => {
    if (disposed) return
    disposed = true

    controlsRoot.removeEventListener('click', onSidebarClick)
    if (controlsRoot !== navRoot) {
      navRoot.removeEventListener('click', onSidebarClick)
    }
    navRoot.removeEventListener('pointerover', onSidebarPreview)
    navRoot.removeEventListener('focusin', onSidebarPreview)
    staleDetails?.removeEventListener('toggle', onStaleDetailsToggle)
    win.removeEventListener('scroll', scheduleSyncActiveDots)
    win.removeEventListener('resize', scheduleSyncActiveDots)
    win.removeEventListener('scroll', scheduleClearHashIfTargetIsStale)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSearchState)
    win.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStaleStateChanged)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeMaybeChanged)
    win.removeEventListener('popstate', onViewModeMaybeChanged)

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
