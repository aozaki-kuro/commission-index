import { describe, expect, it } from 'vitest'
import {
  getDomSnapshotKeyForMode,
  resolveEffectiveDomSnapshotKey,
} from './useCommissionSearchModel'

describe('getDomSnapshotKeyForMode', () => {
  it('changes character snapshot key only when staleLoaded changes', () => {
    const before = getDomSnapshotKeyForMode({
      mode: 'character',
      staleLoaded: false,
      timelineLoaded: false,
    })
    const unrelatedTimelineChange = getDomSnapshotKeyForMode({
      mode: 'character',
      staleLoaded: false,
      timelineLoaded: true,
    })
    const staleChange = getDomSnapshotKeyForMode({
      mode: 'character',
      staleLoaded: true,
      timelineLoaded: true,
    })

    expect(before).toBe(unrelatedTimelineChange)
    expect(staleChange).not.toBe(before)
  })

  it('changes timeline snapshot key only when timelineLoaded changes', () => {
    const before = getDomSnapshotKeyForMode({
      mode: 'timeline',
      staleLoaded: false,
      timelineLoaded: false,
    })
    const unrelatedStaleChange = getDomSnapshotKeyForMode({
      mode: 'timeline',
      staleLoaded: true,
      timelineLoaded: false,
    })
    const timelineChange = getDomSnapshotKeyForMode({
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
