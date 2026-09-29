import type { RequestActiveCharactersLoadOptions } from '@features/home/commission/loader/activeCharactersEvent'
import type { HomeCharacterBatchManifest } from '@features/home/server/homeCharacterBatches'
import { normalizeBatchTargetId } from '@features/home/commission/batch/batchManifest'
import {
  fetchHomeCharacterBatch,
  getHomeCharacterBatchTotalCount,
  mountHomeCharacterBatch,
  mountLegacyHomeCharacterBatch,
  prefetchHomeCharacterBatches,
} from '@features/home/commission/batch/homeCharacterBatchClient'
import { fetchFreshHomeCharacterBatchManifest } from '@features/home/commission/batch/homeCharacterBatchManifest'
import {
  ACTIVE_CHARACTERS_LOAD_FAILED_EVENT,
  ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
  ACTIVE_CHARACTERS_LOADED_EVENT,

  resolveDeferredActiveCharacterBatch,
} from '@features/home/commission/loader/activeCharactersEvent'
import { revealHashRestoreShell } from '@features/home/homeScrollRestore'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '@lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_CONTAINER_SELECTOR = '[data-active-sections-container="true"]'
const ACTIVE_SENTINEL_SELECTOR = '[data-active-sections-sentinel="true"]'
const ACTIVE_PRELOAD_MARGIN_PX = 1200
const ACTIVE_BATCH_FETCH_CONCURRENCY = 4
const ACTIVE_IDLE_PREFETCH_BATCH_COUNT = 2
const ACTIVE_IDLE_PREFETCH_TIMEOUT_MS = 1200
const ACTIVE_IDLE_PREFETCH_FALLBACK_DELAY_MS = 180

interface ActiveCharactersLoaderDeps {
  dispatchSidebarSync: typeof dispatchSidebarSearchState
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

interface MountActiveCharactersLoaderOptions {
  win?: Window
  doc?: Document
  deps?: Partial<ActiveCharactersLoaderDeps>
}

type WindowWithIntersectionObserver = Window
  & typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

const defaultDeps: ActiveCharactersLoaderDeps = {
  dispatchSidebarSync: dispatchSidebarSearchState,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

function shouldLoadForSentinel(win: Window, sentinel: HTMLElement | null) {
  if (!sentinel)
    return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + ACTIVE_PRELOAD_MARGIN_PX
}

function readRequestOptions(event: Event): RequestActiveCharactersLoadOptions {
  if (!(event instanceof CustomEvent))
    return {}
  return event.detail ?? {}
}

export function mountActiveCharactersLoader({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountActiveCharactersLoaderOptions = {}) {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(ACTIVE_CONTAINER_SELECTOR) ?? null
  if (!panel || !container)
    return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'active' })
  let intersectionObserver: IntersectionObserver | null = null
  let queue = Promise.resolve(false)
  let cancelIdlePrefetch: (() => void) | null = null

  // Direct panel reads avoid repeated querySelector in exported helpers
  const readLocalBatchCount = () => {
    const value = Number(panel.dataset.activeBatchesLoadedCount ?? '0')
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }
  const isLocalLoaded = () => panel.dataset.activeSectionsLoaded !== 'false'

  const updateLoadedState = (loadedBatchCount: number) => {
    panel.dataset.activeBatchesLoadedCount = String(loadedBatchCount)
    panel.dataset.activeSectionsLoaded = loadedBatchCount >= totalBatchCount ? 'true' : 'false'
  }

  const stopAutoLoad = () => {
    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }

    win.removeEventListener('scroll', syncByViewport)
    win.removeEventListener('resize', syncByViewport)
  }

  const stopIdlePrefetch = () => {
    cancelIdlePrefetch?.()
    cancelIdlePrefetch = null
  }

  const scheduleIdlePrefetch = () => {
    stopIdlePrefetch()

    const loadedBatchCount = readLocalBatchCount()
    if (loadedBatchCount >= totalBatchCount)
      return

    const task = () => {
      prefetchHomeCharacterBatches({
        doc,
        startBatchIndex: loadedBatchCount,
        status: 'active',
        targetBatchIndex: loadedBatchCount + ACTIVE_IDLE_PREFETCH_BATCH_COUNT - 1,
      })
    }

    if (typeof winWithIntersectionObserver.requestIdleCallback === 'function') {
      const handle = winWithIntersectionObserver.requestIdleCallback(task, {
        timeout: ACTIVE_IDLE_PREFETCH_TIMEOUT_MS,
      })
      cancelIdlePrefetch = () => {
        winWithIntersectionObserver.cancelIdleCallback?.(handle)
      }
      return
    }

    const timeoutHandle = win.setTimeout(task, ACTIVE_IDLE_PREFETCH_FALLBACK_DELAY_MS)
    cancelIdlePrefetch = () => {
      win.clearTimeout(timeoutHandle)
    }
  }

  const syncAutoLoad = () => {
    stopAutoLoad()
    if (isLocalLoaded()) {
      stopIdlePrefetch()
      return
    }

    const sentinel = panel?.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR) ?? null
    const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
    if (sentinel && typeof IntersectionObserverCtor === 'function') {
      const observer = new IntersectionObserverCtor(
        (entries: IntersectionObserverEntry[]) => {
          if (!entries.some(entry => entry.isIntersecting))
            return
          syncByViewport()
        },
        { rootMargin: `${ACTIVE_PRELOAD_MARGIN_PX}px 0px` },
      )
      intersectionObserver = observer
      observer.observe(sentinel)
      scheduleIdlePrefetch()
      return
    }

