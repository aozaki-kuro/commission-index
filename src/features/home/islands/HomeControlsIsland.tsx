import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import { HomeLocaleProvider, type HomeLocaleOption } from '#features/home/i18n/HomeLocaleContext'
import type { SearchSuggestionAliasGroup } from '#features/home/search/CommissionSearch'

interface HomeControlsIslandProps {
  locale?: string
  localeOptions?: HomeLocaleOption[]
  featuredSearchKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

const HomeControlsIsland = ({
  locale,
  localeOptions,
  featuredSearchKeywords = [],
  suggestionAliasGroups = [],
}: HomeControlsIslandProps) => {
  return (
    <HomeLocaleProvider locale={locale} options={localeOptions}>
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
