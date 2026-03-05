import { useEffect, useState } from 'react'
import { refreshAssetsAction } from '#admin/actions'
import AdminDashboard from '#admin/AdminDashboard'
import { useAdminBootstrap } from '#admin/hooks/useAdminBootstrap'
import type { AdminBootstrapData } from '#lib/admin/db'

interface AdminDashboardIslandProps {
  initialPayload?: AdminBootstrapData | null
}

const AdminDashboardIsland = ({ initialPayload = null }: AdminDashboardIslandProps) => {
  const { payload, errorMessage, isLoading, reload } = useAdminBootstrap<AdminBootstrapData>({
    initialPayload,
    errorFallback: 'Failed to load admin data.',
    subscribeUpdates: true,
  })
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!refreshMessage) return
    const timer = window.setTimeout(() => setRefreshMessage(null), 2400)
    return () => window.clearTimeout(timer)
  }, [refreshMessage])

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
    return null
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
      <AdminDashboard
        characters={payload.characters}
        creatorAliases={payload.creatorAliases}
        commissionSearchRows={payload.commissionSearchRows}
      />

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

export default AdminDashboardIsland
