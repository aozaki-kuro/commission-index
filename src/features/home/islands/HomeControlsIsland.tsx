import { Suspense, lazy } from 'react'
import {
  CommissionViewModeProvider,
  CommissionViewTabs,
} from '#features/home/commission/CommissionViewMode'
import type { CharacterNavItem } from '#lib/characters/nav'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'
import { HomeLocaleProvider, type HomeLocaleOption } from '#features/home/i18n/HomeLocaleContext'

const CharacterList = lazy(() => import('#features/home/nav/CharacterList'))
const Hamburger = lazy(() => import('#features/home/nav/Hamburger'))

type CharacterDisplay = {
  DisplayName: string
}

interface HomeControlsIslandProps {
  locale?: string
  localeOptions?: HomeLocaleOption[]
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
  monthNavItems: CharacterNavItem[]
}

const HomeControlsIsland = ({
  locale,
  localeOptions,
  active,
  stale,
  monthNavItems,
}: HomeControlsIslandProps) => {
  const characters = [...active, ...stale]

  return (
    <HomeLocaleProvider locale={locale} options={localeOptions}>
      <CommissionViewModeProvider>
        <CommissionSearchDeferred />
        <CommissionViewTabs />

        <Suspense fallback={null}>
          <CharacterList characters={characters} monthNavItems={monthNavItems} />
        </Suspense>
        <Suspense fallback={null}>
          <Hamburger active={active} stale={stale} timelineNavItems={monthNavItems} />
        </Suspense>
      </CommissionViewModeProvider>
    </HomeLocaleProvider>
  )
}

export default HomeControlsIsland
