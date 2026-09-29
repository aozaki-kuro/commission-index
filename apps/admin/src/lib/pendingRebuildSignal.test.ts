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
  it('advances every saved revision and only clears the matching snapshot', () => {
    markPendingRebuild()
    const dispatchedRevision = getPendingRebuildRevision()
    markPendingRebuild()
    expect(getPendingRebuildRevision()).toBe(dispatchedRevision + 1)
    clearPendingRebuild(dispatchedRevision)
    expect(isPendingRebuild()).toBe(true)
    clearPendingRebuild(getPendingRebuildRevision())
    expect(isPendingRebuild()).toBe(false)
  })

  it('starts as not pending', () => {
    expect(isPendingRebuild()).toBe(false)
  })

  it('becomes pending after markPendingRebuild', () => {
    markPendingRebuild()
    expect(isPendingRebuild()).toBe(true)
  })

  it('clears after clearPendingRebuild', () => {
    markPendingRebuild()
    clearPendingRebuild()
    expect(isPendingRebuild()).toBe(false)
  })

  it('notifies subscribers on mark', () => {
    const listener = vi.fn()
    const unsub = subscribeToPendingRebuild(listener)
    markPendingRebuild()
    expect(listener).toHaveBeenCalledWith(true)
    unsub()
  })

  it('notifies subscribers on clear', () => {
    const listener = vi.fn()
    markPendingRebuild()
    const unsub = subscribeToPendingRebuild(listener)
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
