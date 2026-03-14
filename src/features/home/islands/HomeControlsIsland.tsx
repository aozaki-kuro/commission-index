import type { SearchSuggestionAliasGroup } from '#features/home/search/CommissionSearch'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'

interface HomeControlsIslandProps {
  locale?: string
  featuredSearchKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

function HomeControlsIsland({
  locale,
  featuredSearchKeywords = [],
  suggestionAliasGroups = [],
}: HomeControlsIslandProps) {
  return (
    <CommissionSearchDeferred
      locale={locale}
      featuredKeywords={featuredSearchKeywords}
      suggestionAliasGroups={suggestionAliasGroups}
    />
  )
}

export default HomeControlsIsland
