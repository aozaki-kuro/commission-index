import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { STYLES } from './constants'

const ViewModeSwitchButton = () => {
  const { mode, setMode } = useCommissionViewMode()
  const nextMode = mode === 'character' ? 'timeline' : 'character'
  const currentLabel = mode === 'character' ? 'By Character' : 'By Date'
  const nextLabel = nextMode === 'timeline' ? 'By Date' : 'By Character'
  const isTimeline = mode === 'timeline'

  return (
    <button
      type="button"
      className={`${STYLES.floatingButton} ${
        isTimeline
          ? '!bg-gray-300/90 !text-gray-900 shadow-[0_4px_14px_rgba(0,0,0,0.16)] !ring-gray-500/35 hover:!bg-gray-300/90 dark:!bg-white/24 dark:!text-white dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)] dark:!ring-white/28 dark:hover:!bg-white/24'
          : ''
      }`.trim()}
      onClick={() => {
        trackRybbitEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
          from_mode: mode,
          to_mode: nextMode,
          already_active: false,
        })
        setMode(nextMode)
      }}
      aria-label={`Switch view mode to ${nextLabel}`}
      aria-pressed={isTimeline}
      title={currentLabel}
      data-view-mode={mode}
    >
      <span className="sr-only">{currentLabel}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 8h14" />
        <path
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m7.5 5.5-3 2.5 3 2.5"
        />
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 16H5" />
        <path
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m16.5 13.5 3 2.5-3 2.5"
        />
      </svg>
    </button>
  )
}

export default ViewModeSwitchButton
