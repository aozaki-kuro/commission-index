import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '@features/home/commission/viewModeState'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '@features/home/events'
import { applyViewModeToggleClasses, MOBILE_VIEW_MODE_TAB_CLASSES } from '@features/home/nav/viewModeToggleClasses'

const TOGGLE_SELECTOR = MOBILE_VIEW_MODE_TAB_CLASSES.toggleSelector

function syncToggleButtonState(button: HTMLButtonElement, active: boolean) {
  button.setAttribute('aria-pressed', String(active))
  applyViewModeToggleClasses(button, MOBILE_VIEW_MODE_TAB_CLASSES, active)
}

interface MountMobileViewModeTabsOptions {
  win?: Window
  doc?: Document
}

export function mountMobileViewModeTabs({
  win = window,
  doc = document,
}: MountMobileViewModeTabsOptions = {}) {
  const root = doc.querySelector<HTMLElement>('[data-mobile-view-tabs="true"]')
  if (!root)
    return () => {}

  const syncByUrl = () => {
    const mode = readCommissionViewMode(win)
    const buttons = root.querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR)
    buttons.forEach((button) => {
      const buttonMode = resolveCommissionViewModeFromElement(button)
      syncToggleButtonState(button, buttonMode === mode)
    })
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const button = target.closest<HTMLButtonElement>(TOGGLE_SELECTOR)
    if (!button)
      return

    const nextMode = resolveCommissionViewModeFromElement(button)
    if (!nextMode)
      return

    const currentMode = readCommissionViewMode(win)
    if (nextMode !== currentMode) {
      replaceCommissionViewModeInAddress(win, nextMode)
      return
    }

    syncByUrl()
  }

  root.addEventListener('click', onClick)
  win.addEventListener('popstate', syncByUrl)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByUrl)
  syncByUrl()

  return () => {
    root.removeEventListener('click', onClick)
    win.removeEventListener('popstate', syncByUrl)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByUrl)
  }
}
