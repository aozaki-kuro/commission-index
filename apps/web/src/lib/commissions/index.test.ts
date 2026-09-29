import { hasGeneratedFactSourceContent } from '@data/generatedFactSource'
import { describe, expect, it } from 'vitest'
import { collectUniqueCommissions, flattenCommissions } from './index'

const describeRealData = hasGeneratedFactSourceContent() ? describe : describe.skip
const publicId = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`

async function loadRealCommissionFixtures() {
  const { getCommissionData } = await import('@data/commissionData')
  const data = getCommissionData()

  return {
    data,
    flattened: flattenCommissions(data),
  }
}

describeRealData('commission identity', () => {
  it('flattens records with a stable ID and structured metadata', async () => {
    const { data, flattened } = await loadRealCommissionFixtures()
    const sourceCount = data.reduce((sum, character) => sum + character.Commissions.length, 0)

    expect(flattened.length).toBe(sourceCount)
    expect(flattened.every(entry => entry.character.length > 0)).toBe(true)
    expect(flattened.every(entry => Number.isSafeInteger(entry.id) && entry.id > 0)).toBe(true)
    expect(flattened.every(entry => entry.Hidden !== true)).toBe(true)
  })
})

describe('collectUniqueCommissions', () => {
  it('does not collapse legacy series members without a preview marker', () => {
    const commissions = [
      { id: 11, publicId: publicId(11), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'asset-one', seriesKey: 'legacy', workGroupId: null, partNumber: null, Links: [], character: 'Alpha' },
      { id: 12, publicId: publicId(12), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'asset-two', seriesKey: 'legacy', workGroupId: null, partNumber: null, Links: [], character: 'Alpha' },
    ]

    expect(collectUniqueCommissions(commissions).map(item => item.id)).toEqual([12, 11])
  })

  it('folds legacy previews while retaining regular works and sorting by date then internal ID', () => {
    const unique = collectUniqueCommissions([
      { id: 1, publicId: publicId(1), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'asset-one', seriesOrder: 'z-base', Links: [], seriesKey: 'legacy-a', workGroupId: null, partNumber: null, character: 'Alpha' },
      { id: 2, publicId: publicId(2), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'preview-key', seriesOrder: 'a-preview', legacySeriesKind: 'preview', Links: [], seriesKey: 'legacy-a', workGroupId: null, partNumber: null, character: 'Alpha' },
      { id: 3, publicId: publicId(3), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'unrelated', Links: [], workGroupId: null, partNumber: null, character: 'Alpha' },
      { id: 4, publicId: publicId(4), commissionDate: null, creatorName: null, fileName: 'undated', Links: [], workGroupId: null, partNumber: null, character: 'Alpha' },
    ])

    expect(unique.map(item => item.id)).toEqual([3, 1, 4])
  })

  it('retains every legacy numbered part and folds its preview', () => {
    const unique = collectUniqueCommissions([
      { id: 7, publicId: publicId(7), commissionDate: '2024-03-01', creatorName: 'Artist', fileName: 'part-two-key', seriesKey: 'legacy', seriesOrder: 'part-two', workGroupId: publicId(70), partNumber: 2, Links: [], character: 'Alpha' },
      { id: 8, publicId: publicId(8), commissionDate: '2024-03-01', creatorName: 'Artist', fileName: 'part-one-key', seriesKey: 'legacy', seriesOrder: 'part-one', workGroupId: publicId(70), partNumber: 1, Links: [], character: 'Alpha' },
      { id: 9, publicId: publicId(9), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'preview-key', seriesKey: 'legacy', seriesOrder: 'preview', legacySeriesKind: 'preview', workGroupId: null, partNumber: null, Links: [], character: 'Alpha' },
    ])

    expect(unique.map(item => item.id)).toEqual([8, 7])
    expect(unique.map(item => item.publicId)).toEqual([publicId(8), publicId(7)])
  })

  it('keeps two otherwise identical new commissions as separate entries', () => {
    const commissions = [
      { id: 20, publicId: publicId(20), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'opaque-a', workGroupId: publicId(200), partNumber: 1, Links: [], character: 'Alpha' },
      { id: 21, publicId: publicId(21), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'opaque-b', workGroupId: publicId(200), partNumber: 2, Links: [], character: 'Alpha' },
    ]

    expect(collectUniqueCommissions(commissions).map(item => item.id)).toEqual([21, 20])
  })
})
