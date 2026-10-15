import type { CommissionViewMode } from '@features/home/commission/CommissionViewModeSearch'
import type { RequestActiveCharactersLoadOptions } from '@features/home/commission/loader/activeCharactersEvent'
import type { ArchivedCharactersState, ArchivedCharactersVisibility, RequestArchivedCharactersLoadOptions } from '@features/home/commission/loader/archivedCharactersEvent'
import type { RequestTimelineViewLoadOptions } from '@features/home/commission/loader/timelineViewEvent'
import {
  prefetchDeferredActiveCharacterTarget,
  prefetchDeferredArchivedCharacterTarget,
} from '@features/home/commission/batch/deferredCharacterBatchPrefetch'
import { normalizeHomeCharacterTargetId } from '@features/home/commission/batch/homeCharacterBatchManifest'
import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  hasDeferredActiveCharacterTarget,
  requestActiveCharactersLoad,

} from '@features/home/commission/loader/activeCharactersEvent'
import {
  ARCHIVED_CHARACTERS_LOADED_EVENT,
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
  hasArchivedCharacterTarget,
  hasDeferredArchivedCharacterTarget,

  isArchivedCharactersVisible,
  requestArchivedCharactersLoad,
  requestArchivedCharactersVisibility,

} from '@features/home/commission/loader/archivedCharactersEvent'
import {
  hasDeferredTimelineTarget,
  requestTimelineViewLoad,
} from '@features/home/commission/loader/timelineViewEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '@features/home/commission/loader/timelineViewLoader'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '@features/home/commission/viewModeState'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT, dispatchHomeScrollRestoreAbort } from '@features/home/events'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'
import {
  getActiveSectionId,
  getScrollThreshold,
  resolveElementsByIds,
} from '@lib/characters/scrollSpy'
import {
  clearHashIfTargetOffscreen,
  clearLocationHash,
  getHashFromHref,
  getHashTarget,
  scrollToHashTargetFromHrefWithoutHash,
} from '@lib/navigation/hashAnchor'
import { jumpToCommissionSearch } from '@lib/navigation/jumpToCommissionSearch'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '@lib/navigation/syncHiddenSectionLinkAvailability'
import {
  loadDeferredHomeNavTarget,
  prefetchHomeNavTarget,
  revealArchivedHomeNavTarget,
} from './homeNavTargetClient'

const SIDEBAR_ROOT_ID = 'Character List'
const SIDEBAR_CONTROLS_ROOT_ID = 'Home Controls'
const SEARCH_LINK_SELECTOR = '[data-sidebar-search-link="true"]'
const CHARACTER_LINK_SELECTOR = '[data-sidebar-character-link="true"]'
const NAV_PANEL_SELECTOR = '[data-sidebar-nav-panel]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-sidebar-view-mode-toggle="true"]'
const ARCHIVED_DETAILS_SELECTOR = '[data-sidebar-archived-details="true"]'
const ARCHIVED_LOAD_TRIGGER_SELECTOR = '[data-load-archived-characters="true"]'
const BACK_TO_TOP_BUTTON_SELECTOR = '[data-sidebar-back-to-top-button="true"]'

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100'] as const
const HIDDEN_DOT_CLASSES = ['scale-95', 'opacity-0'] as const
const SIDEBAR_DOT_SELECTOR = '[data-sidebar-dot-for]'
const HASH_PREFIX_PATTERN = /^#/
const BACK_TO_TOP_VISIBILITY_SCROLL_THRESHOLD = 360

interface SidebarNavEnhancerDeps {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  clearHash: typeof clearHashIfTargetOffscreen
  clearHashNow: typeof clearLocationHash
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  prefetchActiveTarget: (doc: Document, targetId: string | null | undefined) => void
  prefetchArchivedTarget: (doc: Document, targetId: string | null | undefined) => void
  requestActiveLoad: (win: Window, options?: RequestActiveCharactersLoadOptions) => void
  requestArchivedLoad: (win: Window, options?: RequestArchivedCharactersLoadOptions) => void
  requestTimelineLoad: (win: Window, options?: RequestTimelineViewLoadOptions) => void
  requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
}

interface MountSidebarNavEnhancerOptions {
  win?: Window
  doc?: Document
  deps?: Partial<SidebarNavEnhancerDeps>
}

