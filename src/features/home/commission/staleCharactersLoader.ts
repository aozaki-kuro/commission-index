import {
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const STALE_PLACEHOLDER_SELECTOR = '[data-stale-sections-placeholder="true"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_CONTAINER_SELECTOR = '[data-stale-sections-container="true"]'
const STALE_LOAD_TRIGGER_SELECTOR = '[data-load-stale-characters="true"]'

const isStaleLoaded = (panel: HTMLElement | null) => panel?.dataset.staleLoaded === 'true'

const mountTemplateContent = (panel: HTMLElement) => {
  const template = panel.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  const container = panel.querySelector<HTMLElement>(STALE_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.append(template.content.cloneNode(true))
  template.remove()
  return true
}

const hidePlaceholder = (panel: HTMLElement) => {
  const placeholder = panel.querySelector<HTMLElement>(STALE_PLACEHOLDER_SELECTOR)
  if (!placeholder) return
  placeholder.classList.add('hidden')
}

const loadStaleSections = (win: Window, panel: HTMLElement | null) => {
  if (!panel || isStaleLoaded(panel)) return false
  if (!mountTemplateContent(panel)) return false

  panel.dataset.staleLoaded = 'true'
  hidePlaceholder(panel)
  dispatchSidebarSearchState()
  win.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))
  return true
}

export const mountStaleCharactersLoader = ({
  win = window,
  doc = document,
}: {
  win?: Window
  doc?: Document
} = {}) => {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  if (!panel) return () => {}

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const trigger = target.closest<HTMLElement>(STALE_LOAD_TRIGGER_SELECTOR)
    if (!trigger) return

    loadStaleSections(win, panel)
  }

  const onLoadRequest = () => {
    loadStaleSections(win, panel)
  }

  doc.addEventListener('click', onClick)
  win.addEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)

  return () => {
    doc.removeEventListener('click', onClick)
    win.removeEventListener(STALE_CHARACTERS_LOAD_REQUEST_EVENT, onLoadRequest)
  }
}
