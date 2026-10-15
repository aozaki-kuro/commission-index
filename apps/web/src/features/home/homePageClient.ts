import { mountHomeUpdateLinks } from '@features/home/blocks/updateLinks'
import { mountCommissionViewModeDomSync } from '@features/home/commission/commissionViewModeDomSync'
import { mountActiveCharactersLoader } from '@features/home/commission/loader/activeCharactersLoader'
import { mountArchivedCharactersLoader } from '@features/home/commission/loader/archivedCharactersLoader'
import { mountTimelineViewLoader } from '@features/home/commission/loader/timelineViewLoader'
import { mountMobileViewModeTabs } from '@features/home/commission/mobileViewModeTabs'
import { mountScrollReveal } from '@features/home/commission/scrollReveal'
import { mountUnpublishedInterestButtons } from '@features/home/commission/unpublishedInterestClient'
import { mountHomeScrollRestore } from '@features/home/homeScrollRestore'
import { mountFloatingButtonsAutoHide } from '@features/home/nav/hamburger/floatingButtonsAutoHide'
import { mountMobileHamburgerMenu } from '@features/home/nav/hamburger/mobileHamburgerMenu'
import { mountMobileLanguageMenu } from '@features/home/nav/hamburger/mobileLanguageMenu'
import { mountSidebarNavEnhancer } from '@features/home/nav/sidebarNavEnhancer'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'

type Cleanup = () => void
type Mount = () => Cleanup

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const HOME_DEFERRED_MOUNT_TIMEOUT_MS = 1200
const HOME_DEFERRED_MOUNT_FALLBACK_DELAY_MS = 180

interface HomePageClientDeps {
  mountCommissionViewModeDomSync: Mount
  mountActiveCharactersLoader: Mount
  mountArchivedCharactersLoader: Mount
  mountTimelineViewLoader: Mount
  mountHomeScrollRestore: Mount
  mountHomeUpdateLinks: Mount
  mountSidebarNavEnhancer: Mount
  mountMobileHamburgerMenu: Mount
  mountMobileLanguageMenu: Mount
  mountFloatingButtonsAutoHide: Mount
  mountMobileViewModeTabs: Mount
  mountScrollReveal: Mount
  mountUnpublishedInterestButtons: Mount
  scheduleDeferredMount: (task: () => void) => Cleanup
}

interface MountHomePageClientOptions {
  deps?: Partial<HomePageClientDeps>
}

const defaultDeps: HomePageClientDeps = {
  mountCommissionViewModeDomSync: () => mountCommissionViewModeDomSync(),
  mountActiveCharactersLoader: () => mountActiveCharactersLoader(),
  mountArchivedCharactersLoader: () => mountArchivedCharactersLoader(),
  mountTimelineViewLoader: () => mountTimelineViewLoader(),
  mountHomeScrollRestore: () => mountHomeScrollRestore(),
  mountHomeUpdateLinks: () => mountHomeUpdateLinks(),
  mountSidebarNavEnhancer: () => mountSidebarNavEnhancer(),
  mountMobileHamburgerMenu: () => mountMobileHamburgerMenu(),
  mountMobileLanguageMenu: () => mountMobileLanguageMenu(),
  mountFloatingButtonsAutoHide: () => mountFloatingButtonsAutoHide(),
  mountMobileViewModeTabs: () => mountMobileViewModeTabs(),
  mountScrollReveal: () => mountScrollReveal(),
  mountUnpublishedInterestButtons: () =>
    mountUnpublishedInterestButtons({
      trackEvent: (properties) => {
        trackRybbitEvent(ANALYTICS_EVENTS.iWantToSeeIt, {
          sub_event: properties.sub_event,
        })
      },
    }),
  scheduleDeferredMount: (task) => {
    const idleWindow = window as IdleWindow
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const handle = idleWindow.requestIdleCallback(task, {
        timeout: HOME_DEFERRED_MOUNT_TIMEOUT_MS,
      })
      return () => {
        idleWindow.cancelIdleCallback?.(handle)
      }
    }

    const timeoutHandle = window.setTimeout(task, HOME_DEFERRED_MOUNT_FALLBACK_DELAY_MS)
    return () => {
      window.clearTimeout(timeoutHandle)
    }
  },
}

export function mountHomePageClient({ deps: depsOverrides }: MountHomePageClientOptions = {}) {
  const deps = { ...defaultDeps, ...depsOverrides }
  const criticalMounts: Mount[] = [
    deps.mountCommissionViewModeDomSync,
    deps.mountActiveCharactersLoader,
    deps.mountArchivedCharactersLoader,
    deps.mountTimelineViewLoader,
    deps.mountHomeScrollRestore,
    deps.mountHomeUpdateLinks,
  ]
  const deferredMounts: Mount[] = [
    deps.mountSidebarNavEnhancer,
    deps.mountMobileHamburgerMenu,
    deps.mountMobileLanguageMenu,
    deps.mountMobileViewModeTabs,
    deps.mountUnpublishedInterestButtons,
    deps.mountScrollReveal,
    deps.mountFloatingButtonsAutoHide,
  ]
  const cleanups: Cleanup[] = []
  let cancelDeferredMount: Cleanup | null = null
  let disposed = false

  const cleanupAll = () => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  }

  try {
    for (const mount of criticalMounts) {
      cleanups.push(mount())
    }

    cancelDeferredMount = deps.scheduleDeferredMount(() => {
      cancelDeferredMount = null
      if (disposed)
        return
      // Deferred features are independent; one failing must not tear down the critical mounts.
      for (const mount of deferredMounts) {
        try {
          cleanups.push(mount())
        }
        catch (error) {
          console.error('[home] deferred mount failed', error)
        }
      }
    })
  }
  catch (error) {
    cancelDeferredMount?.()
    cancelDeferredMount = null
    cleanupAll()
    throw error
  }

  return () => {
    disposed = true
    cancelDeferredMount?.()
    cancelDeferredMount = null
    cleanupAll()
  }
}
