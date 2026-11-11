import type { AdminAliasesData } from '@commission-index/domain'
import { useEffect } from 'react'
import { AdminAliasesDashboard } from '../components/AdminAliasesDashboard'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { useAdminResource } from '../hooks/useAdminResource'
import { subscribeToDataUpdates } from '../lib/dataUpdateSignal'

const aliasesCacheKey = '/api/admin/aliases/bootstrap'
const emptyAliases: AdminAliasesData = { characterAliases: [], creatorAliases: [], keywordAliases: [] }

export function AdminAliasesPage() {
  const [state, refreshData] = useAdminResource<AdminAliasesData>(aliasesCacheKey, 'Failed to load alias data.')

  useEffect(() => subscribeToDataUpdates(refreshData), [refreshData])

  const payload = state.payload ?? emptyAliases
  return (
    <>
      <AdminBootstrapStatus errorMessage={state.errorMessage} isLoading={state.isLoading} hasPayload={state.payload !== null} onRetry={refreshData} />
      <AdminAliasesDashboard
        characters={payload.characterAliases}
        creators={payload.creatorAliases}
        keywords={payload.keywordAliases}
        isLoading={!state.payload && state.isLoading}
        isUnavailable={!state.payload && Boolean(state.errorMessage)}
        onSaved={refreshData}
      />
    </>
  )
}
