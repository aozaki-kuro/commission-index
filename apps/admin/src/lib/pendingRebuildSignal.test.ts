// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingRebuild,
  getPendingRebuildRevision,
  isPendingRebuild,
  markPendingRebuild,
  subscribeToPendingRebuild,
} from './pendingRebuildSignal'

afterEach(() => {
  clearPendingRebuild()
  sessionStorage.clear()
})

describe('pendingRebuildSignal', () => {
  it('tracks pending state and clears only the matching revision snapshot', () => {
    expect(isPendingRebuild()).toBe(false)

    markPendingRebuild()
    expect(isPendingRebuild()).toBe(true)
    const dispatchedRevision = getPendingRebuildRevision()

    markPendingRebuild()
    expect(getPendingRebuildRevision()).toBe(dispatchedRevision + 1)
    clearPendingRebuild(dispatchedRevision)
    expect(isPendingRebuild()).toBe(true)

    clearPendingRebuild(getPendingRebuildRevision())
    expect(isPendingRebuild()).toBe(false)
  })

  it('notifies subscribers on mark and clear', () => {
    const listener = vi.fn()
    const unsub = subscribeToPendingRebuild(listener)

    markPendingRebuild()
    expect(listener).toHaveBeenCalledWith(true)

    clearPendingRebuild()
    expect(listener).toHaveBeenCalledWith(false)

    unsub()
  })

  it('persists to sessionStorage', () => {
    markPendingRebuild()
    expect(sessionStorage.getItem('pending-rebuild')).toBe('1')
    clearPendingRebuild()
    expect(sessionStorage.getItem('pending-rebuild')).toBeNull()
  })
})
