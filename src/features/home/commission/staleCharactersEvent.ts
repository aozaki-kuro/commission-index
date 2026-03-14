import {
  hasDeferredHomeCharacterTarget,
  resolveHomeCharacterTargetBatch,
} from '#features/home/commission/homeCharacterBatchManifest'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'

export const STALE_CHARACTERS_SHOW_REQUEST_EVENT = 'home:stale-show-request'
export const STALE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:stale-load-request'
export const STALE_CHARACTERS_LOADED_EVENT = 'home:stale-loaded'
export const STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT = 'home:stale-collapse-request'
export const STALE_CHARACTERS_COLLAPSED_EVENT = 'home:stale-collapsed'
export const STALE_CHARACTERS_STATE_CHANGE_EVENT = 'home:stale-state-change'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_DEFERRED_TEMPLATE_SELECTOR = 'template[data-stale-deferred-sections-template="true"]'
const STALE_VISIBILITY_STORAGE_KEY = 'home:stale-visibility'

export type StaleCharactersVisibility = 'visible' | 'hidden'

export type RequestStaleCharactersLoadOptions = {
  preserveScroll?: boolean
  strategy?: 'next' | 'all' | 'target'
  targetId?: string
  targetBatchCount?: number
}

export type StaleCharactersState = {
  visibility: StaleCharactersVisibility
  loaded: boolean
}

type SavedStaleCharactersVisibility = {
  pathname: string
  visibility: StaleCharactersVisibility
}

const HIDDEN_STATE: StaleCharactersState = {
  visibility: 'hidden',
  loaded: false,
}

const normalizeSectionId = (rawValue: string | null | undefined) => {
  if (!rawValue) return ''

  const value = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue
  if (!value) return ''

  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

const resolveVisibility = (panel: HTMLElement | null | undefined): StaleCharactersVisibility => {
  if (panel?.dataset.staleVisibility === 'visible') return 'visible'
  if (panel?.dataset.staleVisibility === 'hidden') return 'hidden'
  return panel?.dataset.staleLoaded === 'true' ? 'visible' : 'hidden'
}

const resolveLoaded = (panel: HTMLElement | null | undefined) =>
  panel?.dataset.staleLoaded === 'true'

export const readStaleCharactersLoadedBatchCount = (doc?: Document) => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const value = Number(panel?.dataset.staleBatchesLoadedCount ?? '0')
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export const readStaleCharactersStateFromPanel = (
  panel: HTMLElement | null | undefined,
): StaleCharactersState => {
  return {
    visibility: resolveVisibility(panel),
    loaded: resolveLoaded(panel),
  }
}

export const readStaleCharactersState = (doc?: Document): StaleCharactersState => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return HIDDEN_STATE

  return readStaleCharactersStateFromPanel(
    resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR),
  )
}

export const isStaleCharactersVisible = (doc?: Document) =>
  readStaleCharactersState(doc).visibility === 'visible'

export const writeStaleCharactersState = (
  panel: HTMLElement,
  state: StaleCharactersState,
): StaleCharactersState => {
  panel.dataset.staleVisibility = state.visibility
  panel.dataset.staleLoaded = state.loaded ? 'true' : 'false'
  return readStaleCharactersStateFromPanel(panel)
}

export const writeStaleCharactersLoadedBatchCount = (panel: HTMLElement, count: number) => {
  panel.dataset.staleBatchesLoadedCount = String(Math.max(0, Math.floor(count)))
}

export const dispatchStaleCharactersStateChange = (win: Window, state: StaleCharactersState) => {
  win.dispatchEvent(
    new CustomEvent<StaleCharactersState>(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
      detail: state,
    }),
  )
}

export const requestStaleCharactersVisibility = (
  win: Window,
  visibility: StaleCharactersVisibility,
) => {
  win.dispatchEvent(
    new Event(
      visibility === 'visible'
        ? STALE_CHARACTERS_SHOW_REQUEST_EVENT
        : STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
    ),
  )
}

export const requestStaleCharactersLoad = (
  win: Window,
  options: RequestStaleCharactersLoadOptions = {},
) => {
  win.dispatchEvent(
    new CustomEvent<RequestStaleCharactersLoadOptions>(STALE_CHARACTERS_LOAD_REQUEST_EVENT, {
      detail: options,
    }),
  )
}

export const shouldPreserveScrollOnStaleLoadRequest = (event: Event) => {
  if (!(event instanceof CustomEvent)) return true
  return event.detail?.preserveScroll !== false
}

export const readSavedStaleCharactersVisibility = (
  win: Window,
): StaleCharactersVisibility | null => {
  try {
    const rawState = win.sessionStorage.getItem(STALE_VISIBILITY_STORAGE_KEY)
    if (!rawState) return null

    const parsedState = JSON.parse(rawState) as Partial<SavedStaleCharactersVisibility>
    if (
      parsedState.pathname !== win.location.pathname ||
      (parsedState.visibility !== 'visible' && parsedState.visibility !== 'hidden')
    ) {
      return null
    }

    return parsedState.visibility
  } catch {
    return null
  }
}

export const persistStaleCharactersVisibility = (
  win: Window,
  visibility: StaleCharactersVisibility,
) => {
  try {
    win.sessionStorage.setItem(
      STALE_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        pathname: win.location.pathname,
        visibility,
      } satisfies SavedStaleCharactersVisibility),
    )
  } catch {
    // Ignore storage write failures so stale toggling keeps working.
  }
}

const getDeferredStaleTemplate = (doc: Document) => {
  const liveTemplate = doc.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)
  if (liveTemplate) return liveTemplate

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  return (
    rootTemplate?.content.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR) ??
    null
  )
}

export const hasStaleCharacterTarget = (doc: Document, rawSectionId: string | null | undefined) => {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'stale' })) {
    return true
  }

  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId) return false

  const template = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (!template) return false

  return templateContentContainsElementId(template.content, sectionId)
}

export const hasDeferredStaleCharacterTarget = (
  doc: Document,
  rawSectionId: string | null | undefined,
) => {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'stale' })) {
    return true
  }

  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId) return false
  if (doc.getElementById(sectionId)) return false

  const template = getDeferredStaleTemplate(doc)
  if (!template) return false

  return templateContentContainsElementId(template.content, sectionId)
}

export const resolveDeferredStaleCharacterBatch = (
  doc: Document,
  rawSectionId: string | null | undefined,
) => {
  const resolvedBatch = resolveHomeCharacterTargetBatch({
    doc,
    rawTargetId: rawSectionId,
    status: 'stale',
  })
  if (resolvedBatch !== null) return resolvedBatch

  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId || doc.getElementById(sectionId)) return null

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (rootTemplate && templateContentContainsElementId(rootTemplate.content, sectionId)) {
    return 0
  }

  const template = getDeferredStaleTemplate(doc)
  return template && templateContentContainsElementId(template.content, sectionId) ? 1 : null
}
