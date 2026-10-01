import type { CommissionWithCharacter } from './index'
import { hasGeneratedFactSourceContent } from '@data/generatedFactSource'
import { describe, expect, it } from 'vitest'
import { collectUniqueCommissions, flattenCommissions } from './index'

const describeRealData = hasGeneratedFactSourceContent() ? describe : describe.skip
const publicId = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`

function makeCommission({ id, ...overrides }: Partial<CommissionWithCharacter> & Pick<CommissionWithCharacter, 'id'>): CommissionWithCharacter {
  return { id, publicId: publicId(id), commissionDate: '2024-02-01', creatorName: 'Artist', fileName: `asset-${id}`, workGroupId: null, partNumber: null, Links: [], character: 'Alpha', ...overrides }
}

describeRealData('commission identity', () => {
  it('flattens records with a stable ID and structured metadata', async () => {
    const { getCommissionData } = await import('@data/commissionData')
    const data = getCommissionData()
    const flattened = flattenCommissions(data)
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
      makeCommission({ id: 11, fileName: 'asset-one', seriesKey: 'legacy' }),
      makeCommission({ id: 12, fileName: 'asset-two', seriesKey: 'legacy' }),
    ]

    expect(collectUniqueCommissions(commissions).map(item => item.id)).toEqual([12, 11])
  })

  it('folds legacy previews while retaining regular works and sorting by date then internal ID', () => {
    const unique = collectUniqueCommissions([
      makeCommission({ id: 1, fileName: 'asset-one', seriesOrder: 'z-base', seriesKey: 'legacy-a' }),
      makeCommission({ id: 2, fileName: 'preview-key', seriesOrder: 'a-preview', legacySeriesKind: 'preview', seriesKey: 'legacy-a' }),
      makeCommission({ id: 3, fileName: 'unrelated' }),
      makeCommission({ id: 4, commissionDate: null, creatorName: null, fileName: 'undated' }),
    ])

    expect(unique.map(item => item.id)).toEqual([3, 1, 4])
  })

  it('retains every legacy numbered part and folds its preview', () => {
    const unique = collectUniqueCommissions([
      makeCommission({ id: 7, commissionDate: '2024-03-01', fileName: 'part-two-key', seriesKey: 'legacy', seriesOrder: 'part-two', workGroupId: publicId(70), partNumber: 2 }),
      makeCommission({ id: 8, commissionDate: '2024-03-01', fileName: 'part-one-key', seriesKey: 'legacy', seriesOrder: 'part-one', workGroupId: publicId(70), partNumber: 1 }),
      makeCommission({ id: 9, commissionDate: '2024-02-01', fileName: 'preview-key', seriesKey: 'legacy', seriesOrder: 'preview', legacySeriesKind: 'preview' }),
    ])

    expect(unique.map(item => item.id)).toEqual([8, 7])
    expect(unique.map(item => item.publicId)).toEqual([publicId(8), publicId(7)])
  })

  it('keeps two otherwise identical new commissions as separate entries', () => {
    const commissions = [
      makeCommission({ id: 20, fileName: 'opaque-a', workGroupId: publicId(200), partNumber: 1 }),
      makeCommission({ id: 21, fileName: 'opaque-b', workGroupId: publicId(200), partNumber: 2 }),
    ]

    expect(collectUniqueCommissions(commissions).map(item => item.id)).toEqual([21, 20])
  })
})