interface SidebarActivePanelSnapshot {
  mode: CommissionViewMode
  panel: HTMLElement | null
  titleIds: string[]
  titleElements: HTMLElement[]
}

const defaultDeps: SidebarNavEnhancerDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  clearHash: clearHashIfTargetOffscreen,
  clearHashNow: clearLocationHash,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  prefetchActiveTarget: prefetchDeferredActiveCharacterTarget,
  prefetchArchivedTarget: prefetchDeferredArchivedCharacterTarget,
  requestActiveLoad: requestActiveCharactersLoad,
  requestArchivedLoad: requestArchivedCharactersLoad,
  requestTimelineLoad: requestTimelineViewLoad,
  requestArchivedVisibility: requestArchivedCharactersVisibility,
}

const getCurrentMode = (win: Window): CommissionViewMode => readCommissionViewMode(win)

function getVisibleNavPanel(root: HTMLElement, mode: CommissionViewMode) {
  return root.querySelector<HTMLElement>(`${NAV_PANEL_SELECTOR}[data-sidebar-nav-panel="${mode}"]`)
}

function getVisibleTitleIds(panel: HTMLElement | null) {
  if (!panel)
    return []

  return Array.from(
    panel.querySelectorAll<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR),
    (link) => {
      if (link.getAttribute('aria-disabled') === 'true')
        return null

      return link.dataset.sidebarTitleId ?? null
    },
  )
    .filter((id): id is string => Boolean(id))
}

function toggleDotState(dot: HTMLElement, active: boolean) {
  dot.classList.toggle(ACTIVE_DOT_CLASSES[0], active)
  dot.classList.toggle(ACTIVE_DOT_CLASSES[1], active)
  dot.classList.toggle(HIDDEN_DOT_CLASSES[0], !active)
  dot.classList.toggle(HIDDEN_DOT_CLASSES[1], !active)
}

function toggleViewModeButtonState(button: HTMLButtonElement, active: boolean) {
  button.classList.toggle('text-gray-900', active)
  button.classList.toggle('dark:text-white', active)
  button.classList.toggle('text-gray-700', !active)
  button.classList.toggle('dark:text-gray-200', !active)

  const indicator = button.querySelector<HTMLElement>('[data-sidebar-view-mode-indicator]')
  if (indicator) {
    toggleDotState(indicator, active)
  }
}

function createActivePanelSnapshot({
  mode,
  panel,
}: {
  mode: CommissionViewMode
  panel: HTMLElement | null
}): SidebarActivePanelSnapshot {
  const titleIds = getVisibleTitleIds(panel)
  const titleElements = resolveElementsByIds(titleIds)

  return {
    mode,
    panel,
    titleIds,
    titleElements,
  }
}

function resolveActiveTitleId(titleElements: HTMLElement[]) {
  if (titleElements.length === 0)
    return ''

  return getActiveSectionId(titleElements, getScrollThreshold())
}

function resolveSectionIdFromHref(rawHref: string | null) {
  return normalizeHomeCharacterTargetId(rawHref) || null
}

