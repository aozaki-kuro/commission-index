import Commission from '#components/home/commission'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import Footer from '#components/home/blocks/Footer'
import CommissionSearchDeferred from '#components/home/search/CommissionSearchDeferred'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'
import { buildCommissionDataMap, buildCreatorAliasesMap, type SitePayload } from '#lib/sitePayload'
import { Suspense, lazy, useMemo } from 'react'

const CharacterList = lazy(() => import('#components/home/nav/CharacterList'))
const Hamburger = lazy(() => import('#components/home/nav/Hamburger'))

const isDevEnvironment = Boolean(import.meta.env?.DEV)

const HomeInteractiveIsland = ({ payload }: { payload: SitePayload }) => {
  const computed = useMemo(() => {
    const commissionMap = buildCommissionDataMap(payload.commissionData)
    const creatorAliasesMap = buildCreatorAliasesMap(payload.creatorAliases)
    const characters = [...payload.characterStatus.active, ...payload.characterStatus.stale]

    return {
      commissionMap,
      creatorAliasesMap,
      characters,
    }
  }, [payload])

  return (
    <CommissionViewModeProvider>
      <>
        <div className="relative mx-auto flex justify-center">
          <div id="Main Contents" className="w-full max-w-160">
            <CommissionSearchDeferred />
            <Commission
              activeChars={payload.characterStatus.active}
              staleChars={payload.characterStatus.stale}
              commissionMap={computed.commissionMap}
              creatorAliasesMap={computed.creatorAliasesMap}
              timelineGroups={payload.timelineGroups}
            />
            <Footer />
          </div>
          <Suspense fallback={<div className="hidden md:block md:w-50" />}>
            <CharacterList characters={computed.characters} monthNavItems={payload.monthNavItems} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <Hamburger
            active={payload.characterStatus.active}
            stale={payload.characterStatus.stale}
            timelineNavItems={payload.monthNavItems}
          />
        </Suspense>
        {isDevEnvironment ? <DevLiveRefresh /> : null}
      </>
    </CommissionViewModeProvider>
  )
}

export default HomeInteractiveIsland
