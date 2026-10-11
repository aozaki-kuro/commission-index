// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyDataUpdate, subscribeToDataUpdates } from './dataUpdateSignal'

describe('data update signal', () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup())
  })

  // Another tab is a second channel carrying a different session id.
  function broadcastFromOtherTab(extra: Record<string, unknown>) {
    const channel = new BroadcastChannel('commission-updates')
    channel.postMessage({ at: Date.now(), sessionId: 'other-tab', type: 'updated', ...extra })
    channel.close()
  }

  it('passes the scope from other tabs and undefined when absent or malformed', async () => {
    const listener = vi.fn()
    cleanups.push(subscribeToDataUpdates(listener))

    broadcastFromOtherTab({ characterIds: [2, 7] })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(listener).toHaveBeenLastCalledWith({ characterIds: [2, 7] })

    broadcastFromOtherTab({})
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    expect(listener).toHaveBeenLastCalledWith(undefined)

    broadcastFromOtherTab({ characterIds: ['x', -1] })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3))
    expect(listener).toHaveBeenLastCalledWith(undefined)
  })

  it('ignores its own scoped and unscoped broadcasts but delivers them to other listeners', async () => {
    const own = vi.fn()
    cleanups.push(subscribeToDataUpdates(own))
    const raw = new BroadcastChannel('commission-updates')
    const seen: unknown[] = []
    raw.onmessage = event => seen.push(event.data)
    cleanups.push(() => raw.close())

    notifyDataUpdate({ characterIds: [3, 3, 4] })
    notifyDataUpdate()
    await vi.waitFor(() => expect(seen).toHaveLength(2))
    expect(seen[0]).toMatchObject({ characterIds: [3, 4], type: 'updated' })
    expect(seen[1]).not.toHaveProperty('characterIds')
    expect(own).not.toHaveBeenCalled()
  })

  it('keeps the storage-ping fallback scope-less', () => {
    const listener = vi.fn()
    cleanups.push(subscribeToDataUpdates(listener))
    window.dispatchEvent(new StorageEvent('storage', { key: 'commission-updated-at' }))
    expect(listener).toHaveBeenCalledWith()
  })
})
