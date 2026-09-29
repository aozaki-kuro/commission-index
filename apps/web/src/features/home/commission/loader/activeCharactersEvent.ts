import type { HomeCharacterBatchManifest } from '@features/home/server/homeCharacterBatches'
import {
  hasConnectedCharacterPanelTargetId,
  hasDeferredHomeCharacterTarget,
  normalizeHomeCharacterTargetId,
  readHomeCharacterBatchManifest,
  resolveHomeCharacterTargetBatch,
} from '@features/home/commission/batch/homeCharacterBatchManifest'
import { templateContentContainsElementId } from '@features/home/commission/batch/templateContentLookup'

export const ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:active-characters-load-request'
export const ACTIVE_CHARACTERS_LOADED_EVENT = 'home:active-characters-loaded'
export const ACTIVE_CHARACTERS_LOAD_FAILED_EVENT = 'home:active-characters-load-failed'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'

export interface RequestActiveCharactersLoadOptions {
  strategy?: 'next' | 'all' | 'target'
  targetId?: string
  targetBatchCount?: number
  manifestOverride?: HomeCharacterBatchManifest | null
}

export function readActiveCharactersLoadedState(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return true

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  return panel?.dataset.activeSectionsLoaded !== 'false'
}

export function readActiveCharactersLoadedBatchCount(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const value = Number(panel?.dataset.activeBatchesLoadedCount ?? '0')
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function hasDeferredActiveCharacterTarget(doc: Document, rawSectionId: string | null | undefined) {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'active' })) {
    return true
  }

  const sectionId = normalizeHomeCharacterTargetId(rawSectionId)
  if (!sectionId || hasConnectedCharacterPanelTargetId(doc, sectionId))
    return false
  if (readHomeCharacterBatchManifest(doc))
    return false

  const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  return template ? templateContentContainsElementId(template.content, sectionId) : false
}

export function resolveDeferredActiveCharacterBatch(doc: Document, rawSectionId: string | null | undefined) {
  const resolvedBatch = resolveHomeCharacterTargetBatch({
    doc,
    rawTargetId: rawSectionId,
    status: 'active',
  })
  if (resolvedBatch !== null)
    return resolvedBatch

  const sectionId = normalizeHomeCharacterTargetId(rawSectionId)
  if (!sectionId || hasConnectedCharacterPanelTargetId(doc, sectionId))
    return null
  if (readHomeCharacterBatchManifest(doc))
    return null

  const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  return template && templateContentContainsElementId(template.content, sectionId) ? 0 : null
}

export function requestActiveCharactersLoad(win: Window, options: RequestActiveCharactersLoadOptions = {}) {
  win.dispatchEvent(
    new CustomEvent<RequestActiveCharactersLoadOptions>(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, {
      detail: options,
    }),
  )
}
