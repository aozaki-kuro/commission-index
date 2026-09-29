// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminEditPage } from './AdminEditPage'

const api = vi.hoisted(() => ({
  fetchAdminJsonWithRetry: vi.fn(),
  readCachedAdminJson: vi.fn(),
}))

vi.mock('../lib/adminApi', () => api)
vi.mock('../lib/dataUpdateSignal', () => ({ subscribeToDataUpdates: () => () => {} }))
vi.mock('../components/AdminEditDashboard', () => ({
  AdminEditDashboard: () => createElement('h2', null, 'Cached dashboard'),
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

    await act(async () => root.render(createElement(AdminEditPage)))
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
})
