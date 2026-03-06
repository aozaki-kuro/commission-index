import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from './viewModeEvent'
import {
  parseCommissionViewModeFromSearch,
  type CommissionViewMode,
} from './CommissionViewModeSearch'

export const readCommissionViewMode = (win: Window): CommissionViewMode =>
  parseCommissionViewModeFromSearch(win.location.search)

export const resolveCommissionViewModeFromElement = (
  target: Element | null,
): CommissionViewMode | null => {
  if (!target) return null

  const mode = target.getAttribute('data-view-mode')
  if (mode === 'character' || mode === 'timeline') return mode
  return null
}

export const replaceCommissionViewModeInAddress = (win: Window, mode: CommissionViewMode) => {
  const url = new URL(win.location.href)
  if (mode === 'timeline') {
    url.searchParams.set('view', 'timeline')
  } else {
    url.searchParams.delete('view')
  }

  win.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  win.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
}
