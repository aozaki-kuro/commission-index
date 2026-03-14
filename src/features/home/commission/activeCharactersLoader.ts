import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
  resolveDeferredActiveCharacterBatch,
  type RequestActiveCharactersLoadOptions,
} from '#features/home/commission/activeCharactersEvent'
import {
  fetchHomeCharacterBatch,
  getHomeCharacterBatchTotalCount,
  mountLegacyHomeCharacterBatch,
  mountHomeCharacterBatch,
} from '#features/home/commission/homeCharacterBatchClient'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_CONTAINER_SELECTOR = '[data-active-sections-container="true"]'
const ACTIVE_SENTINEL_SELECTOR = '[data-active-sections-sentinel="true"]'
const ACTIVE_PRELOAD_MARGIN_PX = 1200
const ACTIVE_BATCH_FETCH_CONCURRENCY = 4

type ActiveCharactersLoaderDeps = {
  dispatchSidebarSync: typeof dispatchSidebarSearchState
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

type MountActiveCharactersLoaderOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<ActiveCharactersLoaderDeps>
}

type WindowWithIntersectionObserver = Window &
  typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
  }

const defaultDeps: ActiveCharactersLoaderDeps = {
  dispatchSidebarSync: dispatchSidebarSearchState,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

const shouldLoadForSentinel = (win: Window, sentinel: HTMLElement | null) => {
  if (!sentinel) return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + ACTIVE_PRELOAD_MARGIN_PX
}

const readRequestOptions = (event: Event): RequestActiveCharactersLoadOptions => {
  if (!(event instanceof CustomEvent)) return {}
  return event.detail ?? {}
}

export const mountActiveCharactersLoader = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountActiveCharactersLoaderOptions = {}) => {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(ACTIVE_CONTAINER_SELECTOR) ?? null
  if (!panel || !container) return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  let intersectionObserver: IntersectionObserver | null = null
  let queue = Promise.resolve(false)

  const updateLoadedState = (loadedBatchCount: number) => {
    panel.dataset.activeBatchesLoadedCount = String(loadedBatchCount)
    const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'active' })
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

  const syncAutoLoad = () => {
    stopAutoLoad()
    if (readActiveCharactersLoadedState(doc)) return

    const sentinel = panel.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR)
    const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
    if (sentinel && typeof IntersectionObserverCtor === 'function') {
      const observer = new IntersectionObserverCtor(
        (entries: IntersectionObserverEntry[]) => {
          if (!entries.some(entry => entry.isIntersecting)) return
          syncByViewport()
        },
        { rootMargin: `${ACTIVE_PRELOAD_MARGIN_PX}px 0px` },
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
    let didChange = false
    let loadedBatchCount = readActiveCharactersLoadedBatchCount(doc)
    const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'active' })

    if (loadedBatchCount >= totalBatchCount) {
      updateLoadedState(loadedBatchCount)
      return false
    }

    const finalBatchIndex = Math.min(targetBatchIndex, totalBatchCount - 1)
    const payloadRequests = new Map<number, ReturnType<typeof fetchHomeCharacterBatch>>()
    const queueBatchFetch = (batchIndex: number) => {
      if (batchIndex > finalBatchIndex || payloadRequests.has(batchIndex)) return
      payloadRequests.set(
        batchIndex,
        fetchHomeCharacterBatch({ batchIndex, doc, status: 'active' }),
      )
    }

    for (
      let batchIndex = loadedBatchCount;
      batchIndex <=
      Math.min(finalBatchIndex, loadedBatchCount + ACTIVE_BATCH_FETCH_CONCURRENCY - 1);
      batchIndex += 1
    ) {
      queueBatchFetch(batchIndex)
    }

    for (let batchIndex = loadedBatchCount; batchIndex <= finalBatchIndex; batchIndex += 1) {
      queueBatchFetch(batchIndex + ACTIVE_BATCH_FETCH_CONCURRENCY - 1)
      const payload = await payloadRequests.get(batchIndex)
      if (payload) {
        mountHomeCharacterBatch({ container, payload })
      } else if (!mountLegacyHomeCharacterBatch({ batchIndex, container, doc, status: 'active' })) {
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
      if (readActiveCharactersLoadedState(doc)) {
        syncAutoLoad()
        return false
      }

      const loadedBatchCount = readActiveCharactersLoadedBatchCount(doc)
      const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'active' })
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

      const didChange = await loadBatchesThrough(targetBatchIndex)
      if (didChange) {
        win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))
      }
      syncAutoLoad()
      return didChange
    }

    queue = queue.then(run).catch(error => {
      console.error(error)
      return false
    })

    return queue
  }

  const syncByViewport = () => {
    if (readActiveCharactersLoadedState(doc)) {
      stopAutoLoad()
      return
    }

    const sentinel = panel.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR)
    if (!shouldLoadForSentinel(win, sentinel)) return
    void queueLoad({ strategy: 'next' })
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash || readActiveCharactersLoadedState(doc)) return
    if (getHashTarget(hash)) return

    const batchIndex = resolveDeferredActiveCharacterBatch(doc, hash)
    if (batchIndex === null) return

    void queueLoad({ strategy: 'target', targetId: hash }).then(didChange => {
      if (!didChange || !win.location.hash) return
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const onLoadRequest = (event: Event) => {
    void queueLoad(readRequestOptions(event))
  }

  updateLoadedState(readActiveCharactersLoadedBatchCount(doc))
  win.addEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener('hashchange', syncHashTarget)
  syncHashTarget()
  syncAutoLoad()

  return () => {
    stopAutoLoad()
    win.removeEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
