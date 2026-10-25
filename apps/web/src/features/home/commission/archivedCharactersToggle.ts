import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import {
  ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT,
  dispatchArchivedCharactersStateChange,
  persistReloadArchivedCharactersVisibility,
  readSavedArchivedCharactersVisibility,
} from '@features/home/commission/archivedCharactersState'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const ARCHIVED_CONTAINER_SELECTOR = '[data-archived-sections-container="true"]'
const ARCHIVED_DIVIDER_SELECTOR = '[data-archived-divider="true"]'
const ARCHIVED_PLACEHOLDER_SELECTOR = '[data-archived-sections-placeholder="true"]'
const ARCHIVED_LOAD_TRIGGER_SELECTOR = '[data-load-archived-characters="true"]'

export function mountArchivedCharactersToggle({
  win = window,
  doc = document,
}: {
  win?: Window
  doc?: Document
} = {}) {
  const panel = doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  const container = panel?.querySelector<HTMLElement>(ARCHIVED_CONTAINER_SELECTOR) ?? null
  if (!panel || !container)
    return () => {}

  const divider = panel.querySelector<HTMLElement>(ARCHIVED_DIVIDER_SELECTOR)
  const placeholder = panel.querySelector<HTMLElement>(ARCHIVED_PLACEHOLDER_SELECTOR)

  // The pre-paint inline script may already have shown archived for a hash target, so the panel
  // attribute is the source of truth rather than an assumed initial `hidden`.
  const readVisibility = (): ArchivedCharactersVisibility =>
    panel.dataset.archivedVisibility === 'visible' ? 'visible' : 'hidden'

  // Applied synchronously so a caller can show archived and scroll into it in the same frame.
  const setVisibility = (visibility: ArchivedCharactersVisibility) => {
    if (readVisibility() === visibility)
      return false

    const visible = visibility === 'visible'
    container.classList.toggle('hidden', !visible)
    divider?.classList.toggle('hidden', !visible)
    placeholder?.classList.toggle('hidden', visible)
    panel.dataset.archivedVisibility = visibility
    dispatchArchivedCharactersStateChange(win, { visibility })
    return true
  }

  const onShowRequest = () => {
    setVisibility('visible')
  }

  const onCollapseRequest = () => {
    if (!setVisibility('hidden'))
      return
    persistReloadArchivedCharactersVisibility({ doc, win })
    win.dispatchEvent(new Event(ARCHIVED_CHARACTERS_COLLAPSED_EVENT))
  }

  const onPanelClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest(ARCHIVED_LOAD_TRIGGER_SELECTOR))
      return

    event.preventDefault()
    onShowRequest()
  }

  const persistReloadVisibility = () => {
    persistReloadArchivedCharactersVisibility({ doc, win })
  }

  if (readSavedArchivedCharactersVisibility(win) === 'visible') {
    setVisibility('visible')
  }

  panel.addEventListener('click', onPanelClick)
  win.addEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
  win.addEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('pagehide', persistReloadVisibility)
  win.addEventListener('beforeunload', persistReloadVisibility)

  return () => {
    panel.removeEventListener('click', onPanelClick)
    win.removeEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
    win.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('pagehide', persistReloadVisibility)
    win.removeEventListener('beforeunload', persistReloadVisibility)
  }
}
