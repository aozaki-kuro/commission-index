import {
  dispatchStaleCharactersStateChange,
  persistStaleCharactersVisibility,
  readSavedStaleCharactersVisibility,
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  STALE_CHARACTERS_SHOW_REQUEST_EVENT,
  hasDeferredStaleCharacterTarget,
  readStaleCharactersStateFromPanel,
  shouldPreserveScrollOnStaleLoadRequest,
  writeStaleCharactersState,
  isStaleCharactersVisible,
  type StaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const STALE_PLACEHOLDER_SELECTOR = '[data-stale-sections-placeholder="true"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_CONTAINER_SELECTOR = '[data-stale-sections-container="true"]'
const STALE_DEFERRED_TEMPLATE_SELECTOR = 'template[data-stale-deferred-sections-template="true"]'
const STALE_DEFERRED_CONTAINER_SELECTOR = '[data-stale-deferred-sections-container="true"]'
const STALE_DEFERRED_SENTINEL_SELECTOR = '[data-stale-deferred-sections-sentinel="true"]'
const STALE_LOAD_TRIGGER_SELECTOR = '[data-load-stale-characters="true"]'
const STALE_PRELOAD_MARGIN_PX = 1200

const isStaleLoaded = (panel: HTMLElement | null) => readStaleCharactersStateFromPanel(panel).loaded
const isStaleVisible = (panel: HTMLElement | null) =>
  readStaleCharactersStateFromPanel(panel).visibility === 'visible'

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

const mountTemplateContent = (panel: HTMLElement) => {
  const template = panel.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  const container = panel.querySelector<HTMLElement>(STALE_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.replaceChildren(template.content.cloneNode(true))
  return true
}

const mountDeferredTemplateContent = (panel: HTMLElement) => {
  const template = panel.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)
  const container = panel.querySelector<HTMLElement>(STALE_DEFERRED_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.replaceChildren(template.content.cloneNode(true))
  return true
}

const hidePlaceholder = (panel: HTMLElement) => {
  const placeholder = panel.querySelector<HTMLElement>(STALE_PLACEHOLDER_SELECTOR)
  if (!placeholder) return
  placeholder.classList.add('hidden')
}

const showPlaceholder = (panel: HTMLElement) => {
  const placeholder = panel.querySelector<HTMLElement>(STALE_PLACEHOLDER_SELECTOR)
  if (!placeholder) return
  placeholder.classList.remove('hidden')
}

const getDecodedHashId = (hash: string) => {
  if (!hash.startsWith('#')) return ''

  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return ''
  }
}

const templateContainsHashTarget = (panel: HTMLElement, hash: string) => {
  const id = getDecodedHashId(hash)
  if (!id) return false

  const template = panel.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (!template) return false

  return templateContentContainsElementId(template.content, id)
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
  if (state.loaded) {
    win.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))
  }
}

const showStaleSections = ({ win, panel }: { win: Window; panel: HTMLElement | null }) => {
  if (!panel || isStaleVisible(panel)) return false
  if (!mountTemplateContent(panel)) return false

  const state = writeStaleCharactersState(panel, {
    visibility: 'visible',
    loaded: !panel.querySelector(STALE_DEFERRED_TEMPLATE_SELECTOR),
  })
  hidePlaceholder(panel)
  dispatchSidebarSearchState()
  dispatchState(win, state)
  return true
}

const loadDeferredStaleSections = ({ win, panel }: { win: Window; panel: HTMLElement | null }) => {
  if (!panel || !isStaleVisible(panel) || isStaleLoaded(panel)) return false
  if (!mountDeferredTemplateContent(panel)) return false

  panel.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)?.remove()
  panel.querySelector<HTMLElement>(STALE_DEFERRED_SENTINEL_SELECTOR)?.remove()
  const state = writeStaleCharactersState(panel, {
    visibility: 'visible',
    loaded: true,
  })
  dispatchSidebarSearchState()
  dispatchState(win, state)
  return true
}

