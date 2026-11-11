import type { DeferredMounts } from '@features/home/homePageDeferredMounts'
import { mountArchivedCharactersToggle } from '@features/home/commission/archivedCharactersToggle'
import { mountCommissionViewModeDomSync } from '@features/home/commission/commissionViewModeDomSync'
import { mountImageFadeIn } from '@features/home/commission/imageFadeIn'
import { mountHomeHashTarget } from '@features/home/homeHashTarget'
import { mountHomeScrollRestore, revealRestoringShell } from '@features/home/homeScrollRestore'

type Cleanup = () => void
type Mount = () => Cleanup

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const HOME_DEFERRED_MOUNT_TIMEOUT_MS = 1200
const HOME_DEFERRED_MOUNT_FALLBACK_DELAY_MS = 180

type DeferredMountName = keyof DeferredMounts

const DEFERRED_MOUNT_ORDER: readonly DeferredMountName[] = [
  'mountSidebarNavEnhancer',
  'mountMobileHamburgerMenu',
  'mountMobileKeywordButton',
  'mountMobileViewModeTabs',
  'mountUnpublishedInterestButtons',
  'mountScrollReveal',
  'mountFloatingButtonsAutoHide',
  'mountScrollDepthTracker',
]

interface HomePageClientDeps {
  mountCommissionViewModeDomSync: Mount
  mountArchivedCharactersToggle: Mount
  mountHomeHashTarget: Mount
  mountHomeScrollRestore: Mount
  mountImageFadeIn: Mount
  // The deferred group is one dynamic chunk, kept out of the eager entry; a dep given per mount overrides it.
  loadDeferredMounts: () => Promise<Record<DeferredMountName, Mount>>
  scheduleDeferredMount: (task: () => void) => Cleanup
}

interface MountHomePageClientOptions {
  deps?: Partial<HomePageClientDeps & Record<DeferredMountName, Mount>>
}

const defaultDeps: HomePageClientDeps = {
  mountCommissionViewModeDomSync: () => mountCommissionViewModeDomSync(),
  mountArchivedCharactersToggle: () => mountArchivedCharactersToggle(),
  mountHomeHashTarget: () => mountHomeHashTarget(),
  mountHomeScrollRestore: () => mountHomeScrollRestore(),
  mountImageFadeIn: () => mountImageFadeIn(),
  loadDeferredMounts: () => import('@features/home/homePageDeferredMounts').then(module => module.deferredMounts),
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
      deps.loadDeferredMounts().then((loaded) => {
        // A soft navigation can tear down while the chunk loads; mounting now would bind to the next page.
        if (disposed)
          return
        // Deferred features are independent; one failing must not tear down the critical mounts.
        for (const name of DEFERRED_MOUNT_ORDER) {
          try {
            cleanups.push((depsOverrides?.[name] ?? loaded[name])())
          }
          catch (error) {
            console.error('[home] deferred mount failed', error)
          }
        }
      }, (error: unknown) => {
        console.error('[home] deferred mounts failed to load', error)
      })
    })
  }
  catch (error) {
    cancelDeferredMount?.()
    cancelDeferredMount = null
    cleanupAll()
    // The inline pre-paint script may have hidden the listing for a scroll restore that will now never run.
    revealRestoringShell(window)
    throw error
  }

  return () => {
    disposed = true
    cancelDeferredMount?.()
    cancelDeferredMount = null
    cleanupAll()
  }
}
