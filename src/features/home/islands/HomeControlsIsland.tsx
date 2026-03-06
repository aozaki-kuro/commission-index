import { Suspense, lazy } from 'react'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import type { CharacterNavItem } from '#lib/characters/nav'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import { HomeLocaleProvider, type HomeLocaleOption } from '#features/home/i18n/HomeLocaleContext'
import type { SearchSuggestionAliasGroup } from '#features/home/search/CommissionSearch'

const Hamburger = lazy(() => import('#features/home/nav/Hamburger'))

type CharacterDisplay = {
  DisplayName: string
}

interface HomeControlsIslandProps {
  locale?: string
  localeOptions?: HomeLocaleOption[]
  featuredSearchKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
  monthNavItems: CharacterNavItem[]
}

const HomeControlsIsland = ({
  locale,
  localeOptions,
  featuredSearchKeywords = [],
  suggestionAliasGroups = [],
  active,
  stale,
  monthNavItems,
}: HomeControlsIslandProps) => {
  return (
    <HomeLocaleProvider locale={locale} options={localeOptions}>
      <CommissionViewModeProvider>
        <CommissionSearchDeferred
          featuredKeywords={featuredSearchKeywords}
          suggestionAliasGroups={suggestionAliasGroups}
        />
        <Suspense fallback={null}>
          <Hamburger active={active} stale={stale} timelineNavItems={monthNavItems} />
        </Suspense>
      </CommissionViewModeProvider>
    </HomeLocaleProvider>
  )
}

export default HomeControlsIsland