export function mountSidebarNavEnhancer({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountSidebarNavEnhancerOptions = {}) {
  const deps = { ...defaultDeps, ...depsOverrides }
  const navRoot = doc.getElementById(SIDEBAR_ROOT_ID)
  if (!navRoot)
    return () => {}
  const controlsRoot = doc.getElementById(SIDEBAR_CONTROLS_ROOT_ID) ?? navRoot
  const viewModeToggles = [...controlsRoot.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)]
  const navPanels = [...navRoot.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR)]
  const allSidebarDots = [...navRoot.querySelectorAll<HTMLElement>(SIDEBAR_DOT_SELECTOR)]
  const archivedDetails = navRoot.querySelector<HTMLDetailsElement>(ARCHIVED_DETAILS_SELECTOR)
  const backToTopButton = navRoot.querySelector<HTMLButtonElement>(BACK_TO_TOP_BUTTON_SELECTOR)

  let clearHashMissingRafId: number | null = null
  let syncLinksRafId: number | null = null
  let syncDotsRafId: number | null = null
  let syncBackToTopRafId: number | null = null
  let activePanelSnapshot: SidebarActivePanelSnapshot | null = null
  let activeDots: HTMLElement[] = []
  const panelDotIndexCache = new WeakMap<HTMLElement, Map<string, HTMLElement[]>>()
  let dotsInitialized = false
  let hasTrackedSidebarSearchUsage = false
  let isBackToTopVisible = false
  let disposed = false

  const clearActivePanelSnapshot = () => {
    activePanelSnapshot = null
  }

  const scheduleAnimationFrame = ({
    rafId,
    run,
    setRafId,
  }: {
    rafId: number | null
    run: () => void
    setRafId: (nextRafId: number | null) => void
  }) => {
    if (rafId !== null)
      return

    let didRunSynchronously = false
    const frameId = win.requestAnimationFrame(() => {
      didRunSynchronously = true
      setRafId(null)
      run()
    })
    setRafId(didRunSynchronously ? null : frameId)
  }

  const resetAllDots = () => {
    allSidebarDots.forEach((dot) => {
      toggleDotState(dot, false)
    })
    activeDots = []
    dotsInitialized = true
  }

  const getPanelDotIndex = (panel: HTMLElement) => {
    const cachedIndex = panelDotIndexCache.get(panel)
    if (cachedIndex)
      return cachedIndex

    const nextIndex = new Map<string, HTMLElement[]>()
    panel.querySelectorAll<HTMLElement>(SIDEBAR_DOT_SELECTOR).forEach((dot) => {
      const titleId = dot.dataset.sidebarDotFor
      if (!titleId)
        return

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
    if (!panel || !titleId)
      return []

    return getPanelDotIndex(panel).get(titleId) ?? []
  }

  const syncActiveDotSet = (nextDots: HTMLElement[]) => {
    const prevDotSet = new Set(activeDots)
    const nextDotSet = new Set(nextDots)

    for (const dot of activeDots) {
      if (nextDotSet.has(dot))
        continue
      toggleDotState(dot, false)
    }

    for (const dot of nextDots) {
      if (prevDotSet.has(dot))
        continue
      toggleDotState(dot, true)
    }

    activeDots = nextDots
  }

  const getActivePanelSnapshot = () => {
    const mode = getCurrentMode(win)
    const panel = getVisibleNavPanel(navRoot, mode)
    if (
      activePanelSnapshot
      && activePanelSnapshot.mode === mode
      && activePanelSnapshot.panel === panel
    ) {
      return activePanelSnapshot
    }

    const nextSnapshot = createActivePanelSnapshot({ mode, panel })
    activePanelSnapshot = nextSnapshot
    return nextSnapshot
  }

  const syncViewModeControls = () => {
    const mode = getCurrentMode(win)

    viewModeToggles.forEach((toggle) => {
      const toggleMode = resolveCommissionViewModeFromElement(toggle)
      const active = toggleMode === mode
      toggle.setAttribute('aria-pressed', String(active))
      toggleViewModeButtonState(toggle, active)
    })

    navPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.sidebarNavPanel !== mode)
    })
  }

  const syncCharacterLinkAvailability = () => {
    const mode = getCurrentMode(win)
    const panel = getVisibleNavPanel(navRoot, mode)
    if (!panel)
      return

    syncHiddenSectionLinkAvailability({
      root: panel,
      linkSelector: CHARACTER_LINK_SELECTOR,
      getSectionId: (link) => {
        return resolveSectionIdFromHref(link.getAttribute('href'))
      },
      isDeferredTarget: (sectionId, link) => {
        if (mode === 'timeline') {
          return hasDeferredTimelineTarget(doc, sectionId)
        }

        return (
          (link.dataset.sidebarCharacterStatus === 'active'
            && hasDeferredActiveCharacterTarget(doc, sectionId))
          || (link.dataset.sidebarCharacterStatus === 'archived'
            && hasArchivedCharacterTarget(doc, sectionId))
        )
      },
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

  const scheduleClearHashIfTargetMissing = () => {
    scheduleAnimationFrame({
      rafId: clearHashMissingRafId,
      run: deps.clearHash,
      setRafId: (nextRafId) => {
        clearHashMissingRafId = nextRafId
      },
    })
  }

  const scheduleSyncCharacterLinkAvailability = ({
    invalidateSnapshot = false,
  }: {
    invalidateSnapshot?: boolean
  } = {}) => {
    if (invalidateSnapshot) {
      clearActivePanelSnapshot()
    }

    scheduleAnimationFrame({
      rafId: syncLinksRafId,
      run: syncCharacterLinkAvailability,
      setRafId: (nextRafId) => {
        syncLinksRafId = nextRafId
      },
    })
  }

  const scheduleSyncActiveDots = () => {
    scheduleAnimationFrame({
      rafId: syncDotsRafId,
      run: syncActiveDots,
      setRafId: (nextRafId) => {
        syncDotsRafId = nextRafId
      },
    })
  }

  const setBackToTopButtonVisibility = (visible: boolean) => {
    if (!backToTopButton)
      return

    backToTopButton.classList.toggle('pointer-events-auto', visible)
    backToTopButton.classList.toggle('opacity-100', visible)
    backToTopButton.classList.toggle('translate-y-0', visible)
    backToTopButton.classList.toggle('pointer-events-none', !visible)
    backToTopButton.classList.toggle('opacity-0', !visible)
    backToTopButton.classList.toggle('translate-y-1', !visible)
  }

  const syncBackToTopVisibility = () => {
    syncBackToTopRafId = null
    if (!backToTopButton)
      return

    const nextVisible = win.scrollY > BACK_TO_TOP_VISIBILITY_SCROLL_THRESHOLD
    if (nextVisible === isBackToTopVisible)
      return

    isBackToTopVisible = nextVisible
    setBackToTopButtonVisibility(nextVisible)
  }

  const scheduleSyncBackToTopVisibility = () => {
    scheduleAnimationFrame({
      rafId: syncBackToTopRafId,
      run: syncBackToTopVisibility,
      setRafId: (nextRafId) => {
        syncBackToTopRafId = nextRafId
      },
    })
  }

  const syncAll = () => {
    clearActivePanelSnapshot()
    syncViewModeControls()
    scheduleSyncCharacterLinkAvailability()
    scheduleSyncActiveDots()
    scheduleClearHashIfTargetMissing()
  }

  const openArchivedDetails = () => {
    if (!archivedDetails)
      return
    if (archivedDetails.open)
      return
    archivedDetails.open = true
  }

  const closeArchivedDetails = () => {
    if (!archivedDetails)
      return
    if (!archivedDetails.open)
      return
    archivedDetails.open = false
  }

  const setArchivedDetailsVisibility = (visibility: ArchivedCharactersVisibility) => {
    if (visibility === 'visible') {
      openArchivedDetails()
      return
    }

    closeArchivedDetails()
  }

  const resolveVisibilityFromStateEvent = (event: Event): ArchivedCharactersVisibility => {
    if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
      const visibility = (event.detail as Partial<ArchivedCharactersState>).visibility
      if (visibility === 'visible' || visibility === 'hidden')
        return visibility
    }

    return isArchivedCharactersVisible(doc) ? 'visible' : 'hidden'
  }

  const onArchivedDetailsToggle = (event: Event) => {
    const archivedDetails = event.currentTarget
    if (!(archivedDetails instanceof HTMLDetailsElement))
      return

    const nextVisibility: ArchivedCharactersVisibility = archivedDetails.open ? 'visible' : 'hidden'
    const currentVisibility: ArchivedCharactersVisibility = isArchivedCharactersVisible(doc)
      ? 'visible'
      : 'hidden'
    if (nextVisibility === currentVisibility) {
      return
    }

    deps.requestArchivedVisibility(win, nextVisibility)
  }

  const onArchivedStateChanged = (event: Event) => {
    clearActivePanelSnapshot()
    setArchivedDetailsVisibility(resolveVisibilityFromStateEvent(event))
    scheduleSyncCharacterLinkAvailability()
    scheduleSyncActiveDots()
  }

  const prefetchCharacterTarget = (link: HTMLAnchorElement) => {
    const href = link.getAttribute('href')
    prefetchHomeNavTarget({
      doc,
      href,
      isTimelineTarget: Boolean(
        link.closest<HTMLElement>(`${NAV_PANEL_SELECTOR}[data-sidebar-nav-panel="timeline"]`),
      ),
      prefetchActiveTarget: deps.prefetchActiveTarget,
      prefetchArchivedTarget: deps.prefetchArchivedTarget,
      requestTimelineLoad: deps.requestTimelineLoad,
      status:
        link.dataset.sidebarCharacterStatus === 'active'
          ? 'active'
          : link.dataset.sidebarCharacterStatus === 'archived'
            ? 'archived'
            : null,
      win,
    })
  }

  const onSidebarPreview = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink)
      return

    prefetchCharacterTarget(characterLink)
  }

  const trackSidebarCharacterClick = (link: HTMLAnchorElement) => {
    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      nav_surface: 'sidebar',
      view_mode: getCurrentMode(win),
      character_name: link.textContent?.trim() || 'unknown',
      section_id: link.getAttribute('href')?.replace(HASH_PREFIX_PATTERN, '') || 'unknown',
    })
  }

  const handleDeferredCharacterLinkLoad = ({
    href,
    link,
    loadedEvent,
    requestLoad,
  }: {
    href: string | null
    link: HTMLAnchorElement
    loadedEvent: string
    requestLoad: () => void
  }) => {
    loadDeferredHomeNavTarget({
      isReady: () => Boolean(getHashTarget(getHashFromHref(href))),
      loadedEvent,
      onLoaded: () => {
        deps.scrollToHashWithoutWrite(href)
        scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
        scheduleSyncActiveDots()
      },
      requestLoad,
      win,
    })
    trackSidebarCharacterClick(link)
  }

  const onSidebarClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const modeToggleButton = target.closest<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    if (modeToggleButton) {
      const currentMode = getCurrentMode(win)
      const nextMode = resolveCommissionViewModeFromElement(modeToggleButton)
      if (!nextMode)
        return

      deps.trackEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
        from_mode: currentMode,
        to_mode: nextMode,
        already_active: currentMode === nextMode,
      })
      if (nextMode !== currentMode) {
        replaceCommissionViewModeInAddress(win, nextMode)
      }
      else {
        syncAll()
      }
      return
    }

    const searchLink = target.closest<HTMLAnchorElement>(SEARCH_LINK_SELECTOR)
    if (searchLink) {
      event.preventDefault()

      if (!hasTrackedSidebarSearchUsage) {
        hasTrackedSidebarSearchUsage = true
        deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
          source: 'search_link',
          nav_surface: 'sidebar',
          view_mode: getCurrentMode(win),
        })
      }

      deps.jumpToSearch()
      return
    }

    const archivedLoadTrigger = target.closest<HTMLElement>(ARCHIVED_LOAD_TRIGGER_SELECTOR)
    if (
      archivedLoadTrigger
      && archivedLoadTrigger.closest(ARCHIVED_DETAILS_SELECTOR)
      && !isArchivedCharactersVisible(doc)
    ) {
      event.preventDefault()
      openArchivedDetails()
      return
    }

    const characterLink = target.closest<HTMLAnchorElement>(CHARACTER_LINK_SELECTOR)
    if (!characterLink)
      return

    const mode = getCurrentMode(win)
    const href = characterLink.getAttribute('href')
    const isDeferredTimelineLink = mode === 'timeline' && hasDeferredTimelineTarget(doc, href)
    if (isDeferredTimelineLink) {
      event.preventDefault()
      handleDeferredCharacterLinkLoad({
        href,
        link: characterLink,
        loadedEvent: TIMELINE_VIEW_LOADED_EVENT,
        requestLoad: () => {
          deps.requestTimelineLoad(win, { strategy: 'target', targetId: href ?? undefined })
        },
      })
      return
    }

    const isDeferredActiveLink
      = characterLink.dataset.sidebarCharacterStatus === 'active'
        && hasDeferredActiveCharacterTarget(doc, href)
    if (isDeferredActiveLink) {
      event.preventDefault()
      handleDeferredCharacterLinkLoad({
        href,
        link: characterLink,
        loadedEvent: ACTIVE_CHARACTERS_LOADED_EVENT,
        requestLoad: () => {
          deps.requestActiveLoad(win, { strategy: 'target', targetId: href ?? undefined })
        },
      })
      return
    }

    const isArchivedLink = characterLink.dataset.sidebarCharacterStatus === 'archived'
    const isDeferredArchivedLink = isArchivedLink && hasDeferredArchivedCharacterTarget(doc, href)
    if (isDeferredArchivedLink) {
      event.preventDefault()
      handleDeferredCharacterLinkLoad({
        href,
        link: characterLink,
        loadedEvent: ARCHIVED_CHARACTERS_LOADED_EVENT,
        requestLoad: () => {
          deps.requestArchivedLoad(win, {
            preserveScroll: false,
            strategy: 'target',
            targetId: href ?? undefined,
          })
        },
      })
      return
    }

    if (isArchivedLink && !isArchivedCharactersVisible(doc)) {
      event.preventDefault()
      revealArchivedHomeNavTarget({
        onVisible: () => {
          deps.scrollToHashWithoutWrite(href)
          scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
          scheduleSyncActiveDots()
        },
        requestArchivedVisibility: deps.requestArchivedVisibility,
        win,
      })
      trackSidebarCharacterClick(characterLink)
      return
    }

    if (characterLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    dispatchHomeScrollRestoreAbort(win)

    if (mode === 'timeline') {
      event.preventDefault()
      const timelineHref = characterLink.getAttribute('href')
      deps.scrollToHashWithoutWrite(timelineHref)
    }

    // 浏览器默认行为会把 hash 写入地址栏，等原生滚动完成后清除
    win.requestAnimationFrame(() => {
      deps.clearHashNow()
    })

    trackSidebarCharacterClick(characterLink)
  }

  const onSidebarSearchState = () => {
    scheduleSyncCharacterLinkAvailability({ invalidateSnapshot: true })
    scheduleSyncActiveDots()
    scheduleClearHashIfTargetMissing()
  }
  const onViewModeMaybeChanged = () => {
    clearActivePanelSnapshot()
    syncAll()
  }

  const onBackToTopClick = (event: MouseEvent) => {
    event.preventDefault()
    dispatchHomeScrollRestoreAbort(win)
    win.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  controlsRoot.addEventListener('click', onSidebarClick)
  if (controlsRoot !== navRoot) {
    navRoot.addEventListener('click', onSidebarClick)
  }
  navRoot.addEventListener('pointerover', onSidebarPreview)
  navRoot.addEventListener('focusin', onSidebarPreview)
  archivedDetails?.addEventListener('toggle', onArchivedDetailsToggle)
  win.addEventListener('scroll', scheduleSyncActiveDots, { passive: true })
  win.addEventListener('resize', scheduleSyncActiveDots)
  win.addEventListener('scroll', scheduleClearHashIfTargetMissing, { passive: true })
  if (backToTopButton) {
    backToTopButton.addEventListener('click', onBackToTopClick)
    win.addEventListener('scroll', scheduleSyncBackToTopVisibility, { passive: true })
    setBackToTopButtonVisibility(false)
    syncBackToTopVisibility()
  }
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSearchState)
  win.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onArchivedStateChanged)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeMaybeChanged)
  win.addEventListener('popstate', onViewModeMaybeChanged)

  syncAll()
  setArchivedDetailsVisibility(isArchivedCharactersVisible(doc) ? 'visible' : 'hidden')

  return () => {
    if (disposed)
      return
    disposed = true

    controlsRoot.removeEventListener('click', onSidebarClick)
    if (controlsRoot !== navRoot) {
      navRoot.removeEventListener('click', onSidebarClick)
    }
    navRoot.removeEventListener('pointerover', onSidebarPreview)
    navRoot.removeEventListener('focusin', onSidebarPreview)
    archivedDetails?.removeEventListener('toggle', onArchivedDetailsToggle)
    win.removeEventListener('scroll', scheduleSyncActiveDots)
    win.removeEventListener('resize', scheduleSyncActiveDots)
    win.removeEventListener('scroll', scheduleClearHashIfTargetMissing)
    if (backToTopButton) {
      backToTopButton.removeEventListener('click', onBackToTopClick)
      win.removeEventListener('scroll', scheduleSyncBackToTopVisibility)
    }
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSearchState)
    win.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onArchivedStateChanged)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeMaybeChanged)
    win.removeEventListener('popstate', onViewModeMaybeChanged)

    if (clearHashMissingRafId !== null) {
      win.cancelAnimationFrame(clearHashMissingRafId)
      clearHashMissingRafId = null
    }
    if (syncLinksRafId !== null) {
      win.cancelAnimationFrame(syncLinksRafId)
      syncLinksRafId = null
    }
    if (syncDotsRafId !== null) {
      win.cancelAnimationFrame(syncDotsRafId)
      syncDotsRafId = null
    }
    if (syncBackToTopRafId !== null) {
      win.cancelAnimationFrame(syncBackToTopRafId)
      syncBackToTopRafId = null
    }
  }
}
