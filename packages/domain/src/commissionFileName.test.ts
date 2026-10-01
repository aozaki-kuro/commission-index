import { describe, expect, it } from 'vitest'
import { getCommissionFileNameValidationError, parseCommissionFileName } from './commissionFileName'

describe('commissionFileName', () => {
  describe('getCommissionFileNameValidationError', () => {
    it('accepts a date with an optional creator suffix', () => {
      expect(getCommissionFileNameValidationError('20240315')).toBeNull()
      expect(getCommissionFileNameValidationError('20240315_artist-name')).toBeNull()
    })

    it('trims surrounding whitespace before validating', () => {
      expect(getCommissionFileNameValidationError(' 20240315_artist ')).toBeNull()
    })

    it('rejects empty values, extensions, and malformed dates', () => {
      expect(getCommissionFileNameValidationError('')).toBe('File name is required.')
      expect(getCommissionFileNameValidationError('   ')).toBe('File name is required.')
      expect(getCommissionFileNameValidationError('20240315.png')).toBe(
        'File name must not include an image extension.',
      )
      expect(getCommissionFileNameValidationError('2024_artist')).toBe(
        'File name must start with YYYYMMDD, optionally followed by "_creator".',
      )
    })

    it('rejects path traversal and forbidden path characters', () => {
      const expected = 'File name contains forbidden path characters.'
      expect(getCommissionFileNameValidationError('20240315_../artist')).toBe(expected)
      expect(getCommissionFileNameValidationError('20240315_artist/name')).toBe(expected)
      expect(getCommissionFileNameValidationError(`20240315_artist\u0000`)).toBe(expected)
    })
  })

  describe('parseCommissionFileName', () => {
    it('extracts date, year, and creator from a canonical name', () => {
      expect(parseCommissionFileName('20240315_artist-name')).toEqual({
        date: '20240315',
        year: '2024',
        creator: 'artist-name',
      })
    })

    it('returns an empty creator when no suffix is present', () => {
      expect(parseCommissionFileName('20240315')).toEqual({
        date: '20240315',
        year: '2024',
        creator: '',
      })
    })
  })
})
