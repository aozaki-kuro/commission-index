import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'

const PANEL_SELECTOR = '[data-commission-view-panel]'

type MountCommissionViewModeDomSyncOptions = {
  win?: Window
  doc?: Document
}

export const mountCommissionViewModeDomSync = ({
  win = window,
  doc = document,
}: MountCommissionViewModeDomSyncOptions = {}) => {
  const syncPanelsByMode = () => {
    const mode = readCommissionViewMode(win)
    const panels = doc.querySelectorAll<HTMLElement>(PANEL_SELECTOR)

    for (const panel of panels) {
      const panelMode = panel.dataset.commissionViewPanel
      if (panelMode !== 'character' && panelMode !== 'timeline') continue

      const isActive = panelMode === mode
      panel.dataset.commissionViewActive = isActive ? 'true' : 'false'
      panel.classList.toggle('hidden', !isActive)
    }
  }

  win.addEventListener('popstate', syncPanelsByMode)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncPanelsByMode)
  syncPanelsByMode()

  return () => {
    win.removeEventListener('popstate', syncPanelsByMode)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncPanelsByMode)
  }
}
