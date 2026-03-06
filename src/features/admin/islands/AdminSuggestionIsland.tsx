import SuggestionDashboard from '#admin/suggestion/SuggestionDashboard'
import type { HomeSuggestionAdminData } from '#lib/admin/db'

interface AdminSuggestionIslandProps {
  initialPayload: HomeSuggestionAdminData
}

const AdminSuggestionIsland = ({ initialPayload }: AdminSuggestionIslandProps) => {
  return (
    <SuggestionDashboard
      featuredKeywords={initialPayload.featuredKeywords}
      keywordOptions={initialPayload.keywordOptions}
    />
  )
}

export default AdminSuggestionIsland
