import { useSyncExternalStore } from 'react'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from './viewModeEvent'
import { readCommissionViewMode } from './viewModeState'

type CommissionViewMode = import('./CommissionViewModeSearch').CommissionViewMode
export type { CommissionViewMode } from './CommissionViewModeSearch'

const subscribeToCommissionViewMode = (onStoreChange: () => void) => {
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

const getCommissionViewModeSnapshot = () =>
  typeof window === 'undefined'
    ? ('character' as CommissionViewMode)
    : readCommissionViewMode(window)

export const useCommissionViewMode = (initialMode: CommissionViewMode = 'character') =>
  useSyncExternalStore(
    subscribeToCommissionViewMode,
    getCommissionViewModeSnapshot,
    () => initialMode,
  )
