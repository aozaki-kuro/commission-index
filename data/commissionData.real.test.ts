import { describe, expect, it } from 'vitest'
import { getCommissionData, getCommissionDataMap } from './commissionData'
import { getCharacterRecords } from './commissionRecords'

describe('commission data pipeline (real sqlite snapshot)', () => {
  it('keeps records and page data structurally consistent', () => {
    const records = getCharacterRecords()
    const data = getCommissionData()
    const dataMap = getCommissionDataMap()

    expect(records.length).toBeGreaterThan(0)
    expect(data.length).toBe(records.length)
    expect(dataMap.size).toBe(data.length)

    const recordNames = records.map(record => record.name)
    const dataNames = data.map(entry => entry.Character)

    expect(dataNames).toEqual(recordNames)

    for (const entry of data) {
      expect(dataMap.get(entry.Character)).toEqual(entry)
      expect(entry.Commissions.every(commission => commission.Hidden !== true)).toBe(true)
    }
  })

  it('filters hidden commissions from source records while preserving real-data edge cases', () => {
    const records = getCharacterRecords()
    const data = getCommissionData()

    const allRecordCommissions = records.flatMap(record =>
      record.commissions.map(commission => ({ ...commission, character: record.name })),
    )
    const allVisibleDataCommissions = data.flatMap(entry =>
      entry.Commissions.map(commission => ({ ...commission, character: entry.Character })),
    )

    const hiddenCount = allRecordCommissions.filter(commission => commission.Hidden).length
    const visibleCount = allRecordCommissions.filter(commission => !commission.Hidden).length

    expect(allVisibleDataCommissions).toHaveLength(visibleCount)
    expect(allVisibleDataCommissions.some(commission => commission.Hidden)).toBe(false)

    if (hiddenCount > 0) {
      const hiddenFileNames = new Set(
        allRecordCommissions
          .filter(commission => commission.Hidden)
          .map(commission => commission.fileName),
      )
      expect(
        allVisibleDataCommissions.some(commission => hiddenFileNames.has(commission.fileName)),
      ).toBe(false)
    }

    expect(allRecordCommissions.some(commission => !commission.fileName.includes('_'))).toBe(true)
    expect(
      allRecordCommissions.some(commission => /\(part\s+\d+\)$/i.test(commission.fileName)),
    ).toBe(true)
    expect(allRecordCommissions.some(commission => !!commission.Keyword?.trim())).toBe(true)
  })
})
