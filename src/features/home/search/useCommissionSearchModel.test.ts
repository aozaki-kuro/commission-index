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
      activeLoaded: false,
      mode: 'character',
      staleLoaded: false,
      timelineLoaded: false,
    })
    const unrelatedTimelineChange = getDomSnapshotKeyForMode({
      activeLoaded: false,
      mode: 'character',
      staleLoaded: false,
      timelineLoaded: true,
    })
    const activeChange = getDomSnapshotKeyForMode({
      activeLoaded: true,
      mode: 'character',
      staleLoaded: false,
      timelineLoaded: true,
    })
    const staleChange = getDomSnapshotKeyForMode({
      activeLoaded: true,
      mode: 'character',
      staleLoaded: true,
      timelineLoaded: true,
    })

    expect(before).toBe(unrelatedTimelineChange)
    expect(activeChange).not.toBe(before)
    expect(staleChange).not.toBe(activeChange)
  })

  it('changes timeline snapshot key only when timelineLoaded changes', () => {
    const before = getDomSnapshotKeyForMode({
      activeLoaded: false,
      mode: 'timeline',
      staleLoaded: false,
      timelineLoaded: false,
    })
    const unrelatedStaleChange = getDomSnapshotKeyForMode({
      activeLoaded: true,
      mode: 'timeline',
      staleLoaded: true,
      timelineLoaded: false,
    })
    const timelineChange = getDomSnapshotKeyForMode({
      activeLoaded: true,
      mode: 'timeline',
      staleLoaded: true,
      timelineLoaded: true,
    })

    expect(before).toBe(unrelatedStaleChange)
    expect(timelineChange).not.toBe(before)
  })
})

describe('resolveEffectiveDomSnapshotKey', () => {
  it('uses a stable key when dom context is skipped', () => {
    const first = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'character:stale-collapsed',
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
