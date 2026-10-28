import { mountArchivedCharactersToggle } from '@features/home/commission/archivedCharactersToggle'
import { mountCommissionViewModeDomSync } from '@features/home/commission/commissionViewModeDomSync'
import { mountImageFadeIn } from '@features/home/commission/imageFadeIn'
import { mountMobileViewModeTabs } from '@features/home/commission/mobileViewModeTabs'
import { mountScrollDepthTracker } from '@features/home/commission/scrollDepthTracker'
import { mountScrollReveal } from '@features/home/commission/scrollReveal'
import { mountUnpublishedInterestButtons } from '@features/home/commission/unpublishedInterestClient'
import { mountHomeHashTarget } from '@features/home/homeHashTarget'
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
  mountArchivedCharactersToggle: Mount
  mountHomeHashTarget: Mount
  mountHomeScrollRestore: Mount
  mountSidebarNavEnhancer: Mount
  mountMobileHamburgerMenu: Mount
  mountMobileLanguageMenu: Mount
  mountFloatingButtonsAutoHide: Mount
  mountMobileViewModeTabs: Mount
  mountImageFadeIn: Mount
  mountScrollReveal: Mount
  mountScrollDepthTracker: Mount
  mountUnpublishedInterestButtons: Mount
  scheduleDeferredMount: (task: () => void) => Cleanup
}

interface MountHomePageClientOptions {
  deps?: Partial<HomePageClientDeps>
}

const defaultDeps: HomePageClientDeps = {
  mountCommissionViewModeDomSync: () => mountCommissionViewModeDomSync(),
  mountArchivedCharactersToggle: () => mountArchivedCharactersToggle(),
  mountHomeHashTarget: () => mountHomeHashTarget(),
  mountHomeScrollRestore: () => mountHomeScrollRestore(),
  mountSidebarNavEnhancer: () => mountSidebarNavEnhancer(),
  mountMobileHamburgerMenu: () => mountMobileHamburgerMenu(),
  mountMobileLanguageMenu: () => mountMobileLanguageMenu(),
  mountFloatingButtonsAutoHide: () => mountFloatingButtonsAutoHide(),
  mountMobileViewModeTabs: () => mountMobileViewModeTabs(),
  mountImageFadeIn: () => mountImageFadeIn(),
  mountScrollReveal: () => mountScrollReveal(),
  mountScrollDepthTracker: () =>
    mountScrollDepthTracker({
      trackEvent: (properties) => {
        trackRybbitEvent(ANALYTICS_EVENTS.scrollDepthReached, { ...properties })
      },
    }),
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
  const deps = {
    ...defaultDeps,
    ...depsOverrides,
  }
  const criticalMounts: Mount[] = [
    deps.mountCommissionViewModeDomSync,
    // The toggle restores saved visibility before the hash target and scroll restore read the layout.
    deps.mountArchivedCharactersToggle,
    deps.mountHomeHashTarget,
    deps.mountHomeScrollRestore,
    deps.mountImageFadeIn,
  ]
  const deferredMounts: Mount[] = [
    deps.mountSidebarNavEnhancer,
    deps.mountMobileHamburgerMenu,
    deps.mountMobileLanguageMenu,
    deps.mountMobileViewModeTabs,
    deps.mountUnpublishedInterestButtons,
    deps.mountScrollReveal,
    deps.mountFloatingButtonsAutoHide,
    deps.mountScrollDepthTracker,
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
