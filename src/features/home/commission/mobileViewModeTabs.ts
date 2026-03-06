import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '#features/home/commission/viewModeState'

const TOGGLE_SELECTOR = '[data-mobile-view-mode-toggle="true"]'

const syncToggleButtonState = (button: HTMLButtonElement, active: boolean) => {
  button.setAttribute('aria-pressed', String(active))
  button.classList.toggle('text-gray-700', active)
  button.classList.toggle('dark:text-gray-300', active)
  button.classList.toggle('text-gray-500', !active)
  button.classList.toggle('dark:text-gray-500', !active)

  const indicator = button.querySelector<HTMLElement>('[data-mobile-view-mode-indicator]')
  if (!indicator) return

  indicator.classList.toggle('w-full', active)
  indicator.classList.toggle('opacity-100', active)
  indicator.classList.toggle('w-0', !active)
  indicator.classList.toggle('opacity-0', !active)
}

type MountMobileViewModeTabsOptions = {
  win?: Window
  doc?: Document
}

export const mountMobileViewModeTabs = ({
  win = window,
  doc = document,
}: MountMobileViewModeTabsOptions = {}) => {
  const root = doc.querySelector<HTMLElement>('[data-mobile-view-tabs="true"]')
  if (!root) return () => {}

  const syncByUrl = () => {
    const mode = readCommissionViewMode(win)
    const buttons = root.querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR)
    buttons.forEach(button => {
      const buttonMode = resolveCommissionViewModeFromElement(button)
      syncToggleButtonState(button, buttonMode === mode)
    })
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest<HTMLButtonElement>(TOGGLE_SELECTOR)
    if (!button) return

    const nextMode = resolveCommissionViewModeFromElement(button)
    if (!nextMode) return

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
