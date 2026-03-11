import { useEffect, useState } from 'react'
import { refreshAssetsAction } from '#admin/actions'
import CommissionManager from '#admin/CommissionManager'
import { useAdminBootstrap } from '#admin/hooks/useAdminBootstrap'
import type { AdminBootstrapData } from '#lib/admin/db'

interface AdminEditIslandProps {
  initialPayload?: AdminBootstrapData | null
}

const scrollStorageKey = 'admin-dashboard-scroll'
const scrollExpiryMs = 10 * 60 * 1000

type StoredScrollState = {
  top: number
  timestamp: number
}

const getCurrentScrollTop = () => Math.max(window.scrollY, window.pageYOffset, 0)

const isReloadNavigation = () => {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return false
  const navigationEntry = performance.getEntriesByType('navigation')[0]
  return navigationEntry instanceof PerformanceNavigationTiming
    ? navigationEntry.type === 'reload'
    : false
}

const readStoredScrollTop = (): number | null => {
  if (typeof window === 'undefined' || !isReloadNavigation()) return null

  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredScrollState>
    const timestamp = Number(parsed.timestamp)
    const top = Number(parsed.top)

    if (!Number.isFinite(timestamp) || !Number.isFinite(top)) {
      return null
    }

    if (Date.now() - timestamp > scrollExpiryMs) {
      return null
    }

    return Math.max(0, top)
  } catch {
    return null
  }
}

const writeStoredScrollTop = () => {
  if (typeof window === 'undefined') return

  const state: StoredScrollState = {
    top: getCurrentScrollTop(),
    timestamp: Date.now(),
  }

  window.sessionStorage.setItem(scrollStorageKey, JSON.stringify(state))
}

const AdminEditIsland = ({ initialPayload = null }: AdminEditIslandProps) => {
  const { payload, errorMessage, isLoading, reload } = useAdminBootstrap<AdminBootstrapData>({
    initialPayload,
    errorFallback: 'Failed to load admin data.',
    subscribeUpdates: true,
  })
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [pendingScrollTop] = useState<number | null>(() => readStoredScrollTop())
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false)

  useEffect(() => {
    if (!refreshMessage) return
    const timer = window.setTimeout(() => setRefreshMessage(null), 2400)
    return () => window.clearTimeout(timer)
  }, [refreshMessage])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let frameId: number | null = null

    const persistNow = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
      writeStoredScrollTop()
    }

    const schedulePersist = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        writeStoredScrollTop()
      })
    }

    schedulePersist()
    window.addEventListener('scroll', schedulePersist, { passive: true })
    window.addEventListener('pagehide', persistNow)
    window.addEventListener('beforeunload', persistNow)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('scroll', schedulePersist)
      window.removeEventListener('pagehide', persistNow)
      window.removeEventListener('beforeunload', persistNow)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pendingScrollTop === null || hasRestoredScroll || !payload) return

    let frameId: number | null = null
    let attempts = 0

    const restore = () => {
      attempts += 1
      window.scrollTo({ top: pendingScrollTop, behavior: 'auto' })

      const maxScrollTop = Math.max(
        0,
        Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight,
          document.body.offsetHeight,
        ) - window.innerHeight,
      )
      const targetTop = Math.min(pendingScrollTop, maxScrollTop)

      if (Math.abs(getCurrentScrollTop() - targetTop) <= 4 || attempts >= 120) {
        setHasRestoredScroll(true)
        return
      }

      frameId = window.requestAnimationFrame(restore)
    }

    frameId = window.requestAnimationFrame(restore)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [hasRestoredScroll, payload, pendingScrollTop])

  if (!payload && errorMessage) {
    return (
      <div>
        <p className="text-sm text-red-300">{errorMessage}</p>
        <button
          className="mt-3 inline-flex rounded-md border border-zinc-500 px-3 py-1 text-sm hover:border-zinc-300"
          onClick={reload}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading) {
    return <p>Loading admin data...</p>
  }

  if (!payload) {
    return (
      <div>
        <p className="text-sm text-red-300">Admin data is unavailable.</p>
        <button
          className="mt-3 inline-flex rounded-md border border-zinc-500 px-3 py-1 text-sm hover:border-zinc-300"
          onClick={reload}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  const handleRefreshAssets = async () => {
    if (isRefreshingAssets) return
    setIsRefreshingAssets(true)
    setRefreshMessage(null)

    const result = await refreshAssetsAction()
    setIsRefreshingAssets(false)
    setRefreshMessage(result.message ?? (result.status === 'success' ? 'Assets refreshed.' : null))
    if (result.status === 'success') {
      reload()
    }
  }

  return (
    <>
      <section className="space-y-6">
        <CommissionManager
          characters={payload.characters}
          creatorAliases={payload.creatorAliases}
          commissionSearchRows={payload.commissionSearchRows}
        />
      </section>

      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
        {refreshMessage ? (
          <p className="rounded-md bg-gray-950/90 px-3 py-1.5 text-xs text-gray-100 shadow-md">
            {refreshMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleRefreshAssets}
          disabled={isRefreshingAssets}
          className="inline-flex h-11 items-center rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 shadow-lg transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-500 dark:hover:bg-gray-800"
        >
          {isRefreshingAssets ? 'Refreshing…' : 'Refresh Assets Cache'}
        </button>
      </div>
    </>
  )
}

export default AdminEditIsland
