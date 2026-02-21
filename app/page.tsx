import type { NextPage } from 'next'

// Main content
import Commission from '#components/home/commission'
import CommissionDescription from '#components/home/blocks/Description'
import Footer from '#components/home/blocks/Footer'

import CharacterList from '#components/home/nav/CharacterList'
import CommissionSearch from '#components/home/search/CommissionSearch'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'

import Hamburger from '#components/home/nav/Hamburger'
import Warning from '#components/home/warning/Warning'
import { getCommissionDataMap } from '#data/commissionData'
import { getCharacterStatus } from '#lib/characters/status'

const Home: NextPage = () => {
  const status = getCharacterStatus()
  const commissionMap = getCommissionDataMap()
  const characters = [...status.active, ...status.stale]

  return (
    <>
      <Warning />
      <div className="relative mx-auto flex justify-center">
        <div id="Main Contents" className="w-full max-w-160">
          <CommissionDescription />
          <CommissionSearch />
          <Commission
            activeChars={status.active}
            staleChars={status.stale}
            commissionMap={commissionMap}
          />
          <Footer />
        </div>
        <CharacterList characters={characters} />
      </div>
      <Hamburger active={status.active} stale={status.stale} />
      {process.env.NODE_ENV === 'development' ? <DevLiveRefresh /> : null}
    </>
  )
}

export default Home
