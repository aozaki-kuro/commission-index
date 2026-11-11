import type { AdminBootstrapData, CharacterRow } from '@commission-index/domain'
import { useEffect } from 'react'
import { AdminCreateDashboard } from '../components/AdminCreateDashboard'
import { useAdminResource } from '../hooks/useAdminResource'
import { subscribeToDataUpdates } from '../lib/dataUpdateSignal'

const bootstrapCacheKey = '/api/admin/bootstrap'
const emptyCharacters: CharacterRow[] = []

export function AdminCreatePage() {
  const [state, reload] = useAdminResource<AdminBootstrapData>(bootstrapCacheKey, 'Failed to load admin data.')

  useEffect(() => subscribeToDataUpdates(reload), [reload])

  return (
    <AdminCreateDashboard
      characters={state.payload?.characters ?? emptyCharacters}
      commissionSearchRows={state.payload?.commissionSearchRows ?? []}
      creatorAliases={state.payload?.creatorAliases ?? []}
      errorMessage={state.errorMessage}
      isLoading={state.isLoading}
      hasPayload={state.payload !== null}
      onRetry={reload}
    />
  )
}
