import { describe, expect, it } from 'vitest'
import {
  buildDateSearchTokensFromCompactDate,
  normalizeDateQueryToken,
  parseDateSearchInput,
  toDateSearchTokens,
  toPrimaryDateSearchToken,
} from './dateSearch'

describe('dateSearch', () => {
  describe('parseDateSearchInput', () => {
    it('parses compact date YYYYMMDD', () => {
      expect(parseDateSearchInput('20240315')).toEqual({ year: '2024', month: '03' })
    })

    it('parses delimited year-month YYYY-MM', () => {
      expect(parseDateSearchInput('2024-03')).toEqual({ year: '2024', month: '03' })
      expect(parseDateSearchInput('2024/3')).toEqual({ year: '2024', month: '03' })
      expect(parseDateSearchInput('2024.03')).toEqual({ year: '2024', month: '03' })
    })

    it('parses delimited month-year MM-YYYY', () => {
      expect(parseDateSearchInput('3-2024')).toEqual({ year: '2024', month: '03' })
      expect(parseDateSearchInput('03/2024')).toEqual({ year: '2024', month: '03' })
    })

    it('parses year-only YYYY', () => {
      expect(parseDateSearchInput('2024')).toEqual({ year: '2024' })
    })

    it('rejects invalid month', () => {
      expect(parseDateSearchInput('20241315')).toBeNull()
      expect(parseDateSearchInput('2024-13')).toBeNull()
      expect(parseDateSearchInput('2024-00')).toBeNull()
    })

    it('rejects invalid year', () => {
      expect(parseDateSearchInput('999-01')).toBeNull()
      expect(parseDateSearchInput('999901')).toBeNull()
    })

    it('handles empty or invalid input', () => {
      expect(parseDateSearchInput('')).toBeNull()
      expect(parseDateSearchInput('   ')).toBeNull()
      expect(parseDateSearchInput('abc')).toBeNull()
      expect(parseDateSearchInput('2024-MM')).toBeNull()
    })
  })

  describe('toDateSearchTokens', () => {
    it('generates year token for year-only', () => {
      expect(toDateSearchTokens({ year: '2024' })).toEqual(['date_y_2024'])
    })

    it('generates year and year-month tokens', () => {
      expect(toDateSearchTokens({ year: '2024', month: '03' })).toEqual([
        'date_y_2024',
        'date_ym_2024_03',
      ])
    })
  })

  describe('toPrimaryDateSearchToken', () => {
    it('returns year token when month absent', () => {
      expect(toPrimaryDateSearchToken({ year: '2024' })).toBe('date_y_2024')
    })

    it('returns year-month token when month present', () => {
      expect(toPrimaryDateSearchToken({ year: '2024', month: '03' })).toBe('date_ym_2024_03')
    })
  })

  describe('buildDateSearchTokensFromCompactDate', () => {
    it('builds tokens from valid compact date', () => {
      expect(buildDateSearchTokensFromCompactDate('20240315')).toEqual([
        'date_y_2024',
        'date_ym_2024_03',
      ])
    })

    it('returns empty array for invalid compact date', () => {
      expect(buildDateSearchTokensFromCompactDate('invalid')).toEqual([])
      expect(buildDateSearchTokensFromCompactDate('')).toEqual([])
    })
  })

  describe('normalizeDateQueryToken', () => {
    it('normalizes to primary token', () => {
      expect(normalizeDateQueryToken('2024-03-15')).toBe('date_ym_2024_03')
      expect(normalizeDateQueryToken('2024')).toBe('date_y_2024')
    })

    it('returns null for invalid input', () => {
      expect(normalizeDateQueryToken('invalid')).toBeNull()
      expect(normalizeDateQueryToken('')).toBeNull()
    })
  })
})
