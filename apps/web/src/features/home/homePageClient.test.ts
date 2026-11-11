// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mountHomePageClient } from './homePageClient'

type Trace = string[]

function createMount(trace: Trace, name: string) {
  return vi.fn(() => {
    trace.push(`mount:${name}`)
    return () => {
      trace.push(`cleanup:${name}`)
    }
  })
}

const noopMount = () => () => {}

// Stands in for the dynamic deferred chunk; the traced deferred mounts below override it per name.
function createDeferredModule() {
  return {
    mountSidebarNavEnhancer: noopMount,
    mountMobileHamburgerMenu: noopMount,
    mountMobileKeywordButton: noopMount,
    mountMobileViewModeTabs: noopMount,
    mountUnpublishedInterestButtons: noopMount,
    mountScrollReveal: noopMount,
    mountFloatingButtonsAutoHide: noopMount,
    mountScrollDepthTracker: noopMount,
  }
}

function createDeps(trace: Trace) {
  let deferredTask: (() => void) | null = null
  const cancelDeferredMount = vi.fn()
  const scheduleDeferredMount = vi.fn((task: () => void) => {
    deferredTask = task
    return cancelDeferredMount
  })
  const loadDeferredMounts = vi.fn(() => Promise.resolve(createDeferredModule()))

  return {
    deps: {
      mountCommissionViewModeDomSync: createMount(trace, 'view-sync'),
      mountArchivedCharactersToggle: createMount(trace, 'archived-toggle'),
      mountHomeHashTarget: createMount(trace, 'hash-target'),
      mountHomeScrollRestore: createMount(trace, 'scroll-restore'),
      mountImageFadeIn: createMount(trace, 'image-fade'),
      mountSidebarNavEnhancer: createMount(trace, 'sidebar-nav'),
      mountMobileHamburgerMenu: createMount(trace, 'hamburger-menu'),
      mountMobileKeywordButton: createMount(trace, 'keyword-button'),
      mountMobileViewModeTabs: createMount(trace, 'mobile-tabs'),
      mountUnpublishedInterestButtons: createMount(trace, 'interest-buttons'),
      loadDeferredMounts,
      scheduleDeferredMount,
    },
    getDeferredTask: () => deferredTask,
    cancelDeferredMount,
    scheduleDeferredMount,
  }
}

describe('mountHomePageClient', () => {
  it('mounts critical features immediately and defers non-critical mounts', async () => {
    const trace: Trace = []
    const { deps, getDeferredTask } = createDeps(trace)

    const cleanup = mountHomePageClient({ deps })

    expect(trace).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:scroll-restore',
      'mount:image-fade',
    ])

    getDeferredTask()?.()

    await vi.waitFor(() => {
      expect(trace).toEqual([
        'mount:view-sync',
        'mount:archived-toggle',
        'mount:hash-target',
        'mount:scroll-restore',
        'mount:image-fade',
        'mount:sidebar-nav',
        'mount:hamburger-menu',
        'mount:keyword-button',
        'mount:mobile-tabs',
        'mount:interest-buttons',
      ])
    })

    cleanup()

    expect(trace).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:scroll-restore',
      'mount:image-fade',
      'mount:sidebar-nav',
      'mount:hamburger-menu',
      'mount:keyword-button',
      'mount:mobile-tabs',
      'mount:interest-buttons',
      'cleanup:interest-buttons',
      'cleanup:mobile-tabs',
      'cleanup:keyword-button',
      'cleanup:hamburger-menu',
      'cleanup:sidebar-nav',
      'cleanup:image-fade',
      'cleanup:scroll-restore',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:view-sync',
    ])
  })

  it('cancels deferred mount scheduling when cleanup runs first', () => {
    const trace: Trace = []
    const { deps, getDeferredTask, cancelDeferredMount } = createDeps(trace)

    const cleanup = mountHomePageClient({ deps })
    cleanup()

    expect(cancelDeferredMount).toHaveBeenCalledTimes(1)
    expect(trace).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:scroll-restore',
      'mount:image-fade',
      'cleanup:image-fade',
      'cleanup:scroll-restore',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:view-sync',
    ])

    getDeferredTask()?.()
    expect(trace).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:scroll-restore',
      'mount:image-fade',
      'cleanup:image-fade',
      'cleanup:scroll-restore',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:view-sync',
    ])
  })

  it('rolls back already mounted critical features when a critical mount throws', () => {
    const trace: Trace = []
    const { deps, scheduleDeferredMount } = createDeps(trace)
    const criticalError = new Error('critical mount failed')

    deps.mountArchivedCharactersToggle = vi.fn(() => {
      trace.push('mount:archived-toggle')
      throw criticalError
    })

    expect(() => mountHomePageClient({ deps })).toThrow(criticalError)
    expect(scheduleDeferredMount).not.toHaveBeenCalled()
    expect(trace).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'cleanup:view-sync',
    ])
  })

  it('reveals a page the pre-paint script hid when a critical mount throws', () => {
    const trace: Trace = []
    const { deps } = createDeps(trace)
    document.documentElement.setAttribute('data-home-scroll-restoring', 'true')
    deps.mountCommissionViewModeDomSync = vi.fn(() => {
      throw new Error('critical mount failed')
    })

    expect(() => mountHomePageClient({ deps })).toThrow()
    expect(deps.mountHomeScrollRestore).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-home-scroll-restoring')).toBe(false)
  })

  it('does not mount the deferred group when teardown runs while its chunk loads', async () => {
    const trace: Trace = []
    const { deps, getDeferredTask } = createDeps(trace)
    let resolveChunk!: (module: ReturnType<typeof createDeferredModule>) => void
    deps.loadDeferredMounts = vi.fn(() => new Promise((resolve) => {
      resolveChunk = resolve
    }))

    const cleanup = mountHomePageClient({ deps })
    getDeferredTask()?.()
    cleanup()
    resolveChunk(createDeferredModule())
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(trace.filter(entry => entry.startsWith('mount:'))).toEqual([
      'mount:view-sync',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:scroll-restore',
      'mount:image-fade',
    ])
  })

  it('keeps the critical mounts when the deferred chunk fails to load', async () => {
    const trace: Trace = []
    const { deps, getDeferredTask } = createDeps(trace)
    const loadError = new Error('chunk gone')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    deps.loadDeferredMounts = vi.fn(() => Promise.reject(loadError))

    const cleanup = mountHomePageClient({ deps })
    getDeferredTask()?.()

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), loadError)
    })
    expect(trace.filter(entry => entry.startsWith('cleanup:'))).toEqual([])
    cleanup()
  })

  it('isolates a throwing deferred mount', async () => {
    const trace: Trace = []
    const { deps, getDeferredTask } = createDeps(trace)
    const deferredError = new Error('deferred mount failed')
    const secondCleanup = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    deps.mountSidebarNavEnhancer = vi.fn(() => {
      throw deferredError
    })
    deps.mountMobileHamburgerMenu = vi.fn(() => secondCleanup)

    const cleanup = mountHomePageClient({ deps })

    expect(() => getDeferredTask()?.()).not.toThrow()
    await vi.waitFor(() => {
      expect(deps.mountMobileHamburgerMenu).toHaveBeenCalledTimes(1)
    })
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), deferredError)
    expect(trace.filter(entry => entry.startsWith('cleanup:'))).toEqual([])

    cleanup()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
