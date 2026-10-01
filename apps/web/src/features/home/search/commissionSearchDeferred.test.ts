// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  collapseAliasKeywordVariants,
  createSeededRandom,
  getPopularKeywordBatch,
  parseHomeSearchEntries,
  shuffleKeywords,
} from './commissionSearchDeferred'

describe('parseHomeSearchEntries', () => {
  it('uses UUID identity from the public payload and assigns an internal search index', () => {
    const publicId = '00000000-0000-4000-8000-000000000001'
    const entries = parseHomeSearchEntries([{ publicId, domKey: `alpha::${publicId}`, searchText: 'alpha artist' }])

    expect(entries).toEqual([{
      id: 0,
      publicId,
      domKey: `alpha::${publicId}`,
      searchText: 'alpha artist',
      searchSuggest: undefined,
    }])
    expect(() => parseHomeSearchEntries([{ id: 1, domKey: 'alpha::1', searchText: 'alpha artist' }])).toThrow(/public commission identity/)
  })
})

describe('createSeededRandom', () => {
  it('returns deterministic values for the same seed', () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(42)
    const valuesA = Array.from({ length: 10 }, () => a())
    const valuesB = Array.from({ length: 10 }, () => b())
    expect(valuesA).toEqual(valuesB)
  })

  it('returns different values for different seeds', () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(99)
    const valuesA = Array.from({ length: 5 }, () => a())
    const valuesB = Array.from({ length: 5 }, () => b())
    expect(valuesA).not.toEqual(valuesB)
  })

  it('returns values in [0, 1)', () => {
    const random = createSeededRandom(123)
    for (let i = 0; i < 100; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffleKeywords', () => {
  it('preserves the same length and all elements', () => {
    const keywords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    const result = shuffleKeywords(keywords, 42)
    expect(result).toHaveLength(keywords.length)
    expect(result.toSorted()).toEqual(keywords.toSorted())
  })

  it('is deterministic for the same seed', () => {
    const keywords = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const a = shuffleKeywords(keywords, 77)
    const b = shuffleKeywords(keywords, 77)
    expect(a).toEqual(b)
  })

  it('does not mutate the original array', () => {
    const keywords = ['x', 'y', 'z']
    const copy = [...keywords]
    shuffleKeywords(keywords, 1)
    expect(keywords).toEqual(copy)
  })
})

describe('getPopularKeywordBatch', () => {
  it('returns all keywords when pool is smaller than batch size', () => {
    const keywords = ['a', 'b', 'c']
    const result = getPopularKeywordBatch(keywords, 0, 6)
    expect(result).toBe(keywords)
  })

  it('returns a subset of batch size when pool is larger', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `kw-${i}`)
    const result = getPopularKeywordBatch(keywords, 0, 6)
    expect(result).toHaveLength(6)
  })

  it('returns different subsets for different pages', () => {
    const keywords = Array.from({ length: 30 }, (_, i) => `kw-${i}`)
    const page0 = getPopularKeywordBatch(keywords, 0, 6)
    const page1 = getPopularKeywordBatch(keywords, 1, 6)
    expect(page0).not.toEqual(page1)
  })

  it('is deterministic for the same page', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `kw-${i}`)
    const a = getPopularKeywordBatch(keywords, 3, 6)
    const b = getPopularKeywordBatch(keywords, 3, 6)
    expect(a).toEqual(b)
  })
})

describe('collapseAliasKeywordVariants', () => {
  it('returns keywords unchanged when no alias groups', () => {
    const keywords = ['cat', 'dog', 'bird']
    const result = collapseAliasKeywordVariants(keywords, [], 42)
    expect(result).toBe(keywords)
  })

  it('returns keywords unchanged when keywords are empty', () => {
    const result = collapseAliasKeywordVariants(
      [],
      [{ term: 'cat', aliases: ['kitty'] }],
      42,
    )
    expect(result).toHaveLength(0)
  })

  it('collapses alias variants into a single representative', () => {
    const keywords = ['Cat', 'Kitty', 'Dog']
    const aliasGroups = [{ term: 'Cat', aliases: ['Kitty'] }]
    const result = collapseAliasKeywordVariants(keywords, aliasGroups, 42)
    // One of Cat/Kitty should remain, Dog always present
    expect(result).toContain('Dog')
    expect(result.filter(k => k === 'Cat' || k === 'Kitty')).toHaveLength(1)
    expect(result).toHaveLength(2)
  })

  it('is deterministic for the same seed', () => {
    const keywords = ['Alpha', 'Bravo', 'alpha', 'Charlie']
    const aliasGroups = [{ term: 'Alpha', aliases: ['Bravo'] }]
    const a = collapseAliasKeywordVariants(keywords, aliasGroups, 99)
    const b = collapseAliasKeywordVariants(keywords, aliasGroups, 99)
    expect(a).toEqual(b)
  })

  it('preserves non-aliased keywords', () => {
    const keywords = ['Red', 'Blue', 'Green']
    const aliasGroups = [{ term: 'Yellow', aliases: ['Gold'] }]
    const result = collapseAliasKeywordVariants(keywords, aliasGroups, 42)
    expect(result).toEqual(['Red', 'Blue', 'Green'])
  })
})
