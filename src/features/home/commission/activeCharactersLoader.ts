import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
  hasDeferredActiveCharacterTarget,
  readActiveCharactersLoadedState,
} from '#features/home/commission/activeCharactersEvent'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'
const ACTIVE_CONTAINER_SELECTOR = '[data-active-sections-container="true"]'
const ACTIVE_SENTINEL_SELECTOR = '[data-active-sections-sentinel="true"]'
const ACTIVE_PRELOAD_MARGIN_PX = 1200

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

const mountTemplateContent = (panel: HTMLElement) => {
  const template = panel.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  const container = panel.querySelector<HTMLElement>(ACTIVE_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.replaceChildren(template.content.cloneNode(true))
  return true
}

const loadActiveSections = ({
  win,
  panel,
  deps,
}: {
  win: Window
  panel: HTMLElement | null
  deps: ActiveCharactersLoaderDeps
}) => {
  if (!panel || readActiveCharactersLoadedState(panel.ownerDocument)) return false
  if (!mountTemplateContent(panel)) return false

  panel.dataset.activeSectionsLoaded = 'true'
  panel.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)?.remove()
  panel.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR)?.remove()
  deps.dispatchSidebarSync()
  win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))
  return true
}

const shouldLoadForSentinel = (win: Window, sentinel: HTMLElement | null) => {
  if (!sentinel) return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + ACTIVE_PRELOAD_MARGIN_PX
}

export const mountActiveCharactersLoader = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountActiveCharactersLoaderOptions = {}) => {
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

  const syncByViewport = () => {
    if (readActiveCharactersLoadedState(doc)) {
      stopAutoLoad()
      return
    }

    const sentinel = panel.querySelector<HTMLElement>(ACTIVE_SENTINEL_SELECTOR)
    if (!shouldLoadForSentinel(win, sentinel)) return
    if (!loadActiveSections({ win, panel, deps })) return

    stopAutoLoad()
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash || readActiveCharactersLoadedState(doc)) return
    if (getHashTarget(hash)) return
    if (!hasDeferredActiveCharacterTarget(doc, hash)) return
    if (!loadActiveSections({ win, panel, deps })) return

    stopAutoLoad()
    win.requestAnimationFrame(() => {
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const onLoadRequest = () => {
    if (!loadActiveSections({ win, panel, deps })) return
    stopAutoLoad()
  }

  win.addEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener('hashchange', syncHashTarget)
  syncHashTarget()

  if (!readActiveCharactersLoadedState(doc)) {
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
    } else {
      win.addEventListener('scroll', syncByViewport, { passive: true })
      win.addEventListener('resize', syncByViewport)
      syncByViewport()
    }
  }

  return () => {
    stopAutoLoad()
    win.removeEventListener(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
