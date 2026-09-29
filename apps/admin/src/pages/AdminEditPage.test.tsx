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
}))

vi.mock('../lib/adminApi', () => api)
vi.mock('../lib/dataUpdateSignal', () => ({ subscribeToDataUpdates: () => () => {} }))
vi.mock('../components/AdminEditDashboard', () => ({
  AdminEditDashboard: ({ onOpenGroupsLoaded }: { onOpenGroupsLoaded: () => void }) => {
    api.groupsLoaded = onOpenGroupsLoaded
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
