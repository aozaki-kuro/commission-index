import {
  dispatchStaleCharactersStateChange,
  persistStaleCharactersVisibility,
  readSavedStaleCharactersVisibility,
  readStaleCharactersLoadedBatchCount,
  readStaleCharactersStateFromPanel,
  resolveDeferredStaleCharacterBatch,
  shouldPreserveScrollOnStaleLoadRequest,
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  STALE_CHARACTERS_SHOW_REQUEST_EVENT,
  writeStaleCharactersLoadedBatchCount,
  writeStaleCharactersState,
  type RequestStaleCharactersLoadOptions,
  type StaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import {
  fetchHomeCharacterBatch,
  getHomeCharacterBatchTotalCount,
  mountLegacyHomeCharacterBatch,
  mountHomeCharacterBatch,
} from '#features/home/commission/homeCharacterBatchClient'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const STALE_PLACEHOLDER_SELECTOR = '[data-stale-sections-placeholder="true"]'
const STALE_LOAD_TRIGGER_SELECTOR = '[data-load-stale-characters="true"]'
const STALE_DIVIDER_SELECTOR = '[data-stale-divider="true"]'
const STALE_CONTAINER_SELECTOR = '[data-stale-sections-container="true"]'
const STALE_DEFERRED_SENTINEL_SELECTOR = '[data-stale-deferred-sections-sentinel="true"]'
const STALE_PRELOAD_MARGIN_PX = 1200

type StaleCharactersLoaderDeps = {
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  restoreScrollPosition: (win: Window, position: { x: number; y: number }) => void
}

type WindowWithIntersectionObserver = Window &
  typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
  }

