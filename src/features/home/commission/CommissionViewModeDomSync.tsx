import { useEffect } from 'react'
import { useCommissionViewMode, type CommissionViewMode } from './CommissionViewMode'

const isPanel = (value: string | undefined): value is CommissionViewMode =>
  value === 'character' || value === 'timeline'

const CommissionViewModeDomSync = () => {
  const { mode } = useCommissionViewMode()

  useEffect(() => {
    const panels = document.querySelectorAll<HTMLElement>('[data-commission-view-panel]')
    panels.forEach(panel => {
      const panelMode = panel.dataset.commissionViewPanel
      if (!isPanel(panelMode)) return

      const isActive = panelMode === mode
      panel.dataset.commissionViewActive = isActive ? 'true' : 'false'
      panel.classList.toggle('hidden', !isActive)
    })
  }, [mode])

  return null
}

export default CommissionViewModeDomSync
