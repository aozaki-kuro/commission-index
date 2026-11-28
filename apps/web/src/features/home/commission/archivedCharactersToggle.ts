import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import {
  ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT,
  ARCHIVED_CONTAINER_SELECTOR,
  CHARACTER_PANEL_SELECTOR,
  dispatchArchivedCharactersStateChange,
  persistReloadArchivedCharactersVisibility,
  readSavedArchivedCharactersVisibility,
} from '@features/home/commission/archivedCharactersState'

const ARCHIVED_DIVIDER_SELECTOR = '[data-archived-divider="true"]'
const ARCHIVED_PLACEHOLDER_SELECTOR = '[data-archived-sections-placeholder="true"]'
const ARCHIVED_LOAD_TRIGGER_SELECTOR = '[data-load-archived-characters="true"]'
const SIDEBAR_ARCHIVED_DETAILS_SELECTOR = '[data-sidebar-archived-details="true"]'

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
  const sidebarDetails = doc.querySelector<HTMLDetailsElement>(SIDEBAR_ARCHIVED_DETAILS_SELECTOR)

  // The pre-paint inline script may already have shown archived for a hash target, so the panel
  // attribute is the source of truth rather than an assumed initial `hidden`.
  const readVisibility = (): ArchivedCharactersVisibility =>
    panel.dataset.archivedVisibility === 'visible'
      ? 'visible'
      : 'hidden'

  const syncSidebarDetails = (visible: boolean) => {
    if (!sidebarDetails || sidebarDetails.dataset.sidebarSlideBound === 'true')
      return
    if (sidebarDetails.open !== visible)
      sidebarDetails.open = visible
  }

  // Applied synchronously so a caller can show archived and scroll into it in the same frame.
  const setVisibility = (visibility: ArchivedCharactersVisibility) => {
    if (readVisibility() === visibility)
      return false

    const visible = visibility === 'visible'
    container.classList.toggle('hidden', !visible)
    divider?.classList.toggle('hidden', !visible)
    placeholder?.classList.toggle('hidden', visible)
    panel.dataset.archivedVisibility = visibility
    syncSidebarDetails(visible)
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

  const onSidebarDetailsToggle = () => {
    if (!sidebarDetails || sidebarDetails.dataset.sidebarSlideBound === 'true')
      return
    if (sidebarDetails.open)
      onShowRequest()
    else
      onCollapseRequest()
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
  else {
    syncSidebarDetails(readVisibility() === 'visible')
  }

  panel.addEventListener('click', onPanelClick)
  sidebarDetails?.addEventListener('toggle', onSidebarDetailsToggle)
  win.addEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
  win.addEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
  win.addEventListener('pagehide', persistReloadVisibility)
  win.addEventListener('beforeunload', persistReloadVisibility)

  return () => {
    panel.removeEventListener('click', onPanelClick)
    sidebarDetails?.removeEventListener('toggle', onSidebarDetailsToggle)
    win.removeEventListener(ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT, onShowRequest)
    win.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT, onCollapseRequest)
    win.removeEventListener('pagehide', persistReloadVisibility)
    win.removeEventListener('beforeunload', persistReloadVisibility)
  }
}
