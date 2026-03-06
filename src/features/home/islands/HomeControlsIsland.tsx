import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import { HomeLocaleProvider } from '#features/home/i18n/HomeLocaleContext'
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
    <HomeLocaleProvider locale={locale}>
      <CommissionViewModeProvider>
        <CommissionSearchDeferred
          featuredKeywords={featuredSearchKeywords}
          suggestionAliasGroups={suggestionAliasGroups}
        />
      </CommissionViewModeProvider>
    </HomeLocaleProvider>
  )
}

export default HomeControlsIsland
