import { Suspense, lazy } from 'react'
import {
  CommissionViewModeProvider,
  CommissionViewTabs,
} from '#features/home/commission/CommissionViewMode'
import CommissionViewModeDomSync from '#features/home/commission/CommissionViewModeDomSync'
import CommissionImageNoticeGate from '#features/home/commission/CommissionImageNoticeGate'
import DevLiveRefresh from '#features/home/dev/DevLiveRefresh'
import type { CharacterNavItem } from '#lib/characters/nav'
import CommissionSearchDeferred from '#features/home/search/CommissionSearchDeferred'

const CharacterList = lazy(() => import('#features/home/nav/CharacterList'))
const Hamburger = lazy(() => import('#features/home/nav/Hamburger'))

type CharacterDisplay = {
  DisplayName: string
}

interface HomeControlsIslandProps {
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
  monthNavItems: CharacterNavItem[]
}

const isDevEnvironment = Boolean(import.meta.env?.DEV)

const HomeControlsIsland = ({ active, stale, monthNavItems }: HomeControlsIslandProps) => {
  const characters = [...active, ...stale]

  return (
    <CommissionViewModeProvider>
      <CommissionSearchDeferred />
      <CommissionViewTabs />
      <CommissionViewModeDomSync />
      <CommissionImageNoticeGate />

      <Suspense fallback={null}>
        <CharacterList characters={characters} monthNavItems={monthNavItems} />
      </Suspense>
      <Suspense fallback={null}>
        <Hamburger active={active} stale={stale} timelineNavItems={monthNavItems} />
      </Suspense>

      {isDevEnvironment ? <DevLiveRefresh /> : null}
    </CommissionViewModeProvider>
  )
}

export default HomeControlsIsland