const mutateWithOptionalScrollRestore = ({
  deps,
  preserveScroll,
  run,
  win,
}: {
  deps: StaleCharactersLoaderDeps
  preserveScroll: boolean
  run: () => boolean
  win: Window
}) => {
  const scrollPosition = preserveScroll ? { x: win.scrollX, y: win.scrollY } : null
  const didChange = run()
  if (didChange && scrollPosition) {
    scheduleScrollRestore({ deps, position: scrollPosition, win })
  }
  return didChange
}

const ensureStaleSectionsFullyLoaded = ({
  win,
  panel,
}: {
  win: Window
  panel: HTMLElement | null
}) => {
  if (!panel) return false

  const didShow = showStaleSections({ win, panel })
  if (isStaleLoaded(panel)) return didShow

  return loadDeferredStaleSections({ win, panel }) || didShow
}

const shouldLoadForSentinel = (win: Window, sentinel: HTMLElement | null) => {
  if (!sentinel) return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + STALE_PRELOAD_MARGIN_PX
}

const collapseStaleSections = ({ win, panel }: { win: Window; panel: HTMLElement | null }) => {
  if (!panel || !isStaleVisible(panel)) return false
  const container = panel.querySelector<HTMLElement>(STALE_CONTAINER_SELECTOR)
  if (!container) return false

  container.replaceChildren()
  const state = writeStaleCharactersState(panel, {
    visibility: 'hidden',
    loaded: false,
  })
  showPlaceholder(panel)
  dispatchSidebarSearchState()
  dispatchStaleCharactersStateChange(win, state)
  win.dispatchEvent(new Event(STALE_CHARACTERS_COLLAPSED_EVENT))
  return true
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
  if (!panel) return () => {}
  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  let intersectionObserver: IntersectionObserver | null = null

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
    if (!isStaleVisible(panel) || isStaleLoaded(panel)) return

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

  const syncByViewport = () => {
    if (!isStaleVisible(panel) || isStaleLoaded(panel)) {
      stopAutoLoad()
      return
    }

    const sentinel = panel.querySelector<HTMLElement>(STALE_DEFERRED_SENTINEL_SELECTOR)
    if (!shouldLoadForSentinel(win, sentinel)) return
    if (!loadDeferredStaleSections({ win, panel })) return

    stopAutoLoad()
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const trigger = target.closest<HTMLElement>(STALE_LOAD_TRIGGER_SELECTOR)
    if (!trigger) return

    if (
      !mutateWithOptionalScrollRestore({
        deps,
        preserveScroll: true,
        run: () => showStaleSections({ win, panel }),
        win,
      })
    ) {
      return
    }

    syncAutoLoad()
  }

  const onShowRequest = () => {
    if (!showStaleSections({ win, panel })) return
    syncAutoLoad()
  }

  const onLoadRequest = (event: Event) => {
    if (
      !mutateWithOptionalScrollRestore({
        deps,
        preserveScroll: shouldPreserveScrollOnStaleLoadRequest(event),
        run: () => ensureStaleSectionsFullyLoaded({ win, panel }),
        win,
      })
    ) {
      return
    }

    syncAutoLoad()
  }

  const onCollapseRequest = () => {
    if (
      !mutateWithOptionalScrollRestore({
        deps,
        preserveScroll: true,
        run: () => collapseStaleSections({ win, panel }),
        win,
      })
    ) {
      return
    }

    stopAutoLoad()
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash) return
    if (getHashTarget(hash)) return
    if (!templateContainsHashTarget(panel, hash)) return

    if (!isStaleCharactersVisible(doc)) {
      showStaleSections({ win, panel })
    }

    if (!getHashTarget(hash) && hasDeferredStaleCharacterTarget(doc, hash)) {
      loadDeferredStaleSections({ win, panel })
    }

    if (!getHashTarget(hash)) return
    syncAutoLoad()

    win.requestAnimationFrame(() => {
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const restoreSavedVisibility = () => {
    if (readSavedStaleCharactersVisibility(win) !== 'visible') return
    showStaleSections({ win, panel })
  }

  doc.addEventListener('click', onClick)
  win.addEventListener(STALE_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
  win.addEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('hashchange', syncHashTarget)
  restoreSavedVisibility()
  syncHashTarget()
  syncAutoLoad()

  return () => {
    stopAutoLoad()
    doc.removeEventListener('click', onClick)
    win.removeEventListener(STALE_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
    win.removeEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
