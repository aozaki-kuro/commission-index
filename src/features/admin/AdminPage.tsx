import AdminDashboard from './AdminDashboard'
import NotFoundPage from '#components/shared/NotFoundPage'
import { refreshAssetsAction } from '#admin/actions'
import type { AdminCommissionSearchRow, CharacterRow, CreatorAliasRow } from '#lib/admin/db'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { useEffect, useState } from 'react'
import { fetchAdminBootstrapWithRetry } from './bootstrapFetch'
import { subscribeToDataUpdates } from './dataUpdateSignal'

type BootstrapPayload = {
  characters: CharacterRow[]
  creatorAliases: CreatorAliasRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
}

interface AdminPageProps {
  initialPayload?: BootstrapPayload | null
}

const AdminPage = ({ initialPayload = null }: AdminPageProps) => {
  useDocumentTitle('Admin')

  const [payload, setPayload] = useState<BootstrapPayload | null>(initialPayload)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!refreshMessage) return
    const timer = window.setTimeout(() => setRefreshMessage(null), 2400)
    return () => window.clearTimeout(timer)
  }, [refreshMessage])

  useEffect(() => {
    if (!import.meta.env?.DEV) return

    let active = true
    let controller: AbortController | null = null

    const loadData = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const data = await fetchAdminBootstrapWithRetry<BootstrapPayload>({
          signal: controller.signal,
        })
        if (active) {
          setPayload(data)
          setErrorMessage(null)
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Failed to load admin data.'
        setErrorMessage(message)
      }
    }

    void loadData()

    const unsubscribe = subscribeToDataUpdates(() => {
      void loadData()
    })

    return () => {
      active = false
      controller?.abort()
      unsubscribe()
    }
  }, [reloadToken])

  if (!import.meta.env?.DEV) {
    return <NotFoundPage />
  }

  if (!payload && errorMessage) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 lg:px-0">
        <p className="text-sm text-red-300">{errorMessage}</p>
        <button
          className="mt-3 inline-flex rounded-md border border-zinc-500 px-3 py-1 text-sm hover:border-zinc-300"
          onClick={() => {
            setErrorMessage(null)
            setReloadToken(token => token + 1)
          }}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 lg:px-0">
        <p>Loading admin data...</p>
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
      setReloadToken(token => token + 1)
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

export default AdminPage
