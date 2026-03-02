import Commission from '#components/home/commission'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import CommissionDescription from '#components/home/blocks/Description'
import Footer from '#components/home/blocks/Footer'

import CharacterList from '#components/home/nav/CharacterList'
import CommissionSearchDeferred from '#components/home/search/CommissionSearchDeferred'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'

import Hamburger from '#components/home/nav/Hamburger'
import Warning from '#components/home/warning/Warning'
import NotFoundPage from '#components/shared/NotFoundPage'
import { Skeleton } from '#components/ui/skeleton'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { buildCommissionDataMap, buildCreatorAliasesMap, type SitePayload } from '#lib/sitePayload'
import { useEffect, useMemo, useState } from 'react'

const SITE_PAYLOAD_URL = '/data/site-payload.json'

const HomePageSkeleton = () => {
  return (
    <div className="relative mx-auto flex justify-center">
      <div id="Main Contents" className="w-full max-w-160">
        <div className="space-y-4">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <section className="mt-8 mb-6 h-12">
          <Skeleton className="h-11 w-full rounded-none" />
        </section>
        <div className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
        </div>
      </div>
      <aside className="hidden xl:block xl:w-[260px] xl:pl-7">
        <div className="space-y-3 pt-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-36" />
        </div>
      </aside>
    </div>
  )
}

const Home = () => {
  useDocumentTitle()
  const [payload, setPayload] = useState<SitePayload | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadPayload = async () => {
      try {
        const response = await fetch(SITE_PAYLOAD_URL)
        if (!response.ok) throw new Error(`Failed to load site payload: ${response.status}`)

        const data = (await response.json()) as SitePayload
        if (isMounted) {
          setPayload(data)
          setHasError(false)
        }
      } catch {
        if (isMounted) setHasError(true)
      }
    }

    void loadPayload()
    return () => {
      isMounted = false
    }
  }, [])

  const computed = useMemo(() => {
    if (!payload) return null

    const commissionMap = buildCommissionDataMap(payload.commissionData)
    const creatorAliasesMap = buildCreatorAliasesMap(payload.creatorAliases)
    const { groups: timelineGroups, navItems: monthNavItems } =
      buildCommissionTimeline(commissionMap)
    const characters = [...payload.characterStatus.active, ...payload.characterStatus.stale]

    return {
      commissionMap,
      creatorAliasesMap,
      timelineGroups,
      monthNavItems,
      characters,
      activeCharacterNames: payload.characterStatus.active.map(item => item.DisplayName),
    }
  }, [payload])

  if (hasError) {
    return <NotFoundPage />
  }

  if (!payload || !computed) {
    return <HomePageSkeleton />
  }

  return (
    <CommissionViewModeProvider>
      <>
        <Warning />
        <div className="relative mx-auto flex justify-center">
          <div id="Main Contents" className="w-full max-w-160">
            <CommissionDescription
              commissionData={payload.commissionData}
              activeCharacters={computed.activeCharacterNames}
            />
            <CommissionSearchDeferred />
            <Commission
              activeChars={payload.characterStatus.active}
              staleChars={payload.characterStatus.stale}
              commissionMap={computed.commissionMap}
              creatorAliasesMap={computed.creatorAliasesMap}
              timelineGroups={computed.timelineGroups}
            />
            <Footer />
          </div>
          <CharacterList characters={computed.characters} monthNavItems={computed.monthNavItems} />
        </div>
        <Hamburger
          active={payload.characterStatus.active}
          stale={payload.characterStatus.stale}
          timelineNavItems={computed.monthNavItems}
        />
        {import.meta.env.DEV ? <DevLiveRefresh /> : null}
      </>
    </CommissionViewModeProvider>
  )
}

export default Home
