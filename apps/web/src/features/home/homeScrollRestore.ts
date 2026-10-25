import { restoreScrollPosition as restoreWindowScrollPosition } from '@lib/navigation/restoreScrollPosition'

const HOME_SCROLL_STATE_STORAGE_KEY = 'home:scroll-state'
const HOME_SCROLL_RESTORING_ATTRIBUTE = 'data-home-scroll-restoring'

type Cleanup = () => void

interface SavedHomeScrollState {
  pathname: string
  search: string
  x: number
  y: number
}

interface HomeScrollRestoreDeps {
  readNavigationType: (win: Window) => string
  restoreScrollPosition: (win: Window, position: { x: number, y: number }) => void
}

interface MountHomeScrollRestoreOptions {
  deps?: Partial<HomeScrollRestoreDeps>
  win?: Window
}

const defaultDeps: HomeScrollRestoreDeps = {
  readNavigationType: (win) => {
    const navigationEntry = win.performance.getEntriesByType('navigation')[0]
    return navigationEntry && 'type' in navigationEntry ? String(navigationEntry.type) : ''
  },
  restoreScrollPosition: restoreWindowScrollPosition,
}

function readSavedState(win: Window): SavedHomeScrollState | null {
  const rawState = win.sessionStorage.getItem(HOME_SCROLL_STATE_STORAGE_KEY)
  if (!rawState)
    return null

  try {
    const parsedState = JSON.parse(rawState) as Partial<SavedHomeScrollState>
    if (
      typeof parsedState.pathname !== 'string'
      || typeof parsedState.search !== 'string'
      || typeof parsedState.x !== 'number'
      || typeof parsedState.y !== 'number'
    ) {
      return null
    }

    return {
      pathname: parsedState.pathname,
      search: parsedState.search,
      x: parsedState.x,
      y: parsedState.y,
    }
  }
  catch {
    return null
  }
}

function clearSavedState(win: Window) {
  win.sessionStorage.removeItem(HOME_SCROLL_STATE_STORAGE_KEY)
}

function revealRestoringShell(win: Window) {
  win.document.documentElement.removeAttribute(HOME_SCROLL_RESTORING_ATTRIBUTE)
}

function persistScrollState(win: Window) {
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

function shouldRestoreSavedState({
  navigationType,
  savedState,
  win,
}: {
  navigationType: string
  savedState: SavedHomeScrollState | null
  win: Window
}) {
  if (navigationType !== 'reload' || !savedState)
    return false
  if (win.location.hash)
    return false

  return savedState.pathname === win.location.pathname && savedState.search === win.location.search
}

function scheduleRestore({
  deps,
  savedState,
  win,
}: {
  deps: HomeScrollRestoreDeps
  savedState: SavedHomeScrollState
  win: Window
}) {
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => {
      deps.restoreScrollPosition(win, { x: savedState.x, y: savedState.y })
      win.requestAnimationFrame(() => {
        revealRestoringShell(win)
      })
    })
  })
}

export function mountHomeScrollRestore({
  win = window,
  deps: depsOverrides,
}: MountHomeScrollRestoreOptions = {}): Cleanup {
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

  clearSavedState(win)
  // Every section is in the static HTML, so the saved offset is reachable on mount.
  scheduleRestore({ deps, savedState, win })

  return () => {
    revealRestoringShell(win)
    win.removeEventListener('pagehide', persistNow)
    win.removeEventListener('beforeunload', persistNow)
  }
}
