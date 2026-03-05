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
import { useHomeLocaleMessages } from '#features/home/i18n/HomeLocaleContext'

export type CommissionViewMode = 'character' | 'timeline'

type CommissionViewModeContextValue = {
  mode: CommissionViewMode
  setMode: (mode: CommissionViewMode) => void
  isPanelMounted: (panel: CommissionViewMode) => boolean
}

const VIEW_MODE_QUERY_PARAM = 'view'
const VIEW_MODE_URL_CHANGE_EVENT = 'commission-view-mode-change'

export const parseCommissionViewModeFromSearch = (search: string): CommissionViewMode => {
  const view = new URLSearchParams(search).get(VIEW_MODE_QUERY_PARAM)
  return view === 'timeline' ? 'timeline' : 'character'
}

const replaceCommissionViewModeInAddress = (mode: CommissionViewMode) => {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (mode === 'timeline') {
    url.searchParams.set(VIEW_MODE_QUERY_PARAM, 'timeline')
  } else {
    url.searchParams.delete(VIEW_MODE_QUERY_PARAM)
  }

  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(VIEW_MODE_URL_CHANGE_EVENT))
}

const subscribeToCommissionViewMode = (onStoreChange: () => void) => {
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(VIEW_MODE_URL_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(VIEW_MODE_URL_CHANGE_EVENT, onStoreChange)
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
    typeof window === 'undefined'
      ? initialMode
      : parseCommissionViewModeFromSearch(window.location.search)
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
    () => parseCommissionViewModeFromSearch(window.location.search),
    () => initialMode,
  )
  const setMode = useCallback(
    (nextMode: CommissionViewMode) => {
      markPanelMounted(nextMode)
      if (nextMode === parseCommissionViewModeFromSearch(window.location.search)) return
      replaceCommissionViewModeInAddress(nextMode)
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

export const CommissionViewTabs = () => {
  return <CommissionViewModeToggle className="mb-6 lg:hidden" />
}

const ViewModeTabButton = ({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`relative px-2 pt-1 pb-2 font-mono text-sm leading-5 no-underline transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 ${
      active
        ? 'text-gray-700 dark:text-gray-300'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'
    }`.trim()}
  >
    <span>{label}</span>
    <span
      aria-hidden="true"
      className={`absolute bottom-0 left-0 h-px rounded-full bg-current transition-[width,opacity] duration-200 ${
        active ? 'w-full opacity-100' : 'w-0 opacity-0'
      }`}
    />
  </button>
)

export const CommissionViewModeToggle = ({
  className = '',
  compact = false,
}: {
  className?: string
  compact?: boolean
}) => {
  const { mode, setMode } = useCommissionViewMode()
  const { controls } = useHomeLocaleMessages()

  return (
    <div className={`${className} ${compact ? 'space-y-2' : 'pb-2'}`.trim()}>
      {compact ? (
        <div className="pl-4 font-mono text-[11px] tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
          {controls.view}
        </div>
      ) : null}
      <div className={`relative flex items-end gap-0 ${compact ? 'pr-2 pl-4' : ''}`}>
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 left-0 h-px bg-gray-300/80 dark:bg-gray-700"
        />
        <ViewModeTabButton
          label={controls.byCharacter}
          active={mode === 'character'}
          onClick={() => setMode('character')}
        />
        <ViewModeTabButton
          label={controls.byDate}
          active={mode === 'timeline'}
          onClick={() => setMode('timeline')}
        />
      </div>
    </div>
  )
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
