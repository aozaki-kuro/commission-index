import type { Props } from '#data/types'
import { describe, expect, it } from 'vitest'
import {
  collectUniqueCommissions,
  filterHiddenCommissions,
  flattenCommissions,
  mergePartsAndPreviews,
  parseCommissionFileName,
  sortCommissionsByDate,
} from './index'

describe('commissions utils', () => {
  it('filters hidden commissions while preserving visible entries', () => {
    const source: Props = [
      {
        Character: 'A',
        Commissions: [
          { fileName: '20240101 foo', Links: [], Hidden: true },
          { fileName: '20240102 bar', Links: [] },
        ],
      },
    ]

    expect(filterHiddenCommissions(source)).toEqual([
      {
        Character: 'A',
        Commissions: [{ fileName: '20240102 bar', Links: [] }],
      },
    ])
  })

  it('merges part/preview variants and keeps the latest file name', () => {
    const merged = mergePartsAndPreviews([
      { fileName: '20240101 Alice (part 1)', Links: [] },
      { fileName: '20240101 Alice (part 2)', Links: [] },
      { fileName: '20240102 Bob (preview)', Links: [] },
    ])

    expect(merged.size).toBe(2)
    expect(merged.get('20240101 Alice')?.fileName).toBe('20240101 Alice (part 2)')
    expect(merged.get('20240102 Bob')?.fileName).toBe('20240102 Bob (preview)')
  })

  it('sorts by descending file name (newest first)', () => {
    const sorted = [
      { fileName: '20240101 A', Links: [] },
      { fileName: '20240203 B', Links: [] },
      { fileName: '20231201 C', Links: [] },
    ].sort(sortCommissionsByDate)

    expect(sorted.map(item => item.fileName)).toEqual(['20240203 B', '20240101 A', '20231201 C'])
  })

  it('parses file name into date/year/creator fields', () => {
    expect(parseCommissionFileName('20240203 Artist')).toEqual({
      date: '20240203',
      year: '2024',
      creator: 'Artist',
    })

    expect(parseCommissionFileName('20240203')).toEqual({
      date: '20240203',
      year: '2024',
      creator: '',
    })
  })

  it('flattens with optional predicate and preserves character metadata', () => {
    const source: Props = [
      {
        Character: 'A',
        Commissions: [{ fileName: '20240101 A1', Links: [] }],
      },
      {
        Character: 'B',
        Commissions: [{ fileName: '20240102 B1', Links: [] }],
      },
    ]

    expect(flattenCommissions(source, entry => entry.Character === 'B')).toEqual([
      { fileName: '20240102 B1', Links: [], character: 'B' },
    ])
  })

  it('collects unique commissions and returns sorted latest versions', () => {
    const result = collectUniqueCommissions([
      { character: 'A', fileName: '20240101 Foo (part 1)', Links: [] },
      { character: 'A', fileName: '20240101 Foo (part 2)', Links: [] },
      { character: 'B', fileName: '20240203 Bar', Links: [] },
    ])

    expect(result.map(item => item.fileName)).toEqual(['20240203 Bar', '20240101 Foo (part 2)'])
    expect(result[1]?.character).toBe('A')
  })
})
