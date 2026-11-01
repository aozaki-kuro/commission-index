import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'

const ROOT_SELECTOR = '[data-mobile-keyword-button-root="true"]'
const ANCHOR_SELECTOR = '[data-mobile-keyword-button-anchor="true"]'
const HAMBURGER_SELECTOR = '[data-mobile-hamburger="true"]'

function applyHiddenState(root: HTMLElement, anchor: HTMLElement, hidden: boolean) {
  root.classList.toggle('translate-y-1', hidden)
  root.classList.toggle('opacity-0', hidden)
  root.classList.toggle('opacity-100', !hidden)
  anchor.classList.toggle('pointer-events-none', hidden)
  anchor.classList.toggle('pointer-events-auto', !hidden)
}

function readHamburgerMounted(doc: Document) {
  return doc.querySelector<HTMLElement>(HAMBURGER_SELECTOR)?.dataset.mobileHamburgerMounted === 'true'
}

function readMountedFromEvent(event: Event, doc: Document) {
  if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
    const detail = event.detail as { mounted?: unknown }
    if (typeof detail.mounted === 'boolean')
      return detail.mounted
  }

  return readHamburgerMounted(doc)
}

interface MountMobileKeywordButtonOptions {
  win?: Window
  doc?: Document
}

// The open hamburger panel covers the page, so the keyword button steps aside instead of floating over it.
export function mountMobileKeywordButton({
  win = window,
  doc = document,
}: MountMobileKeywordButtonOptions = {}) {
  const root = doc.querySelector<HTMLElement>(ROOT_SELECTOR)
  const anchor = root?.querySelector<HTMLElement>(ANCHOR_SELECTOR) ?? null
  if (!root || !anchor)
    return () => {}

  const onHamburgerMountedChange = (event: Event) => {
    applyHiddenState(root, anchor, readMountedFromEvent(event, doc))
  }

  win.addEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onHamburgerMountedChange)
  applyHiddenState(root, anchor, readHamburgerMounted(doc))

  return () => {
    win.removeEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, onHamburgerMountedChange)
  }
}
