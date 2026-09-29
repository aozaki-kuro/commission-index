import { describe, expect, it } from 'vitest'
import { compareCommissionsByDate, getCommissionDisplayLabel } from './commissionPresentation'

describe('commission presentation helpers', () => {
  it('sorts by delivery date descending and uses id for same-day entries', () => {
    const rows = [
      { id: 2, publicId: 'bbbbbbbb-2222-4222-8222-222222222222', commissionDate: '2025-03-02', creatorName: null },
      { id: 7, publicId: 'aaaaaaa7-2222-4222-8222-222222222222', commissionDate: '2025-03-02', creatorName: 'Artist' },
      { id: 9, publicId: '99999999-2222-4222-8222-222222222222', commissionDate: null, creatorName: 'Unknown' },
      { id: 3, publicId: '33333333-2222-4222-8222-222222222222', commissionDate: '2024-12-01', creatorName: 'Artist' },
    ]

    expect(rows.toSorted(compareCommissionsByDate).map(row => row.id)).toEqual([7, 2, 3, 9])
  })

  it('keeps same-day and unknown-creator records distinguishable', () => {
    expect(getCommissionDisplayLabel({
      id: 14,
      publicId: 'e593b69b-9e23-4433-877e-4cf0a869e17f',
      commissionDate: '2025-03-02',
      creatorName: null,
    })).toBe('2025-03-02 · Anon · #e593b69b9e23')
  })
})
