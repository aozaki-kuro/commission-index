import { describe, expect, it } from 'vitest'
import { parseCommissionLinksJson } from './commissionLinks'
import { dedupeKeywords, normalizeKeyword, normalizeKeywordBaseTerm, normalizeKeywordKey } from './keywordAliases'
import { buildPopularKeywordPoolFromSuggestTexts } from './popularKeywords'
import { sortCommissionsByDate } from './timeline'
import { CANONICAL_UUID_PATTERN, isUuidV4 } from './uuid'

// Pins the behaviour of helpers that web, admin, the worker and the export script used to copy.
describe('keyword normalisation', () => {
  it('collapses whitespace, keeps case, and returns empty (not null) for blank input', () => {
    expect(normalizeKeyword('  blue \t\n dragon ')).toBe('blue dragon')
    expect(normalizeKeyword('   ')).toBe('')
    expect(normalizeKeywordKey(' Blue  Dragon ')).toBe('blue dragon')
    expect(normalizeKeywordBaseTerm('   ')).toBeNull()
  })

  it('dedupes case-insensitively, keeping the first spelling and order', () => {
    expect(dedupeKeywords([
      ' Blue  Dragon',
      'blue dragon',
      '',
      '  ',
      'Red',
      'BLUE DRAGON',
      'red ',
    ])).toEqual([
      'Blue Dragon',
      'Red',
    ])
  })

  it('caps the result without counting blank or duplicate entries', () => {
    expect(dedupeKeywords(['a', '', 'A', 'b', 'c'], 2)).toEqual([
      'a',
      'b',
    ])
    expect(dedupeKeywords(new Set([
      'x',
      'y',
    ]))).toEqual([
      'x',
      'y',
    ])
  })
})

describe('buildPopularKeywordPoolFromSuggestTexts', () => {
  it('ranks by entry count, then by localeCompare, skipping Date rows and extra creators per entry', () => {
    const pool = buildPopularKeywordPoolFromSuggestTexts([
      'Creator\tAlice (part 1)\nCreator\tBob\nKeyword\tblue\nDate\t2024',
      'Creator\tBob\nKeyword\tBlue\nCharacter\tLucia',
      'Keyword\tred\nDate\t2024',
    ], 10)

    expect(pool).toEqual([
      // 'blue' is counted twice and keeps its first spelling.
      'blue',
      // Alice: '(part N)' stripped; Bob counted once (second entry's primary creator only).
      'Alice',
      'Bob',
      'Lucia',
      'red',
    ])
  })

  it('applies the caller limit after ranking', () => {
    expect(buildPopularKeywordPoolFromSuggestTexts([
      'Keyword\tb',
      'Keyword\tb\nKeyword\ta',
      'Keyword\tc',
    ], 2)).toEqual([
      'b',
      'a',
    ])
  })
})

describe('parseCommissionLinksJson', () => {
  it('returns [] for empty, null, non-array and malformed values', () => {
    expect(parseCommissionLinksJson('')).toEqual([])
    expect(parseCommissionLinksJson(null)).toEqual([])
    expect(parseCommissionLinksJson(undefined)).toEqual([])
    expect(parseCommissionLinksJson('[]')).toEqual([])
    expect(parseCommissionLinksJson('{"a":1}')).toEqual([])
    expect(parseCommissionLinksJson('not json')).toEqual([])
    expect(parseCommissionLinksJson('', { dropBlank: true })).toEqual([])
  })

  it('keeps items verbatim (stringified) by default', () => {
    expect(parseCommissionLinksJson('[" https://a.example ","",1]')).toEqual([
      ' https://a.example ',
      '',
      '1',
    ])
  })

  it('trims and drops blank items with dropBlank', () => {
    expect(parseCommissionLinksJson('[" https://a.example ","","  ",1]', { dropBlank: true })).toEqual([
      'https://a.example',
      '1',
    ])
  })
})

describe('uuid patterns', () => {
  it('isUuidV4 accepts only lowercase, anchored v4', () => {
    expect(isUuidV4('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(true)
    expect(isUuidV4('A1B2C3D4-E5F6-4789-A012-3456789ABCDE')).toBe(false)
    expect(isUuidV4('a1b2c3d4-e5f6-1789-a012-3456789abcde')).toBe(false)
    expect(isUuidV4('a1b2c3d4-e5f6-4789-c012-3456789abcde')).toBe(false)
    expect(isUuidV4('xa1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(false)
    expect(isUuidV4('a1b2c3d4-e5f6-4789-a012-3456789abcdex')).toBe(false)
  })

  it('canonical pattern also accepts lowercase versions 1-8', () => {
    expect(CANONICAL_UUID_PATTERN.test('a1b2c3d4-e5f6-1789-a012-3456789abcde')).toBe(true)
    expect(CANONICAL_UUID_PATTERN.test('a1b2c3d4-e5f6-8789-b012-3456789abcde')).toBe(true)
    expect(CANONICAL_UUID_PATTERN.test('a1b2c3d4-e5f6-9789-a012-3456789abcde')).toBe(false)
    expect(CANONICAL_UUID_PATTERN.test('A1B2C3D4-E5F6-4789-A012-3456789ABCDE')).toBe(false)
  })
})

describe('sortCommissionsByDate', () => {
  it('orders newest date first, then higher id, with null dates last', () => {
    const rows = [
      { id: 1, commissionDate: '2024-01-01' },
      { id: 2, commissionDate: null },
      { id: 3, commissionDate: '2024-01-01' },
      { id: 4, commissionDate: '2025-06-01' },
      { id: 5, commissionDate: null },
    ]
    expect(rows.toSorted(sortCommissionsByDate).map(row => row.id)).toEqual([
      4,
      3,
      1,
      5,
      2,
    ])
  })
})
