import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedState,
  requestActiveCharactersLoad,
} from '#features/home/commission/activeCharactersEvent'
import {
  STALE_CHARACTERS_LOADED_EVENT,
  readStaleCharactersState,
  requestStaleCharactersLoad,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'

const HOME_SCROLL_STATE_STORAGE_KEY = 'home:scroll-state'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'
const TIMELINE_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'

type Cleanup = () => void

type SavedHomeScrollState = {
  pathname: string
  search: string
  x: number
  y: number
}

type HomeScrollRestoreDeps = {
  readNavigationType: (win: Window) => string
  requestActiveLoad: (win: Window) => void
  requestStaleLoad: (win: Window) => void
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
  restoreScrollPosition: (win, position) => {
    const scrollingElement = win.document.scrollingElement
    if (scrollingElement) {
      scrollingElement.scrollLeft = position.x
      scrollingElement.scrollTop = position.y
      return
    }

    if (win.navigator.userAgent.includes('jsdom')) {
      return
    }

    if (typeof win.scrollTo !== 'function') return

    try {
      win.scrollTo(position.x, position.y)
    } catch {
      // jsdom does not implement scrolling; treat it as a no-op there.
    }
  },
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

const hasPendingStaleSections = (doc: Document) =>
  Boolean(doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR))

const isTimelineLoaded = (doc: Document) =>
  doc.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)?.dataset.timelineLoaded === 'true'

const hasPendingTimelineSections = (doc: Document) =>
  Boolean(doc.querySelector<HTMLTemplateElement>(TIMELINE_TEMPLATE_SELECTOR))

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

  const tryRestore = () => {
    if (disposed || restored) return

    if (readCommissionViewMode(win) === 'timeline') {
      if (!isTimelineLoaded(doc) && hasPendingTimelineSections(doc)) {
        deps.requestTimelineLoad(win)
        return
      }

      restored = true
      clearSavedState(win)
      scheduleRestore({ deps, savedState, win })
      return
    }

    if (needsMoreContentForRestore(win, savedState)) {
      if (!readActiveCharactersLoadedState(doc)) {
        deps.requestActiveLoad(win)
        return
      }

      if (!readStaleCharactersState(doc).loaded && hasPendingStaleSections(doc)) {
        deps.requestStaleLoad(win)
        return
      }
    }

    restored = true
    clearSavedState(win)
    scheduleRestore({ deps, savedState, win })
  }

  win.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, tryRestore)
  win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, tryRestore)
  win.addEventListener(TIMELINE_VIEW_LOADED_EVENT, tryRestore)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, tryRestore)

  tryRestore()

  return () => {
    disposed = true
    win.removeEventListener('pagehide', persistNow)
    win.removeEventListener('beforeunload', persistNow)
    win.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, tryRestore)
    win.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, tryRestore)
    win.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, tryRestore)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, tryRestore)
  }
}
