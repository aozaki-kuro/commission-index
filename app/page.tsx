import type { NextPage } from 'next'

// Main content
import Commission from '#components/commission'
import CommissionDescription from '#components/main/Description'
import Footer from '#components/main/Footer'

import CharacterList from '#components/main/CharacterList'
import CommissionSearch from '#components/main/CommissionSearch'
import DevLiveRefresh from '#components/main/DevLiveRefresh'

import Hamburger from '#components/main/Hamburger'
import Warning from '#components/main/Warning'
import { getCommissionDataMap } from '#data/commissionData'
import { getCharacterStatus } from '#lib/characterStatus'

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
