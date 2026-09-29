import { useSyncExternalStore } from 'react'
import { isPendingRebuild, subscribeToPendingRebuild } from '../lib/pendingRebuildSignal'
import { getServerWebsiteRebuildState, getWebsiteRebuildState, queueWebsiteRebuild, subscribeToWebsiteRebuild } from '../lib/websiteRebuild'
import { FloatingNotice } from './FloatingNotice'

export function FloatingRebuildButton() {
  const hasPending = useSyncExternalStore(subscribeToPendingRebuild, isPendingRebuild, () => false)
  const rebuild = useSyncExternalStore(subscribeToWebsiteRebuild, getWebsiteRebuildState, getServerWebsiteRebuildState)
  const status = rebuild.status === 'success' && hasPending ? 'idle' : rebuild.status
  if (!hasPending && status === 'idle')
    return null

  const label = status === 'pending'
    ? 'Dispatching…'
    : status === 'success'
      ? 'Dispatched ✓'
      : status === 'error'
        ? 'Retry'
        : 'Rebuild'

  const toneStyles = status === 'error'
    ? 'border-red-300 text-red-600 hover:border-red-400 dark:border-red-700 dark:text-red-300 dark:hover:border-red-600'
    : status === 'success'
      ? 'border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-300'
      : 'border-amber-400 text-amber-600 hover:border-amber-500 hover:text-amber-700 dark:border-amber-500 dark:text-amber-300 dark:hover:border-amber-400 dark:hover:text-amber-200'

  return (
    <FloatingNotice tone={status === 'error' ? 'error' : status === 'success' ? 'success' : 'warning'}>
      <div className="flex min-w-0 items-center justify-between gap-4">
        <p className="min-w-0 text-xs">{status === 'error' ? 'Rebuild could not be queued.' : status === 'success' ? 'Rebuild queued.' : status === 'pending' ? 'Queueing the website rebuild.' : 'Saved changes are ready to publish.'}</p>
        <button
          type="button"
          onClick={() => void queueWebsiteRebuild()}
          disabled={status === 'pending'}
          className={`
        shrink-0 rounded-lg border bg-white/90 px-3 py-1.5
        text-xs font-medium shadow-sm backdrop-blur-sm
        transition
        active:scale-[0.97]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        dark:bg-gray-900/80
        ${toneStyles}
      `}
        >
          {label}
        </button>
      </div>
    </FloatingNotice>
  )
}
