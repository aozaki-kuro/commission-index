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

function createDeps(trace: Trace) {
  let deferredTask: (() => void) | null = null
  const cancelDeferredMount = vi.fn()
  const scheduleDeferredMount = vi.fn((task: () => void) => {
    deferredTask = task
    return cancelDeferredMount
  })

  return {
    deps: {
      mountCommissionViewModeDomSync: createMount(trace, 'view-sync'),
      mountActiveCharactersLoader: createMount(trace, 'active-loader'),
      mountArchivedCharactersToggle: createMount(trace, 'archived-toggle'),
      mountHomeHashTarget: createMount(trace, 'hash-target'),
      mountTimelineViewLoader: createMount(trace, 'timeline-loader'),
      mountHomeScrollRestore: createMount(trace, 'scroll-restore'),
      mountHomeUpdateLinks: createMount(trace, 'update-links'),
      mountImageFadeIn: createMount(trace, 'image-fade'),
      mountSidebarNavEnhancer: createMount(trace, 'sidebar-nav'),
      mountMobileHamburgerMenu: createMount(trace, 'hamburger-menu'),
      mountMobileLanguageMenu: createMount(trace, 'language-menu'),
      mountMobileViewModeTabs: createMount(trace, 'mobile-tabs'),
      mountUnpublishedInterestButtons: createMount(trace, 'interest-buttons'),
      scheduleDeferredMount,
    },
    getDeferredTask: () => deferredTask,
    cancelDeferredMount,
    scheduleDeferredMount,
  }
}

describe('mountHomePageClient', () => {
  it('mounts critical features immediately and defers non-critical mounts', () => {
    const trace: Trace = []
    const { deps, getDeferredTask } = createDeps(trace)

    const cleanup = mountHomePageClient({ deps })

    expect(trace).toEqual([
      'mount:view-sync',
      'mount:active-loader',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:timeline-loader',
      'mount:scroll-restore',
      'mount:update-links',
      'mount:image-fade',
    ])

    getDeferredTask()?.()

    expect(trace).toEqual([
      'mount:view-sync',
      'mount:active-loader',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:timeline-loader',
      'mount:scroll-restore',
      'mount:update-links',
      'mount:image-fade',
      'mount:sidebar-nav',
      'mount:hamburger-menu',
      'mount:language-menu',
      'mount:mobile-tabs',
      'mount:interest-buttons',
    ])

    cleanup()

    expect(trace).toEqual([
      'mount:view-sync',
      'mount:active-loader',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:timeline-loader',
      'mount:scroll-restore',
      'mount:update-links',
      'mount:image-fade',
      'mount:sidebar-nav',
      'mount:hamburger-menu',
      'mount:language-menu',
      'mount:mobile-tabs',
      'mount:interest-buttons',
      'cleanup:interest-buttons',
      'cleanup:mobile-tabs',
      'cleanup:language-menu',
      'cleanup:hamburger-menu',
      'cleanup:sidebar-nav',
      'cleanup:image-fade',
      'cleanup:update-links',
      'cleanup:scroll-restore',
      'cleanup:timeline-loader',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:active-loader',
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
      'mount:active-loader',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:timeline-loader',
      'mount:scroll-restore',
      'mount:update-links',
      'mount:image-fade',
      'cleanup:image-fade',
      'cleanup:update-links',
      'cleanup:scroll-restore',
      'cleanup:timeline-loader',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:active-loader',
      'cleanup:view-sync',
    ])

    getDeferredTask()?.()
    expect(trace).toEqual([
      'mount:view-sync',
      'mount:active-loader',
      'mount:archived-toggle',
      'mount:hash-target',
      'mount:timeline-loader',
      'mount:scroll-restore',
      'mount:update-links',
      'mount:image-fade',
      'cleanup:image-fade',
      'cleanup:update-links',
      'cleanup:scroll-restore',
      'cleanup:timeline-loader',
      'cleanup:hash-target',
      'cleanup:archived-toggle',
      'cleanup:active-loader',
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
      'mount:active-loader',
      'mount:archived-toggle',
      'cleanup:active-loader',
      'cleanup:view-sync',
    ])
  })

  it('isolates a throwing deferred mount', () => {
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
    expect(deps.mountMobileHamburgerMenu).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), deferredError)
    expect(trace.filter(entry => entry.startsWith('cleanup:'))).toEqual([])

    cleanup()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
