'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type CommissionViewMode = 'character' | 'timeline'

type CommissionViewModeContextValue = {
  mode: CommissionViewMode
  setMode: (mode: CommissionViewMode) => void
}

const VIEW_MODE_QUERY_PARAM = 'view'

const parseCommissionViewModeFromSearch = (search: string): CommissionViewMode => {
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
}

const CommissionViewModeContext = createContext<CommissionViewModeContextValue | null>(null)

export const CommissionViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<CommissionViewMode>(() =>
    typeof window === 'undefined'
      ? 'character'
      : parseCommissionViewModeFromSearch(window.location.search),
  )

  useEffect(() => {
    replaceCommissionViewModeInAddress(mode)
  }, [mode])

  const value = useMemo(() => ({ mode, setMode }), [mode])

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

export const CommissionViewModeToggle = ({
  className = '',
  compact = false,
}: {
  className?: string
  compact?: boolean
}) => {
  const { mode, setMode } = useCommissionViewMode()

  return (
    <div
      className={`${className} ${
        compact ? 'space-y-2' : 'border-b border-gray-300/80 pb-2 dark:border-gray-700'
      }`.trim()}
    >
      {compact ? (
        <div className="pl-4 font-mono text-[11px] tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
          View
        </div>
      ) : null}
      <div
        className={`flex gap-2 font-mono text-xs tracking-[0.08em] text-gray-700 uppercase md:text-sm dark:text-gray-300 ${
          compact ? 'pl-4' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setMode('character')}
          aria-pressed={mode === 'character'}
          className="rounded-full px-3 py-1.5 no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 aria-pressed:bg-gray-900 aria-pressed:text-white dark:aria-pressed:bg-gray-100 dark:aria-pressed:text-black"
        >
          by character
        </button>
        <button
          type="button"
          onClick={() => setMode('timeline')}
          aria-pressed={mode === 'timeline'}
          className="rounded-full px-3 py-1.5 no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 aria-pressed:bg-gray-900 aria-pressed:text-white dark:aria-pressed:bg-gray-100 dark:aria-pressed:text-black"
        >
          by date
        </button>
      </div>
    </div>
  )
}

export const CommissionViewPanel = ({
  panel,
  children,
  className = '',
}: {
  panel: CommissionViewMode
  children: ReactNode
  className?: string
}) => {
  const { mode } = useCommissionViewMode()
  const active = mode === panel

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
