import type { CharacterAliasRow, CreatorAliasRow, KeywordAliasRow } from '#lib/admin/db'
import AliasesDashboard from '#admin/aliases/AliasesDashboard'
import { useAdminBootstrap } from '#admin/hooks/useAdminBootstrap'

type BootstrapPayload = {
  characterAliases: CharacterAliasRow[]
  creatorAliases: CreatorAliasRow[]
  keywordAliases: KeywordAliasRow[]
}

interface AliasesDashboardIslandProps {
  initialPayload?: BootstrapPayload | null
}

const AliasesDashboardIsland = ({ initialPayload = null }: AliasesDashboardIslandProps) => {
  const { payload, errorMessage, isLoading, reload } = useAdminBootstrap<BootstrapPayload>({
    initialPayload,
    errorFallback: 'Failed to load aliases data.',
    endpoint: '/api/admin/aliases/bootstrap',
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

  return (
    <AliasesDashboard
      characters={payload.characterAliases}
      creators={payload.creatorAliases}
      keywords={payload.keywordAliases}
    />
  )
}

export default AliasesDashboardIsland
