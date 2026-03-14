import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
  requestActiveCharactersLoad,
  type RequestActiveCharactersLoadOptions,
} from '#features/home/commission/activeCharactersEvent'
import {
  STALE_CHARACTERS_LOADED_EVENT,
  readStaleCharactersLoadedBatchCount,
  readStaleCharactersState,
  requestStaleCharactersLoad,
  type RequestStaleCharactersLoadOptions,
} from '#features/home/commission/staleCharactersEvent'
import { HOME_SCROLL_RESTORE_ABORT_EVENT } from '#features/home/homeScrollRestoreAbort'
import { getHomeCharacterBatchTotalCount } from '#features/home/commission/homeCharacterBatchClient'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'
import { restoreScrollPosition as restoreWindowScrollPosition } from '#lib/navigation/restoreScrollPosition'

const HOME_SCROLL_STATE_STORAGE_KEY = 'home:scroll-state'
const HOME_SCROLL_RESTORING_ATTRIBUTE = 'data-home-scroll-restoring'
const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'
const TIMELINE_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'
const RESTORE_BATCH_WINDOW = 4

type Cleanup = () => void

type SavedHomeScrollState = {
  pathname: string
  search: string
  x: number
  y: number
}

type HomeScrollRestoreDeps = {
  readNavigationType: (win: Window) => string
  requestActiveLoad: (win: Window, options?: RequestActiveCharactersLoadOptions) => void
  requestStaleLoad: (win: Window, options?: RequestStaleCharactersLoadOptions) => void
  requestTimelineLoad: (win: Window) => void
  restoreScrollPosition: (win: Window, position: { x: number; y: number }) => void
}

type MountHomeScrollRestoreOptions = {
  deps?: Partial<HomeScrollRestoreDeps>
  doc?: Document
  win?: Window
}

const defaultDeps: HomeScrollRestoreDeps = {
  readNavigationType: win => {
    const navigationEntry = win.performance.getEntriesByType('navigation')[0]
    return navigationEntry && 'type' in navigationEntry ? String(navigationEntry.type) : ''
  },
  requestActiveLoad: requestActiveCharactersLoad,
  requestStaleLoad: requestStaleCharactersLoad,
  requestTimelineLoad: win => {
    win.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
  },
  restoreScrollPosition: restoreWindowScrollPosition,
}

const readSavedState = (win: Window): SavedHomeScrollState | null => {
  const rawState = win.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)
  if (!rawState) return null

  try {
    const parsedState = JSON.parse(rawState) as Partial<SavedHomeScrollState>
    if (
      typeof parsedState.pathname !== 'string' ||
      typeof parsedState.search !== 'string' ||
      typeof parsedState.x !== 'number' ||
      typeof parsedState.y !== 'number'
    ) {
      return null
    }

    return {
      pathname: parsedState.pathname,
      search: parsedState.search,
      x: parsedState.x,
      y: parsedState.y,
    }
  } catch {
    return null
  }
}

const clearSavedState = (win: Window) => {
  win.sessionStorage.removeItem(HOME_SCROLL_STATE_STORAGE_KEY)
}

const revealRestoringShell = (win: Window) => {
  win.document.documentElement.removeAttribute(HOME_SCROLL_RESTORING_ATTRIBUTE)
}

const persistScrollState = (win: Window) => {
  if (win.location.hash) {
    clearSavedState(win)
    return
  }

  win.sessionStorage.setItem(
    HOME_SCROLL_STATE_STORAGE_KEY,
    JSON.stringify({
      pathname: win.location.pathname,
      search: win.location.search,
      x: win.scrollX,
      y: win.scrollY,
    } satisfies SavedHomeScrollState),
  )
}

const shouldRestoreSavedState = ({
  navigationType,
  savedState,
  win,
}: {
  navigationType: string
  savedState: SavedHomeScrollState | null
  win: Window
}) => {
  if (navigationType !== 'reload' || !savedState) return false
  if (win.location.hash) return false

  return savedState.pathname === win.location.pathname && savedState.search === win.location.search
}

const getMaxScrollableY = (win: Window) => {
  const scrollingElement = win.document.scrollingElement
  if (!scrollingElement) return 0

  return Math.max(0, scrollingElement.scrollHeight - win.innerHeight)
}

const needsMoreContentForRestore = (win: Window, savedState: SavedHomeScrollState) =>
  savedState.y > getMaxScrollableY(win) + 1

const isTimelineLoaded = (doc: Document) =>
  doc.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)?.dataset.timelineLoaded === 'true'

const hasPendingTimelineSections = (doc: Document) =>
  Boolean(doc.querySelector<HTMLTemplateElement>(TIMELINE_TEMPLATE_SELECTOR))

