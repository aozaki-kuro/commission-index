import type { RequestTimelineViewLoadOptions } from '#features/home/commission/timelineViewEvent'
import {
  getHomeTimelineBatchTotalCount,
  readTimelineLoadedBatchCount,
  readTimelineLoadedState,
  resolveDeferredTimelineBatch,
  TIMELINE_VIEW_LOAD_REQUEST_EVENT,
  writeTimelineLoadedBatchCount,
  writeTimelineLoadedState,
} from '#features/home/commission/timelineViewEvent'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

export const TIMELINE_VIEW_LOADED_EVENT = 'home:timeline-view-loaded'

const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'
const TIMELINE_CONTAINER_SELECTOR = '[data-timeline-sections-container="true"]'
const TIMELINE_LEGACY_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'
const TIMELINE_SENTINEL_SELECTOR = '[data-timeline-sections-sentinel="true"]'
const TIMELINE_PRELOAD_MARGIN_PX = 1200

interface TimelineViewLoaderDeps {
  dispatchSidebarSync: typeof dispatchSidebarSearchState
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

interface MountTimelineViewLoaderOptions {
  win?: Window
  doc?: Document
  deps?: Partial<TimelineViewLoaderDeps>
}

const defaultDeps: TimelineViewLoaderDeps = {
  dispatchSidebarSync: dispatchSidebarSearchState,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

type WindowWithIntersectionObserver = Window
  & typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
  }

function shouldLoadForSentinel(win: Window, sentinel: HTMLElement | null) {
  if (!sentinel)
    return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + TIMELINE_PRELOAD_MARGIN_PX
}

function readRequestOptions(event: Event): RequestTimelineViewLoadOptions {
  if (!(event instanceof CustomEvent))
    return {}
  return event.detail ?? {}
}

function mountTimelineBatch({
  batchIndex,
  container,
  panel,
}: {
  batchIndex: number
  container: HTMLElement
  panel: HTMLElement
}) {
  const template = panel.querySelector<HTMLTemplateElement>(
    `template[data-timeline-batch-index="${batchIndex}"]`,
  )
  if (!template)
    return false

  container.append(template.content.cloneNode(true))
  template.remove()
  return true
}

function mountLegacyTimelineBatch({
  batchIndex,
  container,
  panel,
}: {
  batchIndex: number
  container: HTMLElement
  panel: HTMLElement
}) {
  if (batchIndex !== 0)
    return false

  const template = panel.querySelector<HTMLTemplateElement>(TIMELINE_LEGACY_TEMPLATE_SELECTOR)
  if (!template)
    return false

  container.append(template.content.cloneNode(true))
  template.remove()
  return true
}

export function mountTimelineViewLoader({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountTimelineViewLoaderOptions = {}) {
  const panel = doc.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(TIMELINE_CONTAINER_SELECTOR) ?? null
  if (!panel || !container)
    return () => {}
  const timelinePanel = panel

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  let intersectionObserver: IntersectionObserver | null = null
  let queue = Promise.resolve(false)
  let hasSyncedMode = false

  const updateLoadedState = (loadedBatchCount: number) => {
    writeTimelineLoadedBatchCount(timelinePanel, loadedBatchCount)
    const totalBatchCount = getHomeTimelineBatchTotalCount(doc)
    writeTimelineLoadedState(timelinePanel, loadedBatchCount >= totalBatchCount)
  }

  const stopAutoLoad = () => {
    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }

    win.removeEventListener('scroll', syncByViewport)
    win.removeEventListener('resize', syncByViewport)
  }

  const syncAutoLoad = () => {
    stopAutoLoad()
    if (readCommissionViewMode(win) !== 'timeline')
      return
    if (readTimelineLoadedState(doc))
      return

    const sentinel = timelinePanel.querySelector<HTMLElement>(TIMELINE_SENTINEL_SELECTOR)
    const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
    if (sentinel && typeof IntersectionObserverCtor === 'function') {
      const observer = new IntersectionObserverCtor(
        (entries: IntersectionObserverEntry[]) => {
          if (!entries.some(entry => entry.isIntersecting))
            return
          syncByViewport()
        },
        { rootMargin: `${TIMELINE_PRELOAD_MARGIN_PX}px 0px` },
      )
      intersectionObserver = observer
      observer.observe(sentinel)
      return
    }

    win.addEventListener('scroll', syncByViewport, { passive: true })
    win.addEventListener('resize', syncByViewport)
    syncByViewport()
  }

  const loadBatchesThrough = async (targetBatchIndex: number) => {
    const totalBatchCount = getHomeTimelineBatchTotalCount(doc)
    let loadedBatchCount = readTimelineLoadedBatchCount(doc)
    if (loadedBatchCount >= totalBatchCount) {
      updateLoadedState(loadedBatchCount)
      return false
    }

    const finalBatchIndex = Math.min(targetBatchIndex, totalBatchCount - 1)
    let didChange = false

    for (let batchIndex = loadedBatchCount; batchIndex <= finalBatchIndex; batchIndex += 1) {
      if (
        !mountTimelineBatch({ batchIndex, container, panel: timelinePanel })
        && !mountLegacyTimelineBatch({ batchIndex, container, panel: timelinePanel })
      ) {
        break
      }

      loadedBatchCount = batchIndex + 1
      didChange = true
    }

    updateLoadedState(loadedBatchCount)
    if (didChange) {
      deps.dispatchSidebarSync()
      win.dispatchEvent(new Event(TIMELINE_VIEW_LOADED_EVENT))
    }
    return didChange
  }

  const queueLoad = (options: RequestTimelineViewLoadOptions = {}) => {
    const run = async () => {
      if (readTimelineLoadedState(doc)) {
        syncAutoLoad()
        return false
      }

      const loadedBatchCount = readTimelineLoadedBatchCount(doc)
      const totalBatchCount = getHomeTimelineBatchTotalCount(doc)
      if (loadedBatchCount >= totalBatchCount) {
        updateLoadedState(loadedBatchCount)
        syncAutoLoad()
        return false
      }

      const strategy = options.strategy ?? 'next'
      const targetBatchIndex = Number.isInteger(options.targetBatchCount)
        ? Math.max(loadedBatchCount, Number(options.targetBatchCount) - 1)
        : strategy === 'all'
          ? totalBatchCount - 1
          : strategy === 'target'
            ? (resolveDeferredTimelineBatch(doc, options.targetId) ?? loadedBatchCount)
            : loadedBatchCount

      const didChange = await loadBatchesThrough(targetBatchIndex)
      syncAutoLoad()
      return didChange
    }

    queue = queue.then(run).catch((error) => {
      console.error(error)
      return false
    })

    return queue
  }

  function syncByViewport() {
    if (readCommissionViewMode(win) !== 'timeline') {
      stopAutoLoad()
      return
    }

    if (readTimelineLoadedState(doc)) {
      stopAutoLoad()
      return
    }

    const sentinel = timelinePanel.querySelector<HTMLElement>(TIMELINE_SENTINEL_SELECTOR)
    if (!shouldLoadForSentinel(win, sentinel))
      return
    void queueLoad({ strategy: 'next' })
  }

  const syncByMode = () => {
    const didSyncBefore = hasSyncedMode
    hasSyncedMode = true

    if (readCommissionViewMode(win) !== 'timeline') {
      stopAutoLoad()
      return
    }

    syncAutoLoad()

    if (!win.location.hash)
      return
    const hashTarget = getHashTarget(win.location.hash)
    if (hashTarget?.isConnected) {
      if (didSyncBefore) {
        deps.scrollToHashWithoutWrite(win.location.hash)
      }
      return
    }

    const hash = win.location.hash
    const targetBatchIndex = resolveDeferredTimelineBatch(doc, hash)
    if (targetBatchIndex === null) {
      return
    }

    void queueLoad({ strategy: 'target', targetId: hash }).then(() => {
      if (!win.location.hash)
        return
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const syncHashTarget = () => {
    if (readCommissionViewMode(win) !== 'timeline')
      return

    const hash = win.location.hash
    if (!hash)
      return
    const hashTarget = getHashTarget(hash)
    if (hashTarget?.isConnected)
      return

    const targetBatchIndex = resolveDeferredTimelineBatch(doc, hash)
    if (targetBatchIndex === null)
      return

    void queueLoad({ strategy: 'target', targetId: hash }).then(() => {
      if (!win.location.hash)
        return
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const onLoadRequest = (event: Event) => {
    void queueLoad(readRequestOptions(event))
  }

  updateLoadedState(readTimelineLoadedBatchCount(doc))
  syncAutoLoad()
  win.addEventListener(TIMELINE_VIEW_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByMode)
  win.addEventListener('popstate', syncByMode)
  win.addEventListener('hashchange', syncHashTarget)
  syncByMode()
  syncHashTarget()

  return () => {
    stopAutoLoad()
    win.removeEventListener(TIMELINE_VIEW_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByMode)
    win.removeEventListener('popstate', syncByMode)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
