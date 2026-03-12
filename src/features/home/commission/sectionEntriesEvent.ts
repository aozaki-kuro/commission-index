export const SECTION_ENTRIES_LOAD_REQUEST_EVENT = 'home:section-entries-load-request'
export const SECTION_ENTRIES_LOADED_EVENT = 'home:section-entries-loaded'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const SECTION_TEMPLATE_SELECTOR = 'template[data-section-entries-template="true"]'

export const readDeferredSectionEntriesTemplateCount = (doc?: Document) => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  if (!panel) return 0

  return panel.querySelectorAll<HTMLTemplateElement>(SECTION_TEMPLATE_SELECTOR).length
}

export const requestSectionEntriesLoad = (win: Window) => {
  win.dispatchEvent(new Event(SECTION_ENTRIES_LOAD_REQUEST_EVENT))
}
