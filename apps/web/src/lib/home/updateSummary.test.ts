import { describe, expect, it } from 'vitest'
import { buildHomeUpdateSummary } from './updateSummary'

describe('buildHomeUpdateSummary', () => {
  it('counts legacy series while building links and labels from stable identity fields', () => {
    const summary = buildHomeUpdateSummary([
      {
        Character: 'Alpha',
        Commissions: [
          { id: 1, commissionDate: '2024-02-01', creatorName: 'Artist', seriesKey: 'legacy', fileName: '20240201_old-name', Links: [] },
          { id: 2, commissionDate: '2024-02-01', creatorName: 'Artist', seriesKey: 'legacy', fileName: 'renamed-image-key', Links: [] },
          { id: 3, commissionDate: null, creatorName: null, fileName: 'undated-asset', Links: [] },
        ],
      },
    ], ['Alpha'])

    expect(summary.totalCommissions).toBe(2)
    expect(summary.entries[0]).toEqual({
      key: '2',
      character: 'Alpha',
      href: '#alpha-commission-2',
      dateLabel: '2024/02/01',
    })
  })
})
