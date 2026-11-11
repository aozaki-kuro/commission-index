// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from './FloatingNotice'
import { FloatingRebuildButton } from './FloatingRebuildButton'

const signals = vi.hoisted(() => ({
  pending: false,
  rebuild: { message: null as string | null, status: 'idle' },
}))

vi.mock('../lib/pendingRebuildSignal', () => ({
  isPendingRebuild: () => signals.pending,
  subscribeToPendingRebuild: () => () => {},
}))
vi.mock('../lib/websiteRebuild', () => ({
  getServerWebsiteRebuildState: () => signals.rebuild,
  getWebsiteRebuildState: () => signals.rebuild,
  queueWebsiteRebuild: vi.fn(),
  subscribeToWebsiteRebuild: () => () => {},
}))

describe('floating rebuild button', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('drops the confirmed-live message when a later save keeps the rebuild pending', async () => {
    signals.pending = true
    signals.rebuild = { message: 'Website updated and confirmed live.', status: 'success' }
    await act(async () => root.render(createElement(FloatingNoticeProvider, null, createElement(FloatingRebuildButton))))

    expect(container.querySelector('button')?.textContent).toBe('Rebuild')
    expect(container.textContent).not.toContain('confirmed live')
    expect(container.textContent).toContain('Saved changes are ready to publish.')
  })
})