const defaultDeps: StaleCharactersLoaderDeps = {
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
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

const shouldLoadForSentinel = (win: Window, sentinel: HTMLElement | null) => {
  if (!sentinel) return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + STALE_PRELOAD_MARGIN_PX
}

const scheduleScrollRestore = ({
  deps,
  position,
  win,
}: {
  deps: StaleCharactersLoaderDeps
  position: { x: number; y: number }
  win: Window
}) => {
  win.requestAnimationFrame(() => {
    deps.restoreScrollPosition(win, position)
  })
}

const dispatchState = (win: Window, state: StaleCharactersState) => {
  persistStaleCharactersVisibility(win, state.visibility)
  dispatchStaleCharactersStateChange(win, state)
}

const readRequestOptions = (event: Event): RequestStaleCharactersLoadOptions => {
  if (!(event instanceof CustomEvent)) return {}
  return event.detail ?? {}
}

export const mountStaleCharactersLoader = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: {
  win?: Window
  doc?: Document
  deps?: Partial<StaleCharactersLoaderDeps>
} = {}) => {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(STALE_CONTAINER_SELECTOR) ?? null
  if (!panel || !container) return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  const placeholder = panel.querySelector<HTMLElement>(STALE_PLACEHOLDER_SELECTOR)
  const divider = panel.querySelector<HTMLElement>(STALE_DIVIDER_SELECTOR)
  let intersectionObserver: IntersectionObserver | null = null
  let queue = Promise.resolve(false)

  const setPlaceholderHidden = (hidden: boolean) => {
    if (!placeholder) return
    placeholder.classList.toggle('hidden', hidden)
  }

  const setDividerHidden = (hidden: boolean) => {
    if (!divider) return
    divider.classList.toggle('hidden', hidden)
  }

  const updateLoadedState = ({
    loadedBatchCount,
    visibility,
  }: {
    loadedBatchCount: number
    visibility: 'hidden' | 'visible'
  }) => {
    writeStaleCharactersLoadedBatchCount(panel, loadedBatchCount)
    const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'stale' })
    const state = writeStaleCharactersState(panel, {
      visibility,
      loaded: loadedBatchCount >= totalBatchCount,
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

  const syncAutoLoad = () => {
    stopAutoLoad()
    const state = readStaleCharactersStateFromPanel(panel)
    if (state.visibility !== 'visible' || state.loaded) return

    const sentinel = panel.querySelector<HTMLElement>(STALE_DEFERRED_SENTINEL_SELECTOR)
    const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
    if (sentinel && typeof IntersectionObserverCtor === 'function') {
      const observer = new IntersectionObserverCtor(
        (entries: IntersectionObserverEntry[]) => {
          if (!entries.some(entry => entry.isIntersecting)) return
          syncByViewport()
        },
        { rootMargin: `${STALE_PRELOAD_MARGIN_PX}px 0px` },
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
    let loadedBatchCount = readStaleCharactersLoadedBatchCount(doc)
    const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'stale' })
    if (loadedBatchCount >= totalBatchCount) {
      updateLoadedState({ loadedBatchCount, visibility: 'visible' })
      return false
    }

    const finalBatchIndex = Math.min(targetBatchIndex, totalBatchCount - 1)
    for (let batchIndex = loadedBatchCount; batchIndex <= finalBatchIndex; batchIndex += 1) {
      const payload = await fetchHomeCharacterBatch({ batchIndex, doc, status: 'stale' })
      if (payload) {
        mountHomeCharacterBatch({ container, payload })
      } else if (!mountLegacyHomeCharacterBatch({ batchIndex, container, doc, status: 'stale' })) {
        break
      }

      loadedBatchCount = batchIndex + 1
      didChange = true
    }

    updateLoadedState({ loadedBatchCount, visibility: 'visible' })
    if (didChange) {
      dispatchSidebarSearchState()
    }

    return didChange
  }

  const queueLoad = (options: RequestStaleCharactersLoadOptions = {}) => {
    const run = async () => {
      const preserveScroll = options.preserveScroll ?? false
      const scrollPosition = preserveScroll ? { x: win.scrollX, y: win.scrollY } : null
      const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status: 'stale' })
      const strategy = options.strategy ?? 'next'
      const loadedBatchCount = readStaleCharactersLoadedBatchCount(doc)
      const targetBatchIndex =
        strategy === 'all'
          ? totalBatchCount - 1
          : strategy === 'target'
            ? (resolveDeferredStaleCharacterBatch(doc, options.targetId) ?? loadedBatchCount)
            : loadedBatchCount

      let didChange = false
      let currentState = updateLoadedState({ loadedBatchCount, visibility: 'visible' })
      dispatchState(win, currentState)

      if (loadedBatchCount < totalBatchCount && targetBatchIndex >= loadedBatchCount) {
        didChange = await loadBatchesThrough(targetBatchIndex)
        const nextState = readStaleCharactersStateFromPanel(panel)
        if (
          nextState.visibility !== currentState.visibility ||
          nextState.loaded !== currentState.loaded
        ) {
          currentState = nextState
          dispatchState(win, currentState)
        }
      }

      if (scrollPosition && (didChange || currentState.visibility === 'visible')) {
        scheduleScrollRestore({ deps, position: scrollPosition, win })
      }

      if (didChange) {
        win.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))
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

  const collapseStaleSections = () => {
    const state = readStaleCharactersStateFromPanel(panel)
    if (state.visibility !== 'visible') return false

    container.replaceChildren()
    const nextState = updateLoadedState({
      loadedBatchCount: 0,
      visibility: 'hidden',
    })
    dispatchSidebarSearchState()
    dispatchState(win, nextState)
    win.dispatchEvent(new Event(STALE_CHARACTERS_COLLAPSED_EVENT))
    return true
  }

  const syncByViewport = () => {
    const state = readStaleCharactersStateFromPanel(panel)
    if (state.visibility !== 'visible' || state.loaded) {
      stopAutoLoad()
      return
    }

    const sentinel = panel.querySelector<HTMLElement>(STALE_DEFERRED_SENTINEL_SELECTOR)
    if (!shouldLoadForSentinel(win, sentinel)) return
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
    if (!(target instanceof Element)) return
    if (!target.closest(STALE_LOAD_TRIGGER_SELECTOR)) return

    event.preventDefault()
    onShowRequest()
  }

  const onLoadRequest = (event: Event) => {
    const options = readRequestOptions(event)
    const strategy =
      options.strategy ??
      (options.targetId ? 'target' : shouldPreserveScrollOnStaleLoadRequest(event) ? 'all' : 'next')

    void queueLoad({
      ...options,
      strategy,
      preserveScroll: shouldPreserveScrollOnStaleLoadRequest(event),
    })
  }

  const onCollapseRequest = () => {
    const scrollPosition = { x: win.scrollX, y: win.scrollY }
    if (!collapseStaleSections()) return
    scheduleScrollRestore({ deps, position: scrollPosition, win })
    stopAutoLoad()
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash) return
    if (getHashTarget(hash)) return

    const batchIndex = resolveDeferredStaleCharacterBatch(doc, hash)
    if (batchIndex === null) return

    void queueLoad({
      preserveScroll: false,
      strategy: 'target',
      targetId: hash,
    }).then(didChange => {
      if (!didChange || !win.location.hash) return
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const restoreSavedVisibility = () => {
    if (readSavedStaleCharactersVisibility(win) !== 'visible') return
    void queueLoad({
      preserveScroll: true,
      strategy: 'next',
    })
  }

  updateLoadedState({
    loadedBatchCount: readStaleCharactersLoadedBatchCount(doc),
    visibility: readStaleCharactersStateFromPanel(panel).visibility,
  })
  panel.addEventListener('click', onPanelClick)
  win.addEventListener(STALE_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
  win.addEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('hashchange', syncHashTarget)
  restoreSavedVisibility()
  syncHashTarget()
  syncAutoLoad()

  return () => {
    stopAutoLoad()
    panel.removeEventListener('click', onPanelClick)
    win.removeEventListener(STALE_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
    win.removeEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
