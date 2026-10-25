import type {
  ArchivedCharactersVisibility,
} from '@features/home/commission/loader/archivedCharactersEvent'
import type { RequestTimelineViewLoadOptions } from '@features/home/commission/loader/timelineViewEvent'
import { ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT } from '@features/home/commission/loader/archivedCharactersEvent'
import { dispatchHomeScrollRestoreAbort } from '@features/home/events'

type CharacterStatus = 'active' | 'archived'
const HOME_NAV_TARGET_WAIT_TIMEOUT_MS = 10000

interface PrefetchHomeNavTargetOptions {
  doc: Document
  href: string | null
  isTimelineTarget: boolean
  prefetchActiveTarget: (doc: Document, targetId: string | null | undefined) => void
  requestTimelineLoad: (win: Window, options?: RequestTimelineViewLoadOptions) => void
  status: CharacterStatus | null
  targetId?: string | null
  win: Window
}

interface LoadDeferredHomeNavTargetOptions {
  isReady?: () => boolean
  loadedEvent: string
  onLoaded: () => void
  requestLoad: () => void | Promise<unknown>
  timeoutMs?: number
  win: Window
}

interface RevealArchivedHomeNavTargetOptions {
  isReady?: () => boolean
  onVisible: () => void
  requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
  timeoutMs?: number
  win: Window
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value
}

export function prefetchHomeNavTarget({
  doc,
  href,
  isTimelineTarget,
  prefetchActiveTarget,
  requestTimelineLoad,
  status,
  targetId,
  win,
}: PrefetchHomeNavTargetOptions) {
  const resolvedTargetId = targetId ?? href ?? undefined

  if (isTimelineTarget) {
    requestTimelineLoad(win, {
      strategy: 'target',
      targetId: href ?? resolvedTargetId,
    })
    return
  }

  // Archived sections are always in the DOM, so only active targets can still need a batch.
  if (status === 'active') {
    prefetchActiveTarget(doc, resolvedTargetId)
  }
}

export function loadDeferredHomeNavTarget({
  isReady,
  loadedEvent,
  onLoaded,
  requestLoad,
  timeoutMs = HOME_NAV_TARGET_WAIT_TIMEOUT_MS,
  win,
}: LoadDeferredHomeNavTargetOptions) {
  dispatchHomeScrollRestoreAbort(win)

  let timeoutHandle: number | null = null

  function cleanup() {
    win.removeEventListener(loadedEvent, handleLoaded)
    if (timeoutHandle !== null) {
      win.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  function handleLoaded() {
    if (isReady && !isReady()) {
      return
    }

    cleanup()
    onLoaded()
  }

  win.addEventListener(loadedEvent, handleLoaded)
  timeoutHandle = win.setTimeout(cleanup, timeoutMs)

  try {
    const request = requestLoad()
    if (isPromiseLike(request)) {
      void request.catch(() => {
        cleanup()
      })
    }
  }
  catch (error) {
    cleanup()
    throw error
  }
}

export function revealArchivedHomeNavTarget({
  isReady,
  onVisible,
  requestArchivedVisibility,
  timeoutMs = HOME_NAV_TARGET_WAIT_TIMEOUT_MS,
  win,
}: RevealArchivedHomeNavTargetOptions) {
  dispatchHomeScrollRestoreAbort(win)

  let timeoutHandle: number | null = null

  function cleanup() {
    win.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, handleShown)
    if (timeoutHandle !== null) {
      win.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  function handleShown(event: Event) {
    if (!(event instanceof CustomEvent) || event.detail?.visibility !== 'visible') {
      return
    }

    if (isReady && !isReady()) {
      return
    }

    cleanup()
    onVisible()
  }

  win.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, handleShown)
  timeoutHandle = win.setTimeout(cleanup, timeoutMs)

  try {
    requestArchivedVisibility(win, 'visible')
  }
  catch (error) {
    cleanup()
    throw error
  }
}
