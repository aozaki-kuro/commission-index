import { hasGeneratedFactSourceContent } from '@data/generatedFactSource'
import { describe, expect, it } from 'vitest'
import { collectUniqueCommissions, flattenCommissions } from './index'

const describeRealData = hasGeneratedFactSourceContent() ? describe : describe.skip

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
  it('merges only explicit legacy series and sorts by structured date then ID', () => {
    const unique = collectUniqueCommissions([
      { id: 1, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'asset-one', Links: [], seriesKey: 'legacy-a', character: 'Alpha' },
      { id: 2, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'asset-two', Links: [], seriesKey: 'legacy-a', character: 'Alpha' },
      { id: 3, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'unrelated', Links: [], character: 'Alpha' },
      { id: 4, commissionDate: null, creatorName: null, fileName: 'undated', Links: [], character: 'Alpha' },
    ])

    expect(unique.map(item => item.id)).toEqual([3, 2, 4])
  })

  it('keeps the historical filename-descending winner through exported seriesOrder', () => {
    const unique = collectUniqueCommissions([
      { id: 8, commissionDate: '2024-03-01', creatorName: 'Artist', fileName: '20240301_artist (part 2)', seriesKey: 'legacy', seriesOrder: '20240301_artist (part 2)', Links: [], character: 'Alpha' },
      { id: 9, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: '20240301_artist (preview)', seriesKey: 'legacy', seriesOrder: '20240301_artist (preview)', Links: [], character: 'Alpha' },
    ])

    expect(unique.map(item => item.id)).toEqual([9])
  })

  it('keeps two otherwise identical new commissions as separate entries', () => {
    const commissions = [
      { id: 20, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'opaque-a', Links: [], character: 'Alpha' },
      { id: 21, commissionDate: '2024-02-01', creatorName: 'Artist', fileName: 'opaque-b', Links: [], character: 'Alpha' },
    ]

    expect(collectUniqueCommissions(commissions).map(item => item.id)).toEqual([21, 20])
  })
})
