import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/events'
import { useSyncExternalStore } from 'react'
import { readCommissionViewMode } from './viewModeState'

type CommissionViewMode = import('./CommissionViewModeSearch').CommissionViewMode
export type { CommissionViewMode } from './CommissionViewModeSearch'

function subscribeToCommissionViewMode(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onStoreChange)
  }
}

function getCommissionViewModeSnapshot() {
  return typeof window === 'undefined'
    ? ('character' as CommissionViewMode)
    : readCommissionViewMode(window)
}

export function useCommissionViewMode(initialMode: CommissionViewMode = 'character') {
  return useSyncExternalStore(
    subscribeToCommissionViewMode,
    getCommissionViewModeSnapshot,
    () => initialMode,
  )
}
