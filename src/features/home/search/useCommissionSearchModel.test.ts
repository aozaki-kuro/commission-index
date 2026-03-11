import { describe, expect, it } from 'vitest'
import { getDomSnapshotKeyForMode } from './useCommissionSearchModel'

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
