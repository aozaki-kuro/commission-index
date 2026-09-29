import { describe, expect, it } from 'vitest'
import { buildHomeUpdateSummary } from './updateSummary'

describe('buildHomeUpdateSummary', () => {
  it('counts legacy series while building links and labels from stable identity fields', () => {
    const summary = buildHomeUpdateSummary([
      {
        Character: 'Alpha',
        Commissions: [
          { id: 1, publicId: '00000000-0000-4000-8000-000000000001', commissionDate: '2024-02-01', creatorName: 'Artist', seriesKey: 'legacy', seriesOrder: 'old-name', fileName: 'old-name', workGroupId: null, partNumber: null, Links: [] },
          { id: 2, publicId: '00000000-0000-4000-8000-000000000002', commissionDate: '2024-02-01', creatorName: 'Artist', seriesKey: 'legacy', fileName: 'preview-key', legacySeriesKind: 'preview', seriesOrder: 'z-preview', workGroupId: null, partNumber: null, Links: [] },
          { id: 3, publicId: '00000000-0000-4000-8000-000000000003', commissionDate: null, creatorName: null, fileName: 'undated-asset', workGroupId: null, partNumber: null, Links: [] },
        ],
      },
    ], ['Alpha'])

    expect(summary.totalCommissions).toBe(2)
    expect(summary.entries[0]).toEqual({
      key: '00000000-0000-4000-8000-000000000002',
      character: 'Alpha',
      href: '#alpha-commission-00000000-0000-4000-8000-000000000002',
      dateLabel: '2024/02/01',
    })
  })
})
