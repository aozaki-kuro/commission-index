// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchSearchQueryLocationChange,
  getDomSnapshotKeyForMode,
  resolveEffectiveDomSnapshotKey,
  subscribeToUrlQuerySnapshot,
} from './useCommissionSearchModel'

describe('getDomSnapshotKeyForMode', () => {
  it('changes character snapshot key when activeLoaded or staleLoaded changes', () => {
    const before = getDomSnapshotKeyForMode({
      activeBatchCount: 0,
      activeLoaded: false,
      mode: 'character',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: false,
      timelineLoaded: false,
    })
    const unrelatedTimelineChange = getDomSnapshotKeyForMode({
      activeBatchCount: 0,
      activeLoaded: false,
      mode: 'character',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: false,
      timelineLoaded: true,
    })
    const activeBatchChange = getDomSnapshotKeyForMode({
      activeBatchCount: 1,
      activeLoaded: false,
      mode: 'character',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: false,
      timelineLoaded: true,
    })
    const activeChange = getDomSnapshotKeyForMode({
      activeBatchCount: 1,
      activeLoaded: true,
      mode: 'character',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: false,
      timelineLoaded: true,
    })
    const staleVisibleChange = getDomSnapshotKeyForMode({
      activeBatchCount: 1,
      activeLoaded: true,
      mode: 'character',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: true,
      timelineLoaded: true,
    })
    const staleBatchChange = getDomSnapshotKeyForMode({
      activeBatchCount: 1,
      activeLoaded: true,
      mode: 'character',
      staleBatchCount: 1,
      staleLoaded: false,
      staleVisible: true,
      timelineLoaded: true,
    })
    const staleChange = getDomSnapshotKeyForMode({
      activeBatchCount: 1,
      activeLoaded: true,
      mode: 'character',
      staleBatchCount: 2,
      staleLoaded: true,
      staleVisible: true,
      timelineLoaded: true,
    })

    expect(before).toBe(unrelatedTimelineChange)
    expect(activeBatchChange).not.toBe(before)
    expect(activeChange).not.toBe(activeBatchChange)
    expect(staleVisibleChange).not.toBe(activeChange)
    expect(staleBatchChange).not.toBe(staleVisibleChange)
    expect(staleChange).not.toBe(staleBatchChange)
  })

  it('changes timeline snapshot key only when timelineLoaded changes', () => {
    const before = getDomSnapshotKeyForMode({
      activeBatchCount: 0,
      activeLoaded: false,
      mode: 'timeline',
      staleBatchCount: 0,
      staleLoaded: false,
      staleVisible: false,
      timelineLoaded: false,
    })
    const unrelatedStaleChange = getDomSnapshotKeyForMode({
      activeBatchCount: 2,
      activeLoaded: true,
      mode: 'timeline',
      staleBatchCount: 3,
      staleLoaded: true,
      staleVisible: true,
      timelineLoaded: false,
    })
    const timelineChange = getDomSnapshotKeyForMode({
      activeBatchCount: 2,
      activeLoaded: true,
      mode: 'timeline',
      staleBatchCount: 3,
      staleLoaded: true,
      staleVisible: true,
      timelineLoaded: true,
    })

    expect(before).toBe(unrelatedStaleChange)
    expect(timelineChange).not.toBe(before)
  })
})

describe('resolveEffectiveDomSnapshotKey', () => {
  it('uses a stable key when dom context is skipped', () => {
    const first = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'character:stale-hidden',
      skipDomContext: true,
    })
    const second = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'character:stale-loaded',
      skipDomContext: true,
    })

    expect(first).toBe('skip-dom-context')
    expect(second).toBe(first)
  })

  it('keeps the mode snapshot key when dom context is enabled', () => {
    const key = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'timeline:timeline-loaded',
      skipDomContext: false,
    })

    expect(key).toBe('timeline:timeline-loaded')
  })
})

describe('subscribeToUrlQuerySnapshot', () => {
  it('notifies listeners for popstate changes', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToUrlQuerySnapshot(onStoreChange)

    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(onStoreChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('notifies listeners for explicit location query updates', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToUrlQuerySnapshot(onStoreChange)

    dispatchSearchQueryLocationChange()

    expect(onStoreChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
