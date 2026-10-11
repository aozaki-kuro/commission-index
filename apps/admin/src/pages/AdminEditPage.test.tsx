// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../components/FloatingNotice'
import { AdminEditPage } from './AdminEditPage'

const api = vi.hoisted(() => ({
  fetchAdminJsonWithRetry: vi.fn(),
  readCachedAdminJson: vi.fn(),
  groupsLoaded: null as null | (() => void),
  dataUpdate: null as null | ((scope?: { characterIds: number[] }) => void),
  scopes: [] as (number[] | null)[],
}))

vi.mock('../lib/adminApi', () => api)
vi.mock('../lib/dataUpdateSignal', () => ({
  subscribeToDataUpdates: (listener: typeof api.dataUpdate) => {
    api.dataUpdate = listener
    return () => {}
  },
}))
vi.mock('../components/AdminEditDashboard', () => ({
  AdminEditDashboard: ({ onOpenGroupsLoaded, refreshScope }: { onOpenGroupsLoaded: () => void, refreshScope: ReadonlySet<number> | null }) => {
    api.groupsLoaded = onOpenGroupsLoaded
    api.scopes.push(refreshScope && [...refreshScope].toSorted())
    return createElement('h2', null, 'Cached dashboard')
  },
}))

const cachedPayload = {
  characters: [],
  commissionSearchRows: [],
  creatorAliases: [],
}

describe('admin edit page cached refresh recovery', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('keeps cached content visible after refresh failure and retries successfully', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.assign(globalThis, { PerformanceNavigationTiming: class PerformanceNavigationTiming {} })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    api.readCachedAdminJson.mockReturnValue(cachedPayload)
    api.fetchAdminJsonWithRetry
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(cachedPayload)

    await act(async () => root.render(<FloatingNoticeProvider><AdminEditPage /></FloatingNoticeProvider>))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Cached dashboard')
    expect(container.textContent).toContain('Refresh failed')
    const retry = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'Try again')!
    await act(async () => {
      retry.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.fetchAdminJsonWithRetry).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Cached dashboard')
    expect(container.textContent).not.toContain('Refresh failed')
  })

  it('hands scoped updates to the dashboard, widening on unscoped requests and resetting after each payload', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    api.scopes.length = 0
    api.readCachedAdminJson.mockReturnValue(cachedPayload)
    api.fetchAdminJsonWithRetry.mockImplementation(async () => ({ ...cachedPayload }))
    await act(async () => root.render(<FloatingNoticeProvider><AdminEditPage /></FloatingNoticeProvider>))
    await vi.waitFor(() => expect(api.fetchAdminJsonWithRetry).toHaveBeenCalledTimes(1))
    // Nothing queued on the first landing: null means every loaded group refetches.
    await act(async () => {
      await Promise.resolve()
    })
    expect(api.scopes.every(scope => scope === null)).toBe(true)

    await act(async () => {
      api.dataUpdate!({ characterIds: [3, 1] })
      api.dataUpdate!({ characterIds: [2] })
    })
    await vi.waitFor(() => expect(api.scopes.at(-1)).toEqual([1, 2, 3]))

    await act(async () => {
      api.dataUpdate!({ characterIds: [5] })
      api.dataUpdate!()
    })
    await vi.waitFor(() => expect(api.scopes.at(-1)).toBeNull())

    await act(async () => api.dataUpdate!({ characterIds: [4] }))
    await vi.waitFor(() => expect(api.scopes.at(-1)).toEqual([4]))
  })

  it.each([false, true])('waits for groups before restoring once; user cancellation=%s', async (cancel) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    class ReloadNavigation { type = 'reload' }
    Object.assign(globalThis, { PerformanceNavigationTiming: ReloadNavigation })
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([new ReloadNavigation() as unknown as PerformanceEntry])
    window.sessionStorage.setItem('admin-dashboard-scroll', JSON.stringify({ top: 420, timestamp: Date.now() }))
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frame = undefined
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    api.readCachedAdminJson.mockReturnValue(null)
    let finish!: (value: typeof cachedPayload) => void
    api.fetchAdminJsonWithRetry.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await act(async () => root.render(createElement(AdminEditPage)))
    if (cancel) {
      await act(async () => window.dispatchEvent(new Event('wheel')))
    }
    await act(async () => finish(cachedPayload))
    expect(scroll).not.toHaveBeenCalled()
    expect(frame).toBeUndefined()
    await act(async () => api.groupsLoaded!())
    await act(async () => frame?.(0))
    expect(scroll).toHaveBeenCalledTimes(cancel ? 0 : 1)
    if (!cancel) {
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', top: 420 })
    }
  })
})
