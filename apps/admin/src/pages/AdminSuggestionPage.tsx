import type { HomeSuggestionAdminData } from '@commission-index/domain'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { AdminSuggestionDashboard } from '../components/AdminSuggestionDashboard'
import { useAdminResource } from '../hooks/useAdminResource'

const emptyKeywords: string[] = []

const suggestionCacheKey = '/api/admin/suggestion'

export function AdminSuggestionPage() {
  const [state, reload] = useAdminResource<HomeSuggestionAdminData>(suggestionCacheKey, 'Failed to load suggestion data.')

  return (
    <>
      <AdminBootstrapStatus
        errorMessage={state.errorMessage}
        isLoading={state.isLoading}
        hasPayload={state.payload !== null}
        onRetry={reload}
      />
      <AdminSuggestionDashboard
        featuredKeywords={state.payload?.featuredKeywords ?? emptyKeywords}
        keywordOptions={state.payload?.keywordOptions ?? emptyKeywords}
        isReady={state.payload !== null}
        isLoading={state.isLoading}
      />
    </>
  )
}
