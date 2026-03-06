import { Suspense, lazy } from 'react'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import type { CharacterNavItem } from '#lib/characters/nav'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import { HomeLocaleProvider, type HomeLocaleOption } from '#features/home/i18n/HomeLocaleContext'

const Hamburger = lazy(() => import('#features/home/nav/Hamburger'))

type CharacterDisplay = {
  DisplayName: string
}

interface HomeControlsIslandProps {
  locale?: string
  localeOptions?: HomeLocaleOption[]
  featuredSearchKeywords?: string[]
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
  monthNavItems: CharacterNavItem[]
}

const HomeControlsIsland = ({
  locale,
  localeOptions,
  featuredSearchKeywords = [],
  active,
  stale,
  monthNavItems,
}: HomeControlsIslandProps) => {
  return (
    <HomeLocaleProvider locale={locale} options={localeOptions}>
      <CommissionViewModeProvider>
        <CommissionSearchDeferred featuredKeywords={featuredSearchKeywords} />
        <Suspense fallback={null}>
          <Hamburger active={active} stale={stale} timelineNavItems={monthNavItems} />
        </Suspense>
      </CommissionViewModeProvider>
    </HomeLocaleProvider>
  )
}

export default HomeControlsIsland
