import { describe, expect, it } from 'vitest'
import { compareCommissionsByDate, getCommissionDisplayLabel } from './commissionPresentation'

describe('commission presentation helpers', () => {
  it('sorts by delivery date descending and uses id for same-day entries', () => {
    const rows = [
      { id: 2, commissionDate: '2025-03-02', creatorName: null },
      { id: 7, commissionDate: '2025-03-02', creatorName: 'Artist' },
      { id: 9, commissionDate: null, creatorName: 'Unknown' },
      { id: 3, commissionDate: '2024-12-01', creatorName: 'Artist' },
    ]

    expect(rows.toSorted(compareCommissionsByDate).map(row => row.id)).toEqual([7, 2, 3, 9])
  })

  it('keeps same-day and unknown-creator records distinguishable', () => {
    expect(getCommissionDisplayLabel({
      id: 14,
      commissionDate: '2025-03-02',
      creatorName: null,
    })).toBe('2025-03-02 · Unknown creator · #14')
  })
})
