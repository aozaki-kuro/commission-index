import {
  resolveHomeCharacterTargetBatch,
  hasDeferredHomeCharacterTarget,
} from '#features/home/commission/homeCharacterBatchManifest'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'

export const ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:active-characters-load-request'
export const ACTIVE_CHARACTERS_LOADED_EVENT = 'home:active-characters-loaded'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'

export type RequestActiveCharactersLoadOptions = {
  strategy?: 'next' | 'all' | 'target'
  targetId?: string
  targetBatchCount?: number
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

export const readActiveCharactersLoadedState = (doc?: Document) => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return true

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  return panel?.dataset.activeSectionsLoaded !== 'false'
}

export const readActiveCharactersLoadedBatchCount = (doc?: Document) => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const value = Number(panel?.dataset.activeBatchesLoadedCount ?? '0')
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export const hasDeferredActiveCharacterTarget = (
  doc: Document,
  rawSectionId: string | null | undefined,
) => {
  if (hasDeferredHomeCharacterTarget({ doc, rawTargetId: rawSectionId, status: 'active' })) {
    return true
  }

  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId || doc.getElementById(sectionId)) return false

  const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  return template ? templateContentContainsElementId(template.content, sectionId) : false
}

export const resolveDeferredActiveCharacterBatch = (
  doc: Document,
  rawSectionId: string | null | undefined,
) => {
  const resolvedBatch = resolveHomeCharacterTargetBatch({
    doc,
    rawTargetId: rawSectionId,
    status: 'active',
  })
  if (resolvedBatch !== null) return resolvedBatch

  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId || doc.getElementById(sectionId)) return null

  const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  return template && templateContentContainsElementId(template.content, sectionId) ? 0 : null
}

export const requestActiveCharactersLoad = (
  win: Window,
  options: RequestActiveCharactersLoadOptions = {},
) => {
  win.dispatchEvent(
    new CustomEvent<RequestActiveCharactersLoadOptions>(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT, {
      detail: options,
    }),
  )
}
