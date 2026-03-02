import Commission from '#components/home/commission'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import CommissionDescription from '#components/home/blocks/Description'
import Footer from '#components/home/blocks/Footer'

import CommissionSearchDeferred from '#components/home/search/CommissionSearchDeferred'
import DevLiveRefresh from '#components/home/dev/DevLiveRefresh'

import NotFoundPage from '#components/shared/NotFoundPage'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
} from '#components/ui/sidebar'
import { Skeleton } from '#components/ui/skeleton'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { buildCommissionDataMap, buildCreatorAliasesMap, type SitePayload } from '#lib/sitePayload'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

const CharacterList = lazy(() => import('#components/home/nav/CharacterList'))
const Hamburger = lazy(() => import('#components/home/nav/Hamburger'))
const Warning = lazy(() => import('#components/home/warning/Warning'))

const SITE_PAYLOAD_URL = '/data/site-payload.json'
const DEFAULT_CHARACTER_LIST_SKELETON_COUNT = 12
const CHARACTER_LIST_SKELETON_WIDTHS = [6.5, 7.5, 6, 8, 6.75, 7.25] as const
const CHARACTER_LIST_SIDEBAR_CLASSES =
  'md:top-52 md:left-[calc(50%+22rem)] md:h-screen md:w-full md:max-w-50 lg:fixed'
const CHARACTER_LIST_UTILITY_ROW_CLASSES =
  'relative flex min-h-5 items-center pl-4 text-gray-700 dark:text-gray-200'

const CharacterListSkeleton = ({
  navItemCount = DEFAULT_CHARACTER_LIST_SKELETON_COUNT,
}: {
  navItemCount?: number
}) => {
  const resolvedNavItemCount = Math.max(DEFAULT_CHARACTER_LIST_SKELETON_COUNT, navItemCount)
  const showAdminPlaceholder = import.meta.env.DEV

  return (
    <Sidebar
      id="Character List Skeleton"
      aria-hidden="true"
      className={CHARACTER_LIST_SIDEBAR_CLASSES}
    >
      <SidebarContent className="sticky top-4 ml-8 space-y-2">
        <SidebarGroup className="space-y-4 pb-2">
          <SidebarMenuItem className={CHARACTER_LIST_UTILITY_ROW_CLASSES}>
            <Skeleton className="h-4 w-14" />
          </SidebarMenuItem>

          <div className="space-y-2">
            <div className={CHARACTER_LIST_UTILITY_ROW_CLASSES}>
              <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-300/80 dark:bg-gray-700/80" />
              <Skeleton className="h-4 w-23" />
            </div>
            <div className={CHARACTER_LIST_UTILITY_ROW_CLASSES}>
              <Skeleton className="h-4 w-16" />
            </div>
          </div>

          {showAdminPlaceholder ? (
            <SidebarMenuItem className={CHARACTER_LIST_UTILITY_ROW_CLASSES}>
              <Skeleton className="h-4 w-12" />
            </SidebarMenuItem>
          ) : null}
        </SidebarGroup>

        <nav>
          <SidebarMenu>
            {Array.from({ length: resolvedNavItemCount }).map((_, index) => (
              <SidebarMenuItem
                key={`character-nav-skeleton-${index}`}
                className="relative min-h-5 pl-4 text-gray-700 dark:text-gray-200"
              >
                <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-300/60 dark:bg-gray-700/60" />
                <Skeleton
                  className="h-4 rounded-sm"
                  style={{
                    width: `${CHARACTER_LIST_SKELETON_WIDTHS[index % CHARACTER_LIST_SKELETON_WIDTHS.length]}rem`,
                  }}
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}

const HomePageSkeleton = () => {
  return (
    <div className="relative mx-auto flex min-h-[1850px] justify-center md:min-h-[2100px]">
      <div id="Main Contents" className="w-full max-w-160">
        <div className="mb-2 h-10 md:h-14">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
        <div className="min-h-[330px] md:min-h-[380px]" />
        <section className="mt-8 mb-6 h-12">
          <Skeleton className="h-11 w-full rounded-none" />
        </section>
        <div className="mb-6 flex h-10 items-center gap-2">
          <Skeleton className="h-full w-28 rounded-lg" />
          <Skeleton className="h-full w-28 rounded-lg" />
        </div>
        <div className="min-h-[1050px] space-y-8 md:min-h-[1280px]">
          <div>
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
          <div>
            <Skeleton className="aspect-1280/525 w-full" />
          </div>
          <div>
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
          <Suspense
            fallback={
              <CharacterListSkeleton
                navItemCount={Math.max(computed.characters.length, computed.monthNavItems.length)}
              />
            }
          >
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
