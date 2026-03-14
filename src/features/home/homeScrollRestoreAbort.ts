export const HOME_SCROLL_RESTORE_ABORT_EVENT = 'home:scroll-restore-abort'

export function dispatchHomeScrollRestoreAbort(win: Window) {
  win.dispatchEvent(new Event(HOME_SCROLL_RESTORE_ABORT_EVENT))
}
