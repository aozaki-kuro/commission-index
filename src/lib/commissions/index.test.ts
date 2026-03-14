import { getCommissionData } from '#data/commissionData'
import { getBaseFileName } from '#lib/utils/strings'
import { describe, expect, it } from 'vitest'
import { collectUniqueCommissions, flattenCommissions, parseCommissionFileName } from './index'

describe('commissions utils (real db sample)', () => {
  const data = getCommissionData()
  const flattened = flattenCommissions(data)

  it('flattens real commission data while preserving character linkage', () => {
    const sourceCount = data.reduce((sum, character) => sum + character.Commissions.length, 0)

    expect(flattened.length).toBe(sourceCount)
    expect(flattened.every(entry => entry.character.length > 0)).toBe(true)
    expect(flattened.every(entry => entry.Hidden !== true)).toBe(true)
  })

  it('deduplicates part/preview variants and keeps sorted unique results', () => {
    const unique = collectUniqueCommissions(flattened)
    const seenBaseNames = new Set<string>()

    expect(unique.length).toBeLessThanOrEqual(flattened.length)

    for (const commission of unique) {
      const baseName = getBaseFileName(commission.fileName)
      expect(seenBaseNames.has(baseName)).toBe(false)
      seenBaseNames.add(baseName)
    }

    expect(unique.map(item => item.fileName)).toEqual(
      unique.map(item => item.fileName).toSorted((a, b) => b.localeCompare(a)),
    )
  })

  it('parses real file names into date/year/creator fields', () => {
    const sample = flattened.find(entry => entry.fileName.length >= 8)

    expect(sample).toBeTruthy()

    const parsed = parseCommissionFileName(sample!.fileName)
    expect(parsed.date).toBe(sample!.fileName.slice(0, 8))
    expect(parsed.year).toBe(parsed.date.slice(0, 4))
    expect(parsed.creator).toBe(sample!.fileName.slice(9))
  })
})
