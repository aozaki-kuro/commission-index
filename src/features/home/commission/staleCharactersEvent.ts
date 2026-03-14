import {
  hasDeferredHomeCharacterTarget,
  normalizeHomeCharacterTargetId,
  resolveHomeCharacterTargetBatch,
} from '#features/home/commission/homeCharacterBatchManifest'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'

export const STALE_CHARACTERS_SHOW_REQUEST_EVENT = 'home:stale-show-request'
export const STALE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:stale-load-request'
export const STALE_CHARACTERS_LOADED_EVENT = 'home:stale-loaded'
export const STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT = 'home:stale-collapse-request'
export const STALE_CHARACTERS_COLLAPSED_EVENT = 'home:stale-collapsed'
export const STALE_CHARACTERS_STATE_CHANGE_EVENT = 'home:stale-state-change'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const FIRST_STALE_SECTION_SELECTOR
  = '[data-character-section="true"][data-character-status="stale"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_DEFERRED_TEMPLATE_SELECTOR = 'template[data-stale-deferred-sections-template="true"]'
const STALE_VISIBILITY_STORAGE_KEY = 'home:stale-visibility'
const STALE_VIEWPORT_FOCUS_RATIO = 0.5

export type StaleCharactersVisibility = 'visible' | 'hidden'

export interface RequestStaleCharactersLoadOptions {
  preserveScroll?: boolean
  strategy?: 'next' | 'all' | 'target'
  targetId?: string
  targetBatchCount?: number
}

export interface StaleCharactersState {
  visibility: StaleCharactersVisibility
  loaded: boolean
}

interface SavedStaleCharactersVisibility {
  pathname: string
  visibility: StaleCharactersVisibility
}

const HIDDEN_STATE: StaleCharactersState = {
  visibility: 'hidden',
  loaded: false,
}

function resolveVisibility(panel: HTMLElement | null | undefined): StaleCharactersVisibility {
  if (panel?.dataset.staleVisibility === 'visible')
    return 'visible'
  if (panel?.dataset.staleVisibility === 'hidden')
    return 'hidden'
  return panel?.dataset.staleLoaded === 'true' ? 'visible' : 'hidden'
}

function resolveLoaded(panel: HTMLElement | null | undefined) {
  return panel?.dataset.staleLoaded === 'true'
}

export function readStaleCharactersLoadedBatchCount(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const value = Number(panel?.dataset.staleBatchesLoadedCount ?? '0')
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function readStaleCharactersStateFromPanel(panel: HTMLElement | null | undefined): StaleCharactersState {
  return {
    visibility: resolveVisibility(panel),
    loaded: resolveLoaded(panel),
  }
}

export function readStaleCharactersState(doc?: Document): StaleCharactersState {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return HIDDEN_STATE

  return readStaleCharactersStateFromPanel(
    resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR),
  )
}

export function isStaleCharactersVisible(doc?: Document) {
  return readStaleCharactersState(doc).visibility === 'visible'
}

export function writeStaleCharactersState(panel: HTMLElement, state: StaleCharactersState): StaleCharactersState {
  panel.dataset.staleVisibility = state.visibility
  panel.dataset.staleLoaded = state.loaded ? 'true' : 'false'
  return readStaleCharactersStateFromPanel(panel)
}

export function writeStaleCharactersLoadedBatchCount(panel: HTMLElement, count: number) {
  panel.dataset.staleBatchesLoadedCount = String(Math.max(0, Math.floor(count)))
}

export function dispatchStaleCharactersStateChange(win: Window, state: StaleCharactersState) {
  win.dispatchEvent(
    new CustomEvent<StaleCharactersState>(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
      detail: state,
    }),
  )
}

export function requestStaleCharactersVisibility(win: Window, visibility: StaleCharactersVisibility) {
  win.dispatchEvent(
    new Event(
      visibility === 'visible'
        ? STALE_CHARACTERS_SHOW_REQUEST_EVENT
        : STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
    ),
  )
}

export function requestStaleCharactersLoad(win: Window, options: RequestStaleCharactersLoadOptions = {}) {
  win.dispatchEvent(
    new CustomEvent<RequestStaleCharactersLoadOptions>(STALE_CHARACTERS_LOAD_REQUEST_EVENT, {
      detail: options,
    }),
  )
}

