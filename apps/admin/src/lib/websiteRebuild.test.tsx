// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../components/FloatingNotice'
import { FloatingRebuildButton } from '../components/FloatingRebuildButton'
import { AdminOverviewPage } from '../pages/AdminOverviewPage'
import { clearPendingRebuild, isPendingRebuild, markPendingRebuild } from './pendingRebuildSignal'
import { dismissWebsiteRebuildNotice, getWebsiteRebuildState, queueWebsiteRebuild } from './websiteRebuild'

const api = vi.hoisted(() => ({ trigger: vi.fn() }))
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

describe('shared website rebuild lifecycle', () => {
  let container: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined
  beforeEach(() => {
    api.trigger.mockReset().mockResolvedValue({ status: 'success', message: 'Queued' })
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

  it('deduplicates entry points and keeps newer saved changes pending', async () => {
    let finish!: () => void
    api.trigger.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ status: 'success' })
    }))
    markPendingRebuild()
    const first = queueWebsiteRebuild()
    expect(queueWebsiteRebuild()).toBe(first)
    expect(api.trigger).toHaveBeenCalledOnce()
    expect(getWebsiteRebuildState().status).toBe('pending')
    markPendingRebuild()
    finish()
    await first
    expect(isPendingRebuild()).toBe(true)
    await queueWebsiteRebuild()
    expect(api.trigger).toHaveBeenCalledTimes(2)
    expect(isPendingRebuild()).toBe(false)
  })

  it('retains the pending revision on failure and allows a successful retry', async () => {
    markPendingRebuild()
    api.trigger.mockRejectedValueOnce(new Error('Offline'))
    await queueWebsiteRebuild()
    expect(getWebsiteRebuildState()).toEqual({ status: 'error', message: 'Offline' })
    expect(isPendingRebuild()).toBe(true)
    await queueWebsiteRebuild()
    expect(getWebsiteRebuildState().status).toBe('success')
    expect(isPendingRebuild()).toBe(false)
  })

  it('expires success feedback without clearing subsequent saved changes', async () => {
    vi.useFakeTimers()
    await queueWebsiteRebuild()
    markPendingRebuild()
    await vi.advanceTimersByTimeAsync(4000)
    expect(getWebsiteRebuildState().status).toBe('idle')
    expect(isPendingRebuild()).toBe(true)
  })

  it('keeps both route-specific buttons disabled through unmount and remount', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let finish!: () => void
    api.trigger.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ status: 'success' })
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
    await act(async () => finish())
    expect(container.textContent).toContain('Rebuild queued.')
    expect(api.trigger).toHaveBeenCalledOnce()
  })
})
