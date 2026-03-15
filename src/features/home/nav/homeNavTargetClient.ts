import type {
  StaleCharactersVisibility,
} from '#features/home/commission/staleCharactersEvent'
import type { RequestTimelineViewLoadOptions } from '#features/home/commission/timelineViewEvent'
import { STALE_CHARACTERS_STATE_CHANGE_EVENT } from '#features/home/commission/staleCharactersEvent'
import { dispatchHomeScrollRestoreAbort } from '#features/home/events'

type CharacterStatus = 'active' | 'stale'

interface PrefetchHomeNavTargetOptions {
  doc: Document
  href: string | null
  isTimelineTarget: boolean
  prefetchActiveTarget: (doc: Document, targetId: string | null | undefined) => void
  prefetchStaleTarget: (doc: Document, targetId: string | null | undefined) => void
  requestTimelineLoad: (win: Window, options?: RequestTimelineViewLoadOptions) => void
  status: CharacterStatus | null
  targetId?: string | null
  win: Window
}

interface LoadDeferredHomeNavTargetOptions {
  loadedEvent: string
  onLoaded: () => void
  requestLoad: () => void
  win: Window
}

interface RevealStaleHomeNavTargetOptions {
  onVisible: () => void
  requestStaleVisibility: (win: Window, visibility: StaleCharactersVisibility) => void
  win: Window
}

export function prefetchHomeNavTarget({
  doc,
  href,
  isTimelineTarget,
  prefetchActiveTarget,
  prefetchStaleTarget,
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

  if (status === 'active') {
    prefetchActiveTarget(doc, resolvedTargetId)
    return
  }

  if (status === 'stale') {
    prefetchStaleTarget(doc, resolvedTargetId)
  }
}

export function loadDeferredHomeNavTarget({
  loadedEvent,
  onLoaded,
  requestLoad,
  win,
}: LoadDeferredHomeNavTargetOptions) {
  dispatchHomeScrollRestoreAbort(win)

  const handleLoaded = () => {
    onLoaded()
  }

  win.addEventListener(loadedEvent, handleLoaded, { once: true })
  requestLoad()
}

export function revealStaleHomeNavTarget({
  onVisible,
  requestStaleVisibility,
  win,
}: RevealStaleHomeNavTargetOptions) {
  dispatchHomeScrollRestoreAbort(win)

  const handleShown = (event: Event) => {
    if (!(event instanceof CustomEvent) || event.detail?.visibility !== 'visible') {
      return
    }

    onVisible()
  }

  win.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, handleShown, { once: true })
  requestStaleVisibility(win, 'visible')
}
