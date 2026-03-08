import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import type { SearchSuggestionAliasGroup } from '#features/home/search/CommissionSearch'

interface HomeControlsIslandProps {
  locale?: string
  featuredSearchKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

const HomeControlsIsland = ({
  locale,
  featuredSearchKeywords = [],
  suggestionAliasGroups = [],
}: HomeControlsIslandProps) => {
  return (
    <CommissionSearchDeferred
      locale={locale}
      featuredKeywords={featuredSearchKeywords}
      suggestionAliasGroups={suggestionAliasGroups}
    />
  )
}

export default HomeControlsIsland
