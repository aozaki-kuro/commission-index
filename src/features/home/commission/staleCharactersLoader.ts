import {
  dispatchStaleCharactersStateChange,
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  readStaleCharactersStateFromPanel,
  writeStaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const STALE_PLACEHOLDER_SELECTOR = '[data-stale-sections-placeholder="true"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_CONTAINER_SELECTOR = '[data-stale-sections-container="true"]'
const STALE_LOAD_TRIGGER_SELECTOR = '[data-load-stale-characters="true"]'

const isStaleLoaded = (panel: HTMLElement | null) => readStaleCharactersStateFromPanel(panel).loaded

type StaleCharactersLoaderDeps = {
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  restoreScrollPosition: (win: Window, position: { x: number; y: number }) => void
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

const loadStaleSections = ({
  deps,
  preserveScroll,
  win,
  panel,
}: {
  deps: StaleCharactersLoaderDeps
  preserveScroll: boolean
  win: Window
  panel: HTMLElement | null
}) => {
  if (!panel || isStaleLoaded(panel)) return false
  const scrollPosition = preserveScroll ? { x: win.scrollX, y: win.scrollY } : null
  if (!mountTemplateContent(panel)) return false

  const state = writeStaleCharactersState(panel, 'visible')
  hidePlaceholder(panel)
  dispatchSidebarSearchState()
  dispatchStaleCharactersStateChange(win, state)
  win.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))
  if (scrollPosition) {
    scheduleScrollRestore({ deps, position: scrollPosition, win })
  }
  return true
}

const collapseStaleSections = ({
  deps,
  preserveScroll,
  win,
  panel,
}: {
  deps: StaleCharactersLoaderDeps
  preserveScroll: boolean
  win: Window
  panel: HTMLElement | null
}) => {
  if (!panel || !isStaleLoaded(panel)) return false

  const scrollPosition = preserveScroll ? { x: win.scrollX, y: win.scrollY } : null
  const container = panel.querySelector<HTMLElement>(STALE_CONTAINER_SELECTOR)
  if (!container) return false

  container.replaceChildren()
  const state = writeStaleCharactersState(panel, 'hidden')
  showPlaceholder(panel)
  dispatchSidebarSearchState()
  dispatchStaleCharactersStateChange(win, state)
  win.dispatchEvent(new Event(STALE_CHARACTERS_COLLAPSED_EVENT))
  if (scrollPosition) {
    scheduleScrollRestore({ deps, position: scrollPosition, win })
  }
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

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const trigger = target.closest<HTMLElement>(STALE_LOAD_TRIGGER_SELECTOR)
    if (!trigger) return

    loadStaleSections({ deps, preserveScroll: true, win, panel })
  }

  const onLoadRequest = () => {
    loadStaleSections({ deps, preserveScroll: true, win, panel })
  }

  const onCollapseRequest = () => {
    collapseStaleSections({ deps, preserveScroll: true, win, panel })
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash || isStaleLoaded(panel)) return
    if (getHashTarget(hash)) return
    if (!templateContainsHashTarget(panel, hash)) return
    if (!loadStaleSections({ deps, preserveScroll: false, win, panel })) return

    win.requestAnimationFrame(() => {
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  doc.addEventListener('click', onClick)
  win.addEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('hashchange', syncHashTarget)
  syncHashTarget()

  return () => {
    doc.removeEventListener('click', onClick)
    win.removeEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('hashchange', syncHashTarget)
  }
}
