import { describe, expect, it } from 'vitest'
import { buildCommissionTimeline } from './timeline'

describe('buildCommissionTimeline', () => {
  it('groups by explicit commission date and sorts by date then ID', () => {
    const timeline = buildCommissionTimeline(new Map([
      ['alpha', {
        Character: 'Alpha',
        Commissions: [
          { id: 1, publicId: '00000000-0000-4000-8000-000000000001', commissionDate: '2024-01-01', creatorName: null, fileName: '19990101_wrong-year', workGroupId: null, partNumber: null, Links: [] },
          { id: 3, publicId: '00000000-0000-4000-8000-000000000003', commissionDate: '2024-02-01', creatorName: null, fileName: 'opaque-c', workGroupId: null, partNumber: null, Links: [] },
          { id: 2, publicId: '00000000-0000-4000-8000-000000000002', commissionDate: '2024-02-01', creatorName: null, fileName: 'opaque-b', workGroupId: null, partNumber: null, Links: [] },
          { id: 4, publicId: '00000000-0000-4000-8000-000000000004', commissionDate: null, creatorName: null, fileName: '20990101_undated', workGroupId: null, partNumber: null, Links: [] },
        ],
      }],
    ]))

    expect(timeline.groups.map(group => group.yearKey)).toEqual(['2024'])
    expect(timeline.groups[0].entries.map(entry => entry.commission.id)).toEqual([3, 2, 1])
    expect(timeline.navItems).toHaveLength(1)
  })
})