export function shouldPreserveScrollOnStaleLoadRequest(event: Event) {
  if (!(event instanceof CustomEvent))
    return true
  return event.detail?.preserveScroll !== false
}

export function readSavedStaleCharactersVisibility(win: Window): StaleCharactersVisibility | null {
  try {
    const rawState = win.sessionStorage.getItem(STALE_VISIBILITY_STORAGE_KEY)
    if (!rawState)
      return null

    const parsedState = JSON.parse(rawState) as Partial<SavedStaleCharactersVisibility>
    if (
      parsedState.pathname !== win.location.pathname
      || (parsedState.visibility !== 'visible' && parsedState.visibility !== 'hidden')
    ) {
      return null
    }

    return parsedState.visibility
  }
  catch {
    return null
  }
}

export function persistStaleCharactersVisibility(win: Window, visibility: StaleCharactersVisibility) {
  try {
    win.sessionStorage.setItem(
      STALE_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        pathname: win.location.pathname,
        visibility,
      } satisfies SavedStaleCharactersVisibility),
    )
  }
  catch {
    // Ignore storage write failures so stale toggling keeps working.
  }
}

export function resolveReloadStaleCharactersVisibility({
  doc,
  win,
}: {
  doc?: Document
  win?: Window
}): StaleCharactersVisibility {
  const resolvedWindow = win ?? (typeof window !== 'undefined' ? window : null)
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedWindow || !resolvedDocument)
    return 'hidden'

  if (readCommissionViewMode(resolvedWindow) !== 'character') {
    return 'hidden'
  }

  if (!isStaleCharactersVisible(resolvedDocument)) {
    return 'hidden'
  }

  const firstStaleSection = resolvedDocument.querySelector<HTMLElement>(
    FIRST_STALE_SECTION_SELECTOR,
  )
  if (!firstStaleSection) {
    return 'visible'
  }

  const staleStartY = firstStaleSection.getBoundingClientRect().top + resolvedWindow.scrollY
  const viewportFocusY
    = resolvedWindow.scrollY + resolvedWindow.innerHeight * STALE_VIEWPORT_FOCUS_RATIO

  return viewportFocusY >= staleStartY ? 'visible' : 'hidden'
}

export function persistReloadStaleCharactersVisibility({
  doc,
  win,
}: {
  doc?: Document
  win: Window
}) {
  persistStaleCharactersVisibility(win, resolveReloadStaleCharactersVisibility({ doc, win }))
}

function getDeferredStaleTemplate(doc: Document) {
  const liveTemplate = doc.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)
  if (liveTemplate)
    return liveTemplate

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  return (
    rootTemplate?.content.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)
    ?? null
  )
}

export function hasStaleCharacterTarget(doc: Document, rawSectionId: string | null | undefined) {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'stale' })) {
    return true
  }

  const sectionId = normalizeHomeCharacterTargetId(rawSectionId)
  if (!sectionId)
    return false

  const template = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (!template)
    return false

  return templateContentContainsElementId(template.content, sectionId)
}

export function hasDeferredStaleCharacterTarget(doc: Document, rawSectionId: string | null | undefined) {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'stale' })) {
    return true
  }

  const sectionId = normalizeHomeCharacterTargetId(rawSectionId)
  if (!sectionId)
    return false
  if (doc.getElementById(sectionId))
    return false

  const template = getDeferredStaleTemplate(doc)
  if (!template)
    return false

  return templateContentContainsElementId(template.content, sectionId)
}

export function resolveDeferredStaleCharacterBatch(doc: Document, rawSectionId: string | null | undefined) {
  const resolvedBatch = resolveHomeCharacterTargetBatch({
    doc,
    rawTargetId: rawSectionId,
    status: 'stale',
  })
  if (resolvedBatch !== null)
    return resolvedBatch

  const sectionId = normalizeHomeCharacterTargetId(rawSectionId)
  if (!sectionId || doc.getElementById(sectionId))
    return null

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (rootTemplate && templateContentContainsElementId(rootTemplate.content, sectionId)) {
    return 0
  }

  const template = getDeferredStaleTemplate(doc)
  return template && templateContentContainsElementId(template.content, sectionId) ? 1 : null
}
