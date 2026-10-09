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

  it('treats empty and null dates as undated and groups years in descending date order', () => {
    const commission = (id: number, commissionDate: string | null) => ({
      id,
      publicId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
      commissionDate,
      creatorName: null,
      fileName: `opaque-${id}`,
      workGroupId: null,
      partNumber: null,
      Links: [],
    })
    const timeline = buildCommissionTimeline(new Map([
      ['alpha', { Character: 'Alpha', Commissions: [commission(1, ''), commission(2, '2024-01-01'), commission(3, null)] }],
      ['beta', { Character: 'Beta', Commissions: [commission(4, '2025-06-01'), commission(5, '2024-02-01')] }],
    ]))

    expect(timeline.groups.map(group => group.yearKey)).toEqual(['2025', '2024'])
    expect(timeline.groups[1].entries.map(entry => entry.commission.id)).toEqual([5, 2])
    expect(timeline.navItems.map(item => item.sectionId)).toEqual(['timeline-year-2025', 'timeline-year-2024'])
  })
})
