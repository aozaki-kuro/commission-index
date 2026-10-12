import type { ArchivedCharactersState, RequestArchivedCharactersLoadOptions } from '@features/home/commission/loader/archivedCharactersEvent'
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
  ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_LOADED_EVENT,
  ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT,

  dispatchArchivedCharactersStateChange,
  persistReloadArchivedCharactersVisibility,
  readArchivedCharactersStateFromPanel,
  readSavedArchivedCharactersVisibility,
  resolveDeferredArchivedCharacterBatch,
  shouldPreserveScrollOnArchivedLoadRequest,

  writeArchivedCharactersLoadedBatchCount,
  writeArchivedCharactersState,
} from '@features/home/commission/loader/archivedCharactersEvent'
import { revealHashRestoreShell } from '@features/home/homeScrollRestore'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'
import { restoreScrollPosition as restoreWindowScrollPosition } from '@lib/navigation/restoreScrollPosition'
import { dispatchSidebarSearchState } from '@lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ARCHIVED_PLACEHOLDER_SELECTOR = '[data-archived-sections-placeholder="true"]'
const ARCHIVED_LOAD_TRIGGER_SELECTOR = '[data-load-archived-characters="true"]'
const ARCHIVED_DIVIDER_SELECTOR = '[data-archived-divider="true"]'
const ARCHIVED_CONTAINER_SELECTOR = '[data-archived-sections-container="true"]'
const ARCHIVED_DEFERRED_SENTINEL_SELECTOR = '[data-archived-deferred-sections-sentinel="true"]'
const ARCHIVED_PRELOAD_MARGIN_PX = 1200
const ARCHIVED_BATCH_FETCH_CONCURRENCY = 4
const ARCHIVED_IDLE_PREFETCH_BATCH_COUNT = 2
const ARCHIVED_IDLE_PREFETCH_TIMEOUT_MS = 1200
const ARCHIVED_IDLE_PREFETCH_FALLBACK_DELAY_MS = 180

interface ArchivedCharactersLoaderDeps {
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  restoreScrollPosition: (win: Window, position: { x: number, y: number }) => void
}

type WindowWithIntersectionObserver = Window
  & typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

const defaultDeps: ArchivedCharactersLoaderDeps = {
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  restoreScrollPosition: restoreWindowScrollPosition,
}

function shouldLoadForSentinel(win: Window, sentinel: HTMLElement | null) {
  if (!sentinel)
    return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + ARCHIVED_PRELOAD_MARGIN_PX
}

function scheduleScrollRestore({
  deps,
  position,
  win,
}: {
  deps: ArchivedCharactersLoaderDeps
  position: { x: number, y: number }
  win: Window
}) {
  win.requestAnimationFrame(() => {
    deps.restoreScrollPosition(win, position)
  })
}

function dispatchState(win: Window, state: ArchivedCharactersState) {
  dispatchArchivedCharactersStateChange(win, state)
}

function readRequestOptions(event: Event): RequestArchivedCharactersLoadOptions {
  if (!(event instanceof CustomEvent))
    return {}
  return event.detail ?? {}
}

