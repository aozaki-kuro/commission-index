import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '#features/home/nav/hamburger/hamburgerMenuStateEvent'

const ROOT_SELECTOR = '[data-mobile-language-menu-root="true"]'
const MENU_SELECTOR = '[data-mobile-language-menu="true"]'
const ANCHOR_SELECTOR = '[data-mobile-language-menu-anchor="true"]'
const PANEL_SELECTOR = '[data-mobile-language-menu-panel="true"]'
const HAMBURGER_SELECTOR = '[data-mobile-hamburger="true"]'

const applyHiddenState = ({
  root,
  anchor,
  menu,
  hidden,
}: {
  root: HTMLElement
  anchor: HTMLElement
  menu: HTMLDetailsElement
  hidden: boolean
}) => {
  root.classList.toggle('translate-y-1', hidden)
  root.classList.toggle('opacity-0', hidden)
  root.classList.toggle('opacity-100', !hidden)
  anchor.classList.toggle('pointer-events-none', hidden)
  anchor.classList.toggle('pointer-events-auto', !hidden)

  if (hidden) {
    menu.open = false
  }
}

const syncDropdownPanelState = (panel: HTMLElement, open: boolean) => {
  panel.classList.toggle('pointer-events-auto', open)
  panel.classList.toggle('opacity-100', open)
  panel.classList.toggle('translate-y-0', open)
  panel.classList.toggle('scale-100', open)

  panel.classList.toggle('pointer-events-none', !open)
  panel.classList.toggle('opacity-0', !open)
  panel.classList.toggle('translate-y-1', !open)
  panel.classList.toggle('scale-95', !open)
}

const readHamburgerMounted = (doc: Document) =>
  doc.querySelector<HTMLElement>(HAMBURGER_SELECTOR)?.dataset.mobileHamburgerMounted === 'true'

const readMountedFromEvent = (event: Event, doc: Document) => {
  if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
    const detail = event.detail as { mounted?: unknown }
    if (typeof detail.mounted === 'boolean') return detail.mounted
  }

  return readHamburgerMounted(doc)
}

type MountMobileLanguageMenuOptions = {
  win?: Window
  doc?: Document
}

export const mountMobileLanguageMenu = ({
  win = window,
  doc = document,
}: MountMobileLanguageMenuOptions = {}) => {
  const root = doc.querySelector<HTMLElement>(ROOT_SELECTOR)
  const anchor = root?.querySelector<HTMLElement>(ANCHOR_SELECTOR) ?? null
  const menu = root?.querySelector<HTMLDetailsElement>(MENU_SELECTOR) ?? null
  const panel = root?.querySelector<HTMLElement>(PANEL_SELECTOR) ?? null
  if (!root || !anchor || !menu || !panel) return () => {}

  const syncDropdownState = () => {
    syncDropdownPanelState(panel, menu.open)
  }

  const syncVisibility = (mounted: boolean) => {
    applyHiddenState({ root, anchor, menu, hidden: mounted })
    syncDropdownState()
  }

  const onHamburgerMountedChange = (event: Event) => {
    syncVisibility(readMountedFromEvent(event, doc))
  }

  const onDocumentClick = (event: Event) => {
    const target = event.target
    if (target instanceof Node && menu.contains(target)) return
    menu.open = false
  }

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    menu.open = false
  }

  const onMenuToggle = () => {
    syncDropdownState()
  }

  win.addEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onHamburgerMountedChange)
  doc.addEventListener('click', onDocumentClick)
  doc.addEventListener('keydown', onDocumentKeyDown)
  menu.addEventListener('toggle', onMenuToggle)

  syncVisibility(readHamburgerMounted(doc))

  return () => {
    win.removeEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onHamburgerMountedChange)
    doc.removeEventListener('click', onDocumentClick)
    doc.removeEventListener('keydown', onDocumentKeyDown)
    menu.removeEventListener('toggle', onMenuToggle)
  }
}
