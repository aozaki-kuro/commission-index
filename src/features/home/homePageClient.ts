import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { mountActiveCharactersLoader } from '#features/home/commission/activeCharactersLoader'
import { mountCommissionViewModeDomSync } from '#features/home/commission/commissionViewModeDomSync'
import { mountMobileViewModeTabs } from '#features/home/commission/mobileViewModeTabs'
import { mountStaleCharactersLoader } from '#features/home/commission/staleCharactersLoader'
import { mountTimelineViewLoader } from '#features/home/commission/timelineViewLoader'
import { mountUnpublishedInterestButtons } from '#features/home/commission/unpublishedInterestClient'
import { mountHomeScrollRestore } from '#features/home/homeScrollRestore'
import { mountSidebarNavEnhancer } from '#features/home/nav/sidebarNavEnhancer'
import { mountMobileHamburgerMenu } from '#features/home/nav/hamburger/mobileHamburgerMenu'
import { mountMobileLanguageMenu } from '#features/home/nav/hamburger/mobileLanguageMenu'

type Cleanup = () => void

type HomePageClientDeps = {
  mountCommissionViewModeDomSync: () => Cleanup
  mountActiveCharactersLoader: () => Cleanup
  mountStaleCharactersLoader: () => Cleanup
  mountTimelineViewLoader: () => Cleanup
  mountHomeScrollRestore: () => Cleanup
  mountSidebarNavEnhancer: () => Cleanup
  mountMobileHamburgerMenu: () => Cleanup
  mountMobileLanguageMenu: () => Cleanup
  mountMobileViewModeTabs: () => Cleanup
  mountUnpublishedInterestButtons: () => Cleanup
}

type MountHomePageClientOptions = {
  deps?: Partial<HomePageClientDeps>
}

const defaultDeps: HomePageClientDeps = {
  mountCommissionViewModeDomSync: () => mountCommissionViewModeDomSync(),
  mountActiveCharactersLoader: () => mountActiveCharactersLoader(),
  mountStaleCharactersLoader: () => mountStaleCharactersLoader(),
  mountTimelineViewLoader: () => mountTimelineViewLoader(),
  mountHomeScrollRestore: () => mountHomeScrollRestore(),
  mountSidebarNavEnhancer: () => mountSidebarNavEnhancer(),
  mountMobileHamburgerMenu: () => mountMobileHamburgerMenu(),
  mountMobileLanguageMenu: () => mountMobileLanguageMenu(),
  mountMobileViewModeTabs: () => mountMobileViewModeTabs(),
  mountUnpublishedInterestButtons: () =>
    mountUnpublishedInterestButtons({
      trackEvent: properties => {
        trackRybbitEvent(ANALYTICS_EVENTS.iWantToSeeIt, properties)
      },
    }),
}

export const mountHomePageClient = ({ deps: depsOverrides }: MountHomePageClientOptions = {}) => {
  const deps = { ...defaultDeps, ...depsOverrides }
  const mounts = [
    deps.mountCommissionViewModeDomSync,
    deps.mountActiveCharactersLoader,
    deps.mountStaleCharactersLoader,
    deps.mountTimelineViewLoader,
    deps.mountHomeScrollRestore,
    deps.mountSidebarNavEnhancer,
    deps.mountMobileHamburgerMenu,
    deps.mountMobileLanguageMenu,
    deps.mountMobileViewModeTabs,
    deps.mountUnpublishedInterestButtons,
  ]

  const cleanups: Cleanup[] = []

  try {
    for (const mount of mounts) {
      cleanups.push(mount())
    }
  } catch (error) {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
    throw error
  }

  return () => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  }
}
