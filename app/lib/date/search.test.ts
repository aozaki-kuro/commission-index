import { describe, expect, it } from 'vitest'
import {
  buildDateSearchTokensFromCompactDate,
  normalizeDateQueryToken,
  parseDateSearchInput,
  toDateSearchTokens,
} from './search'

describe('dateSearch utils', () => {
  it('parses supported query date formats into normalized parts', () => {
    expect(parseDateSearchInput('20250914')).toEqual({
      year: '2025',
      month: '09',
    })
    expect(parseDateSearchInput('2025/9/14')).toEqual({
      year: '2025',
      month: '09',
    })
    expect(parseDateSearchInput('2025-09')).toEqual({
      year: '2025',
      month: '09',
    })
    expect(parseDateSearchInput('09/2025')).toEqual({
      year: '2025',
      month: '09',
    })
    expect(parseDateSearchInput('2025')).toEqual({ year: '2025' })
  })

  it('rejects invalid dates', () => {
    expect(parseDateSearchInput('2025-13')).toBeNull()
    expect(parseDateSearchInput('2025-00-01')).toBeNull()
  })

  it('builds hierarchical date tokens', () => {
    expect(
      toDateSearchTokens({
        year: '2025',
        month: '09',
      }),
    ).toEqual(['date_y_2025', 'date_ym_2025_09'])
  })

  it('returns date search tokens from compact date strings', () => {
    expect(buildDateSearchTokensFromCompactDate('20250914')).toEqual([
      'date_y_2025',
      'date_ym_2025_09',
    ])
    expect(buildDateSearchTokensFromCompactDate('invalid')).toEqual([])
  })

  it('normalizes query dates to a primary token', () => {
    expect(normalizeDateQueryToken('2025')).toBe('date_y_2025')
    expect(normalizeDateQueryToken('09/2025')).toBe('date_ym_2025_09')
    expect(normalizeDateQueryToken('2025/09/14')).toBe('date_ym_2025_09')
  })
})
