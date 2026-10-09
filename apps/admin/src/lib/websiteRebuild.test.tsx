// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../components/FloatingNotice'
import { FloatingRebuildButton } from '../components/FloatingRebuildButton'
import { AdminOverviewPage } from '../pages/AdminOverviewPage'
import { clearPendingRebuild, isPendingRebuild, markPendingRebuild } from './pendingRebuildSignal'
import {
  dismissWebsiteRebuildNotice,
  getWebsiteRebuildState,
  queueWebsiteRebuild,
  websiteRebuildPollTimeoutMs,
} from './websiteRebuild'

const api = vi.hoisted(() => ({ trigger: vi.fn(), fetchBuildInfo: vi.fn() }))
vi.mock('./adminApi', () => ({
  triggerRebuildDeploy: api.trigger,
  getAdminApiBaseUrl: () => '',
  readCachedAdminJson: () => null,
  fetchAdminOverviewPayload: async () => ({
    health: { status: 'ok' },
    bootstrap: { characters: [], commissionSearchRows: [] },
    aliases: { characterAliases: [], creatorAliases: [], keywordAliases: [] },
    suggestion: { featuredKeywords: [] },
  }),
}))
vi.mock('./liveBuildInfo', () => ({
  fetchLiveBuildInfo: api.fetchBuildInfo,
  isBuildConfirmed: (info: { dataExportedAt: string }, dispatchedAt: string) => Date.parse(info.dataExportedAt) >= Date.parse(dispatchedAt),
}))

const dispatchedAt = '2026-10-09T10:00:00.000Z'
const staleBuild = { dataRevision: 'old', dataExportedAt: '2026-10-09T09:59:00.000Z', codeSha: null, builtAt: '2026-10-09T10:01:00.000Z' }
const confirmedBuild = { ...staleBuild, dataRevision: 'new', dataExportedAt: '2026-10-09T10:00:01.000Z' }
// The second poll fires 5 s after dispatch under the ramp-up backoff.
const secondPollMs = 5000

describe('shared website rebuild lifecycle', () => {
  let container: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    api.trigger.mockReset().mockResolvedValue({ status: 'success', message: 'Queued', dispatchedAt })
    api.fetchBuildInfo.mockReset().mockResolvedValue(confirmedBuild)
    clearPendingRebuild()
    dismissWebsiteRebuildNotice()
  })
  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined
    dismissWebsiteRebuildNotice()
    clearPendingRebuild()
    vi.useRealTimers()
  })

  it('keeps newer saved changes pending after confirming only the dispatched revision snapshot', async () => {
    api.fetchBuildInfo.mockResolvedValueOnce(staleBuild).mockResolvedValueOnce(confirmedBuild)
    markPendingRebuild()
    const first = queueWebsiteRebuild()
    expect(queueWebsiteRebuild()).toBe(first)
    expect(api.trigger).toHaveBeenCalledOnce()
    expect(getWebsiteRebuildState().status).toBe('pending')
    markPendingRebuild()
    await vi.advanceTimersByTimeAsync(secondPollMs)
    await first
    await vi.waitFor(() => expect(getWebsiteRebuildState().status).toBe('success'))
    expect(isPendingRebuild()).toBe(true)
  })

  it('keeps pending on an older exported snapshot and clears when it is new enough', async () => {
    api.fetchBuildInfo.mockResolvedValueOnce(staleBuild).mockResolvedValueOnce(confirmedBuild)
    markPendingRebuild()
    const request = queueWebsiteRebuild()
    await vi.advanceTimersByTimeAsync(secondPollMs)
    await request
    await vi.waitFor(() => expect(getWebsiteRebuildState().status).toBe('success'))
    expect(isPendingRebuild()).toBe(false)
  })

  it('reports an unconfirmed timeout and preserves pending state', async () => {
    api.fetchBuildInfo.mockResolvedValue(staleBuild)
    markPendingRebuild()
    const request = queueWebsiteRebuild()
    await vi.advanceTimersByTimeAsync(websiteRebuildPollTimeoutMs)
    await request
    await vi.waitFor(() => expect(getWebsiteRebuildState().status).toBe('unconfirmed'))
    expect(getWebsiteRebuildState().message).toContain('not confirmed')
    await vi.advanceTimersByTimeAsync(60000)
    expect(getWebsiteRebuildState().status).toBe('unconfirmed')
    expect(isPendingRebuild()).toBe(true)
  })

  it('does not clear pending when live build-info checks fail', async () => {
    api.fetchBuildInfo.mockRejectedValue(new Error('Network down'))
    markPendingRebuild()
    const request = queueWebsiteRebuild()
    await vi.advanceTimersByTimeAsync(websiteRebuildPollTimeoutMs)
    await request
    await vi.waitFor(() => expect(getWebsiteRebuildState().status).toBe('unconfirmed'))
    expect(getWebsiteRebuildState().message).toContain('Last check failed: Network down')
    expect(isPendingRebuild()).toBe(true)
  })

  it('retains the pending revision when dispatch fails and allows a successful retry', async () => {
    markPendingRebuild()
    api.trigger.mockRejectedValueOnce(new Error('Offline'))
    await queueWebsiteRebuild()
    expect(getWebsiteRebuildState()).toEqual({ status: 'error', message: 'Offline' })
    expect(isPendingRebuild()).toBe(true)
    await queueWebsiteRebuild()
    await vi.waitFor(() => expect(getWebsiteRebuildState().status).toBe('success'))
    expect(isPendingRebuild()).toBe(false)
  })

  it('expires success feedback without clearing subsequent saved changes', async () => {
    await queueWebsiteRebuild()
    expect(getWebsiteRebuildState().status).toBe('success')
    markPendingRebuild()
    await vi.advanceTimersByTimeAsync(4000)
    expect(getWebsiteRebuildState().status).toBe('idle')
    expect(isPendingRebuild()).toBe(true)
  })

  it('keeps both route-specific buttons disabled through unmount and remount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let finish!: () => void
    api.trigger.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ status: 'success', dispatchedAt })
    }))
    markPendingRebuild()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const render = (overview: boolean) => act(async () => root!.render(
      <FloatingNoticeProvider>{overview ? <AdminOverviewPage onNavigate={() => {}} /> : <FloatingRebuildButton />}</FloatingNoticeProvider>,
    ))
    await render(false)
    await act(async () => container!.querySelector('button')!.click())
    expect(api.trigger).toHaveBeenCalledOnce()
    await render(true)
    const overviewButton = [...container.querySelectorAll('button')].find(button => button.textContent === 'Queueing…')!
    expect(overviewButton.disabled).toBe(true)
    await render(false)
    expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    await act(async () => {
      finish()
      await vi.waitFor(() => expect(container!.textContent).toContain('Website updated and confirmed live.'))
    })
    expect(api.trigger).toHaveBeenCalledOnce()
  })
})
