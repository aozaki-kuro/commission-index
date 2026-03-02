import Commission from '#components/home/commission'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import CommissionDescription from '#components/home/blocks/Description'
import Footer from '#components/home/blocks/Footer'

import CommissionSearchDeferred from '#components/home/search/CommissionSearchDeferred'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'

import NotFoundPage from '#components/shared/NotFoundPage'
import { Skeleton } from '#components/ui/skeleton'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { buildCommissionDataMap, buildCreatorAliasesMap, type SitePayload } from '#lib/sitePayload'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

const CharacterList = lazy(() => import('#components/home/nav/CharacterList'))
const Hamburger = lazy(() => import('#components/home/nav/Hamburger'))
const Warning = lazy(() => import('#components/home/warning/Warning'))

const SITE_PAYLOAD_URL = '/data/site-payload.json'

const CharacterListSkeleton = () => {
  return (
    <aside className="hidden lg:fixed lg:top-52 lg:left-[calc(50%+22rem)] lg:block lg:h-screen lg:w-full lg:max-w-50">
      <div className="sticky top-4 ml-8 space-y-3 pt-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-28" />
      </div>
    </aside>
  )
}

const HomePageSkeleton = () => {
  return (
    <div className="relative mx-auto flex min-h-[1850px] justify-center md:min-h-[2100px]">
      <div id="Main Contents" className="w-full max-w-160">
        <div className="mb-2 h-10 md:h-14">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
        <div className="min-h-[330px] space-y-4 md:min-h-[380px]">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-full md:w-11/12" />
          <Skeleton className="h-5 w-full md:w-10/12" />
          <Skeleton className="h-5 w-full md:w-10/12" />
          <Skeleton className="h-5 w-full md:w-11/12" />
          <Skeleton className="h-5 w-full md:w-9/12" />
        </div>
        <section className="mt-8 mb-6 h-12">
          <Skeleton className="h-11 w-full rounded-none" />
        </section>
        <div className="mb-6 flex h-10 items-center gap-2">
          <Skeleton className="h-full w-28 rounded-lg" />
          <Skeleton className="h-full w-28 rounded-lg" />
        </div>
        <div className="min-h-[1050px] space-y-8 md:min-h-[1280px]">
          <div className="space-y-3">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
        </div>
      </div>
      <CharacterListSkeleton />
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
        <Suspense fallback={<div className="h-0" />}>
          <Warning />
        </Suspense>
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
          <Suspense fallback={<CharacterListSkeleton />}>
            <CharacterList
              characters={computed.characters}
              monthNavItems={computed.monthNavItems}
            />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <Hamburger
            active={payload.characterStatus.active}
            stale={payload.characterStatus.stale}
            timelineNavItems={computed.monthNavItems}
          />
        </Suspense>
        {import.meta.env.DEV ? <DevLiveRefresh /> : null}
      </>
    </CommissionViewModeProvider>
  )
}

export default Home
