import type { HomeSuggestionAdminData } from '#lib/admin/db'
import SuggestionDashboard from '#admin/suggestion/SuggestionDashboard'

interface AdminSuggestionIslandProps {
  initialPayload: HomeSuggestionAdminData
}

function AdminSuggestionIsland({ initialPayload }: AdminSuggestionIslandProps) {
  return (
    <SuggestionDashboard
      featuredKeywords={initialPayload.featuredKeywords}
      keywordOptions={initialPayload.keywordOptions}
    />
  )
}

export default AdminSuggestionIsland
