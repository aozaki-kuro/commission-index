import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from './viewModeEvent'
import { readCommissionViewMode, replaceCommissionViewModeInAddress } from './viewModeState'

type CommissionViewMode = import('./CommissionViewModeSearch').CommissionViewMode
export type { CommissionViewMode } from './CommissionViewModeSearch'

type CommissionViewModeContextValue = {
  mode: CommissionViewMode
  setMode: (mode: CommissionViewMode) => void
  isPanelMounted: (panel: CommissionViewMode) => boolean
}

const subscribeToCommissionViewMode = (onStoreChange: () => void) => {
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onStoreChange)
  }
}

const CommissionViewModeContext = createContext<CommissionViewModeContextValue | null>(null)

export const CommissionViewModeProvider = ({
  children,
  initialMode = 'character',
}: {
  children: ReactNode
  initialMode?: CommissionViewMode
}) => {
  const initialMountedMode =
    typeof window === 'undefined' ? initialMode : readCommissionViewMode(window)
  const [mountedPanels, setMountedPanels] = useState<Set<CommissionViewMode>>(
    () => new Set([initialMountedMode]),
  )

  const markPanelMounted = useCallback((panel: CommissionViewMode) => {
    setMountedPanels(current => {
      if (current.has(panel)) return current
      const next = new Set(current)
      next.add(panel)
      return next
    })
  }, [])

  const mode = useSyncExternalStore(
    subscribeToCommissionViewMode,
    () => readCommissionViewMode(window),
    () => initialMode,
  )
  const setMode = useCallback(
    (nextMode: CommissionViewMode) => {
      markPanelMounted(nextMode)
      if (nextMode === readCommissionViewMode(window)) return
      replaceCommissionViewModeInAddress(window, nextMode)
    },
    [markPanelMounted],
  )

  const isPanelMounted = useCallback(
    (panel: CommissionViewMode) => mountedPanels.has(panel),
    [mountedPanels],
  )

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const rafId = requestAnimationFrame(() => {
      scrollToHashTargetFromHrefWithoutHash(hash)
    })

    return () => cancelAnimationFrame(rafId)
  }, [mode])

  const value = useMemo(() => ({ mode, setMode, isPanelMounted }), [isPanelMounted, mode, setMode])

  return (
    <CommissionViewModeContext.Provider value={value}>
      {children}
    </CommissionViewModeContext.Provider>
  )
}

export const useCommissionViewMode = () => {
  const context = useContext(CommissionViewModeContext)
  if (!context) {
    throw new Error('useCommissionViewMode must be used within CommissionViewModeProvider')
  }
  return context
}

export const CommissionViewPanel = ({
  panel,
  children,
  className = '',
  deferInactiveMount = false,
}: {
  panel: CommissionViewMode
  children: ReactNode
  className?: string
  deferInactiveMount?: boolean
}) => {
  const { mode, isPanelMounted } = useCommissionViewMode()
  const active = mode === panel
  const shouldRender = active || !deferInactiveMount || isPanelMounted(panel)

  if (!shouldRender) return null

  return (
    <div
      data-commission-view-panel={panel}
      data-commission-view-active={active ? 'true' : 'false'}
      className={active ? className : `hidden ${className}`.trim()}
    >
      {children}
    </div>
  )
}
