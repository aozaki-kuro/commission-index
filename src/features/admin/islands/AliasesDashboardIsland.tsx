import type { CreatorAliasRow } from '#lib/admin/db'
import AliasesDashboard from '#admin/aliases/AliasesDashboard'
import { useAdminBootstrap } from '#admin/hooks/useAdminBootstrap'

type BootstrapPayload = {
  creatorAliases: CreatorAliasRow[]
}

interface AliasesDashboardIslandProps {
  initialPayload?: BootstrapPayload | null
}

const AliasesDashboardIsland = ({ initialPayload = null }: AliasesDashboardIslandProps) => {
  const { payload, errorMessage, isLoading, reload } = useAdminBootstrap<BootstrapPayload>({
    initialPayload,
    errorFallback: 'Failed to load aliases data.',
  })

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
    return <p>Loading aliases data...</p>
  }

  if (!payload) {
    return null
  }

  return <AliasesDashboard creators={payload.creatorAliases} />
}

export default AliasesDashboardIsland
