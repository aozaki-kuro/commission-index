export const COMMISSION_VIEW_MODE_CHANGE_EVENT = 'commission-view-mode-change'
export const HOME_SCROLL_RESTORE_ABORT_EVENT = 'home:scroll-restore-abort'
export const HAMBURGER_MENU_MOUNTED_CHANGE_EVENT = 'hamburger-menu-mounted-change'

export function dispatchHomeScrollRestoreAbort(win: Window) {
  win.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))
}
