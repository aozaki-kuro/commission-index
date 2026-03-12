import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'

export const ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:active-characters-load-request'
export const ACTIVE_CHARACTERS_LOADED_EVENT = 'home:active-characters-loaded'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'

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

export const hasDeferredActiveCharacterTarget = (
  doc: Document,
  rawSectionId: string | null | undefined,
) => {
  const sectionId = normalizeSectionId(rawSectionId)
  if (!sectionId) return false

  const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
  if (!template) return false

  return templateContentContainsElementId(template.content, sectionId)
}

export const requestActiveCharactersLoad = (win: Window) => {
  win.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT))
}