export function mountArchivedCharactersLoader({
  win = window,
  doc = document,
  deps: depsOverrides,
}: {
  win?: Window
  doc?: Document
  deps?: Partial<ArchivedCharactersLoaderDeps>
} = {}) {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(ARCHIVED_CONTAINER_SELECTOR) ?? null
  if (!panel || !container)
    return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  const placeholder = panel.querySelector<HTMLElement>(ARCHIVED_PLACEHOLDER_SELECTOR)
  const divider = panel.querySelector<HTMLElement>(ARCHIVED_DIVIDER_SELECTOR)
  const archivedTotalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'archived' })
  let intersectionObserver: IntersectionObserver | null = null
  let queue = Promise.resolve(false)
  let cancelIdlePrefetch: (() => void) | null = null
  // Collapse bypasses the serial queue, so a load that started before it must notice and stand down.
  let collapseGeneration = 0

  // Direct panel reads avoid repeated querySelector in exported helpers
  const readLocalBatchCount = () => {
    const value = Number(panel.dataset.archivedBatchesLoadedCount ?? '0')
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }

  const setPlaceholderHidden = (hidden: boolean) => {
    if (!placeholder)
      return
    placeholder.classList.toggle('hidden', hidden)
  }

  const setDividerHidden = (hidden: boolean) => {
    if (!divider)
      return
    divider.classList.toggle('hidden', hidden)
  }

  const updateLoadedState = ({
    loadedBatchCount,
    visibility,
  }: {
    loadedBatchCount: number
    visibility: 'hidden' | 'visible'
  }) => {
    writeArchivedCharactersLoadedBatchCount(panel, loadedBatchCount)
    const state = writeArchivedCharactersState(panel, {
      visibility,
      loaded: loadedBatchCount >= archivedTotalBatchCount,
    })

    setPlaceholderHidden(visibility === 'visible')
    setDividerHidden(visibility !== 'visible' || loadedBatchCount === 0)

    return state
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
    if (loadedBatchCount >= archivedTotalBatchCount)
      return

    const task = () => {
      prefetchHomeCharacterBatches({
        doc,
        startBatchIndex: loadedBatchCount,
        status: 'archived',
        targetBatchIndex: loadedBatchCount + ARCHIVED_IDLE_PREFETCH_BATCH_COUNT - 1,
      })
    }

    if (typeof winWithIntersectionObserver.requestIdleCallback === 'function') {
      const handle = winWithIntersectionObserver.requestIdleCallback(task, {
        timeout: ARCHIVED_IDLE_PREFETCH_TIMEOUT_MS,
      })
      cancelIdlePrefetch = () => {
        winWithIntersectionObserver.cancelIdleCallback?.(handle)
      }
      return
    }

    const timeoutHandle = win.setTimeout(task, ARCHIVED_IDLE_PREFETCH_FALLBACK_DELAY_MS)
    cancelIdlePrefetch = () => {
      win.clearTimeout(timeoutHandle)
    }
  }

  const syncAutoLoad = () => {
    stopAutoLoad()
    const state = readArchivedCharactersStateFromPanel(panel)
    if (state.loaded) {
      stopIdlePrefetch()
      return
    }

    const sentinel = panel?.querySelector<HTMLElement>(ARCHIVED_DEFERRED_SENTINEL_SELECTOR) ?? null
    const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
    if (
      state.visibility === 'visible'
      && sentinel
      && typeof IntersectionObserverCtor === 'function'
    ) {
      const observer = new IntersectionObserverCtor(
        (entries: IntersectionObserverEntry[]) => {
          if (!entries.some(entry => entry.isIntersecting))
            return
          syncByViewport()
        },
        { rootMargin: `${ARCHIVED_PRELOAD_MARGIN_PX}px 0px` },
      )
      intersectionObserver = observer
      observer.observe(sentinel)
      scheduleIdlePrefetch()
      return
    }

    if (state.visibility === 'visible') {
      win.addEventListener('scroll', syncByViewport, { passive: true })
      win.addEventListener('resize', syncByViewport)
      syncByViewport()
    }

    scheduleIdlePrefetch()
  }

  const loadBatchesThrough = async (targetBatchIndex: number, manifestOverride?: HomeCharacterBatchManifest | null) => {
    let didChange = false
    const generation = collapseGeneration
    let loadedBatchCount = readLocalBatchCount()
    const effectiveTotalBatchCount = manifestOverride?.archived.totalBatches ?? archivedTotalBatchCount
    if (loadedBatchCount >= effectiveTotalBatchCount) {
      updateLoadedState({ loadedBatchCount, visibility: 'visible' })
      return false
    }

    const finalBatchIndex = Math.min(targetBatchIndex, effectiveTotalBatchCount - 1)
    const payloadRequests = new Map<number, ReturnType<typeof fetchHomeCharacterBatch>>()
    const queueBatchFetch = (batchIndex: number) => {
      if (batchIndex > finalBatchIndex || payloadRequests.has(batchIndex))
        return
      const request = fetchHomeCharacterBatch({ batchIndex, doc, status: 'archived', manifestOverride })
      // The abandoned look-ahead rejection must not surface as unhandled; the awaited loop still sees it.
      request.catch(() => {})
      payloadRequests.set(batchIndex, request)
    }

    for (
      let batchIndex = loadedBatchCount;
      batchIndex <= Math.min(finalBatchIndex, loadedBatchCount + ARCHIVED_BATCH_FETCH_CONCURRENCY - 1);
      batchIndex += 1
    ) {
      queueBatchFetch(batchIndex)
    }

    try {
      for (let batchIndex = loadedBatchCount; batchIndex <= finalBatchIndex; batchIndex += 1) {
        queueBatchFetch(batchIndex + ARCHIVED_BATCH_FETCH_CONCURRENCY - 1)
        const payload = await payloadRequests.get(batchIndex)
        if (generation !== collapseGeneration)
          break
        if (payload) {
          mountHomeCharacterBatch({ container, payload })
        }
        else if (!mountLegacyHomeCharacterBatch({ batchIndex, container, doc, status: 'archived' })) {
          break
        }

        loadedBatchCount = batchIndex + 1
        didChange = true
      }
    }
    finally {
      // Persist the count even when a later batch rejects, otherwise a retry re-mounts the batches already in the DOM.
      // A collapse during the load already reset the container and state; writing here would resurrect a stale count.
      if (generation === collapseGeneration) {
        updateLoadedState({ loadedBatchCount, visibility: 'visible' })
        if (didChange) {
          dispatchSidebarSearchState()
        }
      }
    }

    return generation === collapseGeneration && didChange
  }

  const queueLoad = (options: RequestArchivedCharactersLoadOptions = {}) => {
    const run = async () => {
      const preserveScroll = options.preserveScroll ?? false
      const scrollPosition = preserveScroll ? { x: win.scrollX, y: win.scrollY } : null
      const strategy = options.strategy ?? 'next'
      const loadedBatchCount = readLocalBatchCount()
      const targetBatchIndex = Number.isInteger(options.targetBatchCount)
        ? Math.max(loadedBatchCount, Number(options.targetBatchCount) - 1)
        : strategy === 'all'
          ? archivedTotalBatchCount - 1
          : strategy === 'target'
            ? (resolveDeferredArchivedCharacterBatch(doc, options.targetId) ?? loadedBatchCount)
            : loadedBatchCount

      let didChange = false
      let currentState = updateLoadedState({ loadedBatchCount, visibility: 'visible' })
      dispatchState(win, currentState)

      if (loadedBatchCount < archivedTotalBatchCount && targetBatchIndex >= loadedBatchCount) {
        didChange = await loadBatchesThrough(targetBatchIndex, options.manifestOverride)
        const nextState = readArchivedCharactersStateFromPanel(panel)
        if (
          nextState.visibility !== currentState.visibility
          || nextState.loaded !== currentState.loaded
        ) {
          currentState = nextState
          dispatchState(win, currentState)
        }
      }

      if (scrollPosition && (didChange || currentState.visibility === 'visible')) {
        scheduleScrollRestore({ deps, position: scrollPosition, win })
      }

      if (didChange) {
        win.dispatchEvent(new Event(ARCHIVED_CHARACTERS_LOADED_EVENT))
      }
      syncAutoLoad()
      return didChange
    }

    queue = queue.then(run).catch((error) => {
      console.error(error)
      return false
    })

    return queue
  }

  const collapseArchivedSections = () => {
    const state = readArchivedCharactersStateFromPanel(panel)
    if (state.visibility !== 'visible')
      return false

    collapseGeneration += 1
    container.replaceChildren()
    const nextState = updateLoadedState({
      loadedBatchCount: 0,
      visibility: 'hidden',
    })
    dispatchSidebarSearchState()
    dispatchState(win, nextState)
    persistReloadArchivedCharactersVisibility({ doc, win })
    win.dispatchEvent(new Event(ARCHIVED_CHARACTERS_COLLAPSED_EVENT))
    return true
  }

  function syncByViewport() {
    const state = readArchivedCharactersStateFromPanel(panel)
    if (state.visibility !== 'visible' || state.loaded) {
      stopAutoLoad()
      return
    }

    const sentinel = panel?.querySelector<HTMLElement>(ARCHIVED_DEFERRED_SENTINEL_SELECTOR) ?? null
    if (!shouldLoadForSentinel(win, sentinel))
      return
    void queueLoad({ preserveScroll: false, strategy: 'next' })
  }

  const onShowRequest = () => {
    void queueLoad({
      preserveScroll: true,
      strategy: 'next',
    })
  }

  const onPanelClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return
    if (!target.closest(ARCHIVED_LOAD_TRIGGER_SELECTOR))
      return

    event.preventDefault()
    onShowRequest()
  }

  const onLoadRequest = (event: Event) => {
    const options = readRequestOptions(event)
    const strategy
      = options.strategy
        ?? (options.targetId ? 'target' : shouldPreserveScrollOnArchivedLoadRequest(event) ? 'all' : 'next')

    void queueLoad({
      ...options,
      strategy,
      preserveScroll: shouldPreserveScrollOnArchivedLoadRequest(event),
    })
  }

  const onCollapseRequest = () => {
    const scrollPosition = { x: win.scrollX, y: win.scrollY }
    if (!collapseArchivedSections())
      return
    scheduleScrollRestore({ deps, position: scrollPosition, win })
    stopAutoLoad()
  }

  const syncHashTarget = async () => {
    const hash = win.location.hash
    if (!hash)
      return

    if (getHashTarget(hash)) {
      win.requestAnimationFrame(() => {
        deps.scrollToHashWithoutWrite(hash)
        revealHashRestoreShell(win)
      })
      return
    }

    let batchIndex = resolveDeferredArchivedCharacterBatch(doc, hash)
    let manifestOverride: HomeCharacterBatchManifest | null | undefined

    if (batchIndex === null) {
      const freshManifest = await fetchFreshHomeCharacterBatchManifest(doc)
      const targetId = normalizeBatchTargetId(hash)
      if (!freshManifest || !targetId)
        return
      const freshIndex = freshManifest.archived.targetBatchById[targetId]
      if (!Number.isInteger(freshIndex))
        return
      batchIndex = freshIndex
      manifestOverride = freshManifest
    }

    void queueLoad({
      preserveScroll: false,
      strategy: 'target',
      targetId: hash,
      targetBatchCount: batchIndex + 1,
      manifestOverride,
    }).then(() => {
      win.requestAnimationFrame(() => {
        deps.scrollToHashWithoutWrite(hash)
        win.requestAnimationFrame(() => {
          revealHashRestoreShell(win)
        })
      })
    })
  }

  const restoreSavedVisibility = () => {
    if (readSavedArchivedCharactersVisibility(win) !== 'visible')
      return
    void queueLoad({
      preserveScroll: true,
      strategy: 'next',
    })
  }

  updateLoadedState({
    loadedBatchCount: readLocalBatchCount(),
    visibility: readArchivedCharactersStateFromPanel(panel).visibility,
  })
  const persistReloadVisibility = () => {
    persistReloadArchivedCharactersVisibility({ doc, win })
  }
  panel.addEventListener('click', onPanelClick)
  win.addEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
  win.addEventListener(ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('hashchange', syncHashTarget)
  win.addEventListener('pagehide', persistReloadVisibility)
  win.addEventListener('beforeunload', persistReloadVisibility)
  restoreSavedVisibility()
  syncHashTarget()
  syncAutoLoad()

  return () => {
    stopAutoLoad()
    stopIdlePrefetch()
    panel.removeEventListener('click', onPanelClick)
    win.removeEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
    win.removeEventListener(ARCHIVED_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('hashchange', syncHashTarget)
    win.removeEventListener('pagehide', persistReloadVisibility)
    win.removeEventListener('beforeunload', persistReloadVisibility)
  }
}