const readScrollRestoration = (win: Window): ScrollRestoration | null => {
  const history = win.history as History & { scrollRestoration?: ScrollRestoration }
  if (history.scrollRestoration === 'auto' || history.scrollRestoration === 'manual') {
    return history.scrollRestoration
  }

  return null
}

const writeScrollRestoration = (win: Window, mode: ScrollRestoration) => {
  try {
    ;(win.history as History & { scrollRestoration?: ScrollRestoration }).scrollRestoration = mode
  } catch {
    // Ignore unsupported browsers and keep restore flow running.
  }
}

const scheduleRestore = ({
  deps,
  savedState,
  win,
}: {
  deps: HomeScrollRestoreDeps
  savedState: SavedHomeScrollState
  win: Window
}) => {
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => {
      deps.restoreScrollPosition(win, { x: savedState.x, y: savedState.y })
      win.requestAnimationFrame(() => {
        revealRestoringShell(win)
      })
    })
  })
}

export const mountHomeScrollRestore = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountHomeScrollRestoreOptions = {}): Cleanup => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const persistNow = () => {
    persistScrollState(win)
  }

  win.addEventListener('pagehide', persistNow)
  win.addEventListener('beforeunload', persistNow)

  const savedState = readSavedState(win)
  const navigationType = deps.readNavigationType(win)
  const shouldRestore = shouldRestoreSavedState({ navigationType, savedState, win })
  if (!shouldRestore || !savedState) {
    revealRestoringShell(win)
    if (savedState && win.location.hash) {
      clearSavedState(win)
    }

    return () => {
      win.removeEventListener('pagehide', persistNow)
      win.removeEventListener('beforeunload', persistNow)
    }
  }

  let disposed = false
  let restored = false
  const staleTotalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'stale' })
  const revealFallbackTimer = win.setTimeout(() => {
    revealRestoringShell(win)
  }, 3000)
  const originalScrollRestoration = readScrollRestoration(win)
  if (originalScrollRestoration && originalScrollRestoration !== 'manual') {
    writeScrollRestoration(win, 'manual')
  }

  let restoredScrollRestoration = false
  const restoreBrowserScrollRestoration = () => {
    if (restoredScrollRestoration) return
    restoredScrollRestoration = true
    if (!originalScrollRestoration) return
    writeScrollRestoration(win, originalScrollRestoration)
  }

  const completeRestore = ({ schedule }: { schedule: boolean }) => {
    if (restored) return
    restored = true
    clearSavedState(win)
    restoreBrowserScrollRestoration()
    win.clearTimeout(revealFallbackTimer)
    if (schedule) {
      scheduleRestore({ deps, savedState, win })
      return
    }

    revealRestoringShell(win)
  }

  const abortRestore = () => {
    if (disposed) return
    completeRestore({ schedule: false })
  }

  const tryRestore = () => {
    if (disposed || restored) return

    if (readCommissionViewMode(win) === 'timeline') {
      if (!isTimelineLoaded(doc) && hasPendingTimelineSections(doc)) {
        deps.requestTimelineLoad(win)
        return
      }

      completeRestore({ schedule: true })
      return
    }

    if (needsMoreContentForRestore(win, savedState)) {
      if (!readActiveCharactersLoadedState(doc)) {
        deps.requestActiveLoad(win, {
          targetBatchCount: readActiveCharactersLoadedBatchCount(doc) + RESTORE_BATCH_WINDOW,
        })
        return
      }

      if (
        !readStaleCharactersState(doc).loaded &&
        readStaleCharactersLoadedBatchCount(doc) < staleTotalBatchCount
      ) {
        deps.requestStaleLoad(win, {
          preserveScroll: false,
          targetBatchCount: readStaleCharactersLoadedBatchCount(doc) + RESTORE_BATCH_WINDOW,
        })
        return
      }
    }

    completeRestore({ schedule: true })
  }

  win.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, tryRestore)
  win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, tryRestore)
  win.addEventListener(TIMELINE_VIEW_LOADED_EVENT, tryRestore)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, tryRestore)
  win.addEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, abortRestore)

  tryRestore()

  return () => {
    disposed = true
    win.clearTimeout(revealFallbackTimer)
    revealRestoringShell(win)
    restoreBrowserScrollRestoration()
    win.removeEventListener('pagehide', persistNow)
    win.removeEventListener('beforeunload', persistNow)
    win.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, tryRestore)
    win.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, tryRestore)
    win.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, tryRestore)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, tryRestore)
    win.removeEventListener(HOME_SCROLL_RESTORE_ABORT_EVENT, abortRestore)
  }
}