    win.addEventListener('scroll', syncByViewport, { passive: true })
    win.addEventListener('resize', syncByViewport)
    scheduleIdlePrefetch()
    syncByViewport()
  }

  const loadBatchesThrough = async (targetBatchIndex: number, manifestOverride?: HomeCharacterBatchManifest | null) => {
    let didChange = false
    let loadedBatchCount = readLocalBatchCount()
    const effectiveTotalBatchCount = manifestOverride?.active.totalBatches ?? totalBatchCount

    if (loadedBatchCount >= effectiveTotalBatchCount) {
      updateLoadedState(loadedBatchCount)
      return false
    }

    const finalBatchIndex = Math.min(targetBatchIndex, effectiveTotalBatchCount - 1)
    const payloadRequests = new Map<number, ReturnType<typeof fetchHomeCharacterBatch>>()
    const queueBatchFetch = (batchIndex: number) => {
      if (batchIndex > finalBatchIndex || payloadRequests.has(batchIndex))
        return
      payloadRequests.set(
        batchIndex,
        fetchHomeCharacterBatch({ batchIndex, doc, status: 'active', manifestOverride }),
      )
    }

    for (
      let batchIndex = loadedBatchCount;
      batchIndex
      <= Math.min(finalBatchIndex, loadedBatchCount + ACTIVE_BATCH_FETCH_CONCURRENCY - 1);
      batchIndex += 1
    ) {
      queueBatchFetch(batchIndex)
    }

    for (let batchIndex = loadedBatchCount; batchIndex <= finalBatchIndex; batchIndex += 1) {
      queueBatchFetch(batchIndex + ACTIVE_BATCH_FETCH_CONCURRENCY - 1)
      const payload = await payloadRequests.get(batchIndex)
      if (payload) {
        mountHomeCharacterBatch({ container, payload })
      }
      else if (!mountLegacyHomeCharacterBatch({ batchIndex, container, doc, status: 'active' })) {
        break
      }

      loadedBatchCount = batchIndex + 1
      didChange = true
    }

    updateLoadedState(loadedBatchCount)
    if (didChange) {
      deps.dispatchSidebarSync()
    }

    return didChange
  }

  const queueLoad = (options: RequestActiveCharactersLoadOptions = {}) => {
    const run = async () => {
      if (isLocalLoaded()) {
        syncAutoLoad()
        return false
      }

      const loadedBatchCount = readLocalBatchCount()
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
            ? (resolveDeferredActiveCharacterBatch(doc, options.targetId) ?? loadedBatchCount)
            : loadedBatchCount

      const didChange = await loadBatchesThrough(targetBatchIndex, options.manifestOverride)
      if (didChange) {
        win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))
      }
      syncAutoLoad()
      return didChange
    }

    queue = queue.then(run).catch((error) => {
      console.error(error)
      win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_FAILED_EVENT))
      return false
    })

    return queue
  }

  function syncByViewport() {
    if (isLocalLoaded()) {
      stopAutoLoad()
      return
    }

    const sentinel = panel?.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR) ?? null
    if (!shouldLoadForSentinel(win, sentinel))
      return
    void queueLoad({ strategy: 'next' })
  }

  const syncHashTarget = async () => {
    const hash = win.location.hash
    if (!hash || isLocalLoaded())
      return

    if (getHashTarget(hash)) {
      // Element is in the initial HTML. Browser native scroll may have fired at parse
      // time but Chrome can end up at the wrong position after layout shifts from
      // images/deferred content loading above the fold. Scroll explicitly one frame
      // after mount so layout has had a chance to stabilize.
      win.requestAnimationFrame(() => {
        deps.scrollToHashWithoutWrite(hash)
        revealHashRestoreShell(win)
      })
      return
    }

    let batchIndex = resolveDeferredActiveCharacterBatch(doc, hash)
    let manifestOverride: HomeCharacterBatchManifest | null | undefined

    if (batchIndex === null) {
      const freshManifest = await fetchFreshHomeCharacterBatchManifest(doc)
      const targetId = normalizeBatchTargetId(hash)
      if (!freshManifest || !targetId)
        return
      const freshIndex = freshManifest.active.targetBatchById[targetId]
      if (!Number.isInteger(freshIndex))
        return
      batchIndex = freshIndex
      manifestOverride = freshManifest
    }

    void queueLoad({ strategy: 'target', targetId: hash, targetBatchCount: batchIndex + 1, manifestOverride }).then(() => {
      // Do NOT guard on win.location.hash — it may have been transiently cleared by
      // clearHashIfTargetOffscreen while the batch was loading (element not yet in DOM).
      // Do NOT guard on didChange — a concurrent load may have already mounted the
      // batch (didChange=false) but the target is now in DOM.
      // Wrap in RAF so layout is committed before scroll.
      win.requestAnimationFrame(() => {
        deps.scrollToHashWithoutWrite(hash)
        win.requestAnimationFrame(() => {
          revealHashRestoreShell(win)
        })
      })
    })
  }

  const onLoadRequest = (event: Event) => {
    void queueLoad(readRequestOptions(event))
  }

  updateLoadedState(readLocalBatchCount())
  win.addEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener('hashchange', syncHashTarget)
  syncHashTarget()
  syncAutoLoad()

  return () => {
    stopAutoLoad()
    stopIdlePrefetch()
    win.removeEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
