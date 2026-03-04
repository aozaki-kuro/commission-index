import { useEffect, useState } from 'react'
import type { CreatorAliasRow } from '#lib/admin/db'
import { fetchAdminBootstrapWithRetry } from '#admin/bootstrapFetch'
import AliasesDashboard from '#admin/aliases/AliasesDashboard'

type BootstrapPayload = {
  creatorAliases: CreatorAliasRow[]
}

interface AliasesDashboardIslandProps {
  initialPayload?: BootstrapPayload | null
}

const AliasesDashboardIsland = ({ initialPayload = null }: AliasesDashboardIslandProps) => {
  const [payload, setPayload] = useState<BootstrapPayload | null>(initialPayload)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!import.meta.env?.DEV) return

    let active = true
    const controller = new AbortController()

    const loadData = async () => {
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
        const message = error instanceof Error ? error.message : 'Failed to load aliases data.'
        setErrorMessage(message)
      }
    }

    void loadData()
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadToken])

  if (!payload && errorMessage) {
    return (
      <div>
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
    return <p>Loading aliases data...</p>
  }

  return <AliasesDashboard creators={payload.creatorAliases} />
}

export default AliasesDashboardIsland
