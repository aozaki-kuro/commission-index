// Main content
import Commission from '#components/home/commission'
import {
  CommissionViewModeProvider,
  parseCommissionViewModeFromQueryValue,
} from '#components/home/commission/CommissionViewMode'
import CommissionDescription from '#components/home/blocks/Description'
import Footer from '#components/home/blocks/Footer'

import CharacterList from '#components/home/nav/CharacterList'
import CommissionSearchDeferred from '#components/home/search/CommissionSearchDeferred'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'

import Hamburger from '#components/home/nav/Hamburger'
import Warning from '#components/home/warning/Warning'
import { getCommissionDataMap } from '#data/commissionData'
import { getCharacterStatus } from '#lib/characters/status'
import { buildCommissionTimeline } from '#lib/commissions/timeline'

interface HomePageProps {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>
}

const Home = async ({ searchParams }: HomePageProps) => {
  const resolvedSearchParams = (await Promise.resolve(searchParams)) ?? {}
  const initialViewMode = parseCommissionViewModeFromQueryValue(resolvedSearchParams.view)
  const status = getCharacterStatus()
  const commissionMap = getCommissionDataMap()
  const characters = [...status.active, ...status.stale]
  const { groups: timelineGroups, navItems: monthNavItems } = buildCommissionTimeline(commissionMap)

  return (
    <CommissionViewModeProvider initialMode={initialViewMode}>
      <>
        <Warning />
        <div className="relative mx-auto flex justify-center">
          <div id="Main Contents" className="w-full max-w-160">
            <CommissionDescription />
            <CommissionSearchDeferred />
            <Commission
              activeChars={status.active}
              staleChars={status.stale}
              commissionMap={commissionMap}
              timelineGroups={timelineGroups}
            />
            <Footer />
          </div>
          <CharacterList characters={characters} monthNavItems={monthNavItems} />
        </div>
        <Hamburger active={status.active} stale={status.stale} />
        {process.env.NODE_ENV === 'development' ? <DevLiveRefresh /> : null}
      </>
    </CommissionViewModeProvider>
  )
}

export default Home
