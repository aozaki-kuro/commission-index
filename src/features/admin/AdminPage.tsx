import AdminDashboard from './AdminDashboard'
import NotFoundPage from '#components/shared/NotFoundPage'
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

  return (
    <AdminDashboard
      characters={payload.characters}
      creatorAliases={payload.creatorAliases}
      commissionSearchRows={payload.commissionSearchRows}
    />
  )
}

export default AdminPage
