import type Fuse from 'fuse.js'
import type { SearchEntryLike, SearchIndexLike, Suggestion, SuggestionEntryLike } from './search'
import { describe, expect, it, vi } from 'vitest'
import {
  applySuggestionToQuery,
  buildStrictTermIndex,
  collectSuggestions,
  createSearchIndex,
  filterSuggestions,
  getMatchedEntryIds,
  hydrateSearchIndexFuse,
  normalizeQuotedTokenBoundary,
  normalizeSuggestionTerm,
  parseSuggestionInputState,
  parseSuggestionRows,
  resolveSuggestionContextMatchedIds,
} from './search'

type Entry = SearchEntryLike

const sortedIds = (ids: Set<number>) => [...ids].sort((a, b) => a - b)

function buildStrictIndex(entries: Entry[], fuse: Fuse<Entry> | null = null): SearchIndexLike<Entry> {
  return {
    cacheKey: entries,
    entries,
    allIds: new Set(entries.map(entry => entry.id)),
    strictTermIndex: buildStrictTermIndex(entries),
    fuse,
  }
}

describe('search strict matching', () => {
  const entries: Entry[] = [
    { id: 1, searchText: 'lucia blue dragon' },
    { id: 2, searchText: 'lucia red dragon' },
    { id: 3, searchText: 'max red wolf' },
    { id: 4, searchText: 'alpha date_ym_2024_02 date_y_2024' },
  ]
  const index = buildStrictIndex(entries)

  it('matches a single term by its indexed word only (not substrings)', () => {
    // "max" is a term of id 3; the substring inside "alpha" must not match.
    expect(sortedIds(getMatchedEntryIds('max', index))).toEqual([3])
  })

  it('matches partial prefixes and unions every matching term', () => {
    expect(sortedIds(getMatchedEntryIds('luc', index))).toEqual([1, 2])
    expect(sortedIds(getMatchedEntryIds('dra', index))).toEqual([1, 2])
  })

  it('prefers an exact indexed term over longer terms sharing the prefix', () => {
    const prefixEntries: Entry[] = [
      { id: 1, searchText: 'lucia' },
      { id: 2, searchText: 'lucian' },
    ]
    const prefixIndex = buildStrictIndex(prefixEntries)

    expect(sortedIds(getMatchedEntryIds('lucia', prefixIndex))).toEqual([1])
    expect(sortedIds(getMatchedEntryIds('luci', prefixIndex))).toEqual([1, 2])
  })

  it('intersects implicit AND terms and supports explicit OR', () => {
    expect(sortedIds(getMatchedEntryIds('blue dragon', index))).toEqual([1])
    expect(sortedIds(getMatchedEntryIds('blue | wolf', index))).toEqual([1, 3])
  })

  it('applies negation, including when it is the first term', () => {
    expect(sortedIds(getMatchedEntryIds('dragon !red', index))).toEqual([1])
    expect(sortedIds(getMatchedEntryIds('!dragon', index))).toEqual([3, 4])
    expect(sortedIds(getMatchedEntryIds('blue | !dragon', index))).toEqual([1, 3, 4])
  })

  it('matches quoted phrases as a word sequence instead of separate terms', () => {
    expect(sortedIds(getMatchedEntryIds('"red dragon"', index))).toEqual([2])
  })

  it('normalizes case and date-like tokens before matching', () => {
    expect(sortedIds(getMatchedEntryIds('LUCIA', index))).toEqual([1, 2])
    expect(sortedIds(getMatchedEntryIds('2024/02', index))).toEqual([4])
    expect(sortedIds(getMatchedEntryIds('2024', index))).toEqual([4])
  })

  it('returns every entry for empty, whitespace-only, or operator-only queries', () => {
    expect(sortedIds(getMatchedEntryIds('', index))).toEqual([1, 2, 3, 4])
    expect(sortedIds(getMatchedEntryIds('   ', index))).toEqual([1, 2, 3, 4])
    expect(sortedIds(getMatchedEntryIds('|', index))).toEqual([1, 2, 3, 4])
  })

  it('returns an empty set when no entry has an index', () => {
    expect(sortedIds(getMatchedEntryIds('lucia', buildStrictIndex([])))).toEqual([])
  })
})

describe('search index cache', () => {
  it('reuses the index object for the same entries array and falls back to fuzzy search on a strict miss', () => {
    const entries: Entry[] = [{ id: 1, searchText: 'lucia' }]
    const index = createSearchIndex(entries)

    expect(createSearchIndex(entries)).toBe(index)
    expect(sortedIds(getMatchedEntryIds('luc', index))).toEqual([1])

    const fuse = {
      search: vi.fn(() => [{ item: entries[0] }]),
    } as unknown as Fuse<Entry>
    const warmed = buildStrictIndex(entries, fuse)

    // Strict term miss with a fuse present falls back to fuse.search.
    expect(sortedIds(getMatchedEntryIds('zzz', warmed))).toEqual([1])
    expect(fuse.search).toHaveBeenCalledTimes(1)
  })

  it('keeps the hydrated index when a fuse instance already exists', async () => {
    const entries: Entry[] = [{ id: 1, searchText: 'lucia' }]
    const fuse = { search: vi.fn() } as unknown as Fuse<Entry>
    const withFuse = buildStrictIndex(entries, fuse)

    expect(await hydrateSearchIndexFuse(withFuse)).toBe(withFuse)
  })

  it('evicts the oldest query once the cache exceeds its limit', () => {
    const entries: Entry[] = [{ id: 1, searchText: 'lucia' }]
    const fuse = {
      search: vi.fn(() => [{ item: entries[0] }]),
    } as unknown as Fuse<Entry>
    const index = buildStrictIndex(entries, fuse)

    // Each distinct query misses the strict index, so it calls fuse.search once.
    for (let i = 0; i < 300; i += 1)
      getMatchedEntryIds(`term${i}`, index)
    expect(fuse.search).toHaveBeenCalledTimes(300)

    // A cached query does not re-run the search.
    getMatchedEntryIds('term0', index)
    expect(fuse.search).toHaveBeenCalledTimes(300)

    // Inserting one more distinct query evicts the oldest entry ("term0").
    getMatchedEntryIds('term_extra', index)
    expect(fuse.search).toHaveBeenCalledTimes(301)

    getMatchedEntryIds('term0', index)
    expect(fuse.search).toHaveBeenCalledTimes(302)
  })
})

describe('parseSuggestionInputState', () => {
  it('extracts the trailing token and its operator', () => {
    expect(parseSuggestionInputState('lucia b')).toEqual({
      suggestionQuery: 'b',
      suggestionContextQuery: 'lucia',
      suggestionOperator: 'and',
      suggestionIsExclusion: false,
    })
    expect(parseSuggestionInputState('lucia | b').suggestionOperator).toBe('or')
    expect(parseSuggestionInputState('lucia | b').suggestionContextQuery).toBe('lucia |')
    expect(parseSuggestionInputState('lucia !b').suggestionIsExclusion).toBe(true)
    expect(parseSuggestionInputState('!b')).toEqual({
      suggestionQuery: 'b',
      suggestionContextQuery: '',
      suggestionOperator: 'exclude',
      suggestionIsExclusion: true,
    })
    expect(parseSuggestionInputState('lucia "red dragon"').suggestionQuery).toBe('red dragon')
  })

  it('returns an empty token state for empty, trailing-separator, or separator-only input', () => {
    expect(parseSuggestionInputState('')).toEqual({
      suggestionQuery: '',
      suggestionContextQuery: '',
      suggestionOperator: null,
      suggestionIsExclusion: false,
    })
    expect(parseSuggestionInputState('lucia ').suggestionQuery).toBe('')
    expect(parseSuggestionInputState('lucia !').suggestionQuery).toBe('')
    expect(parseSuggestionInputState('|').suggestionQuery).toBe('')
  })
})

describe('suggestion rows and text helpers', () => {
  it('parses suggestion rows, normalizing terms and dropping duplicates', () => {
    const rows = parseSuggestionRows('Character\tL*cia\nCharacter\tLucia\nKeyword\tblue, dragon')
    expect([...rows.keys()]).toEqual(['l*cia', 'lucia', 'blue, dragon'])
    expect(rows.get('lucia')?.source).toBe('Character')
    expect(rows.get('blue, dragon')?.source).toBe('Keyword')
  })

  it('strips preview/part suffixes and normalizes quoted token boundaries', () => {
    expect(normalizeSuggestionTerm('Maid (preview)')).toBe('Maid')
    expect(normalizeSuggestionTerm('Maid (part 2)')).toBe('Maid')
    expect(normalizeSuggestionTerm('Maid')).toBe('Maid')
    expect(normalizeQuotedTokenBoundary('"red dragon"wolf')).toBe('"red dragon" wolf')
  })

  it('replaces a partial trailing token when applying a suggestion', () => {
    expect(applySuggestionToQuery('lucia b', 'blue')).toBe('lucia blue ')
    expect(applySuggestionToQuery('lucia b', 'blue dragon')).toBe('lucia "blue dragon" ')
  })
})

describe('collectSuggestions and filterSuggestions', () => {
  const toRows = (pairs: [Suggestion['sources'][number], string][]) => {
    const rows = new Map<string, { source: Suggestion['sources'][number], term: string }>()
    for (const [source, term] of pairs)
      rows.set(term.toLowerCase(), { source, term })
    return rows
  }
  const entries: SuggestionEntryLike[] = [
    { id: 1, suggestionRows: toRows([['Character', 'Karin'], ['Keyword', 'Maid']]) },
    { id: 2, suggestionRows: toRows([['Character', 'Karin']]) },
    { id: 3, suggestionRows: toRows([['Keyword', 'Maid']]) },
  ]
  const suggestions = collectSuggestions(entries)

  it('aggregates suggestion counts and sources, ordered by count then term', () => {
    expect(suggestions).toEqual([
      { term: 'Karin', count: 2, sources: ['Character'] },
      { term: 'Maid', count: 2, sources: ['Keyword'] },
    ])
  })

  it('ranks exact and prefix matches using global counts and drops empty queries', () => {
    const allIds = new Set([1, 2, 3])
    const result = filterSuggestions({
      entries,
      suggestions,
      suggestionQuery: 'ka',
      suggestionContextMatchedIds: allIds,
    })

    expect(result).toEqual([
      { term: 'Karin', count: 2, sources: ['Character'], matchedCount: 2 },
    ])
    expect(
      filterSuggestions({ entries, suggestions, suggestionQuery: '', suggestionContextMatchedIds: allIds }),
    ).toEqual([])
    expect(
      filterSuggestions({ entries, suggestions, suggestionQuery: 'ka', suggestionContextMatchedIds: allIds, limit: 0 }),
    ).toEqual([])
  })

  it('counts matches against a narrowed context and inverts the count for exclusion', () => {
    const narrowed = new Set([1, 2])
    const include = filterSuggestions({
      entries,
      suggestions,
      suggestionQuery: 'ma',
      suggestionContextMatchedIds: narrowed,
    })
    expect(include).toEqual([
      { term: 'Maid', count: 2, sources: ['Keyword'], matchedCount: 1 },
    ])

    const exclusion = filterSuggestions({
      entries,
      suggestions,
      suggestionQuery: 'ka',
      suggestionContextMatchedIds: new Set([1, 3]),
      isExclusionSuggestion: true,
    })
    expect(exclusion).toEqual([
      { term: 'Karin', count: 2, sources: ['Character'], matchedCount: 1 },
    ])

    // Context with no matching rows drops the suggestion entirely.
    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: 'lu',
        suggestionContextMatchedIds: new Set([2]),
      }),
    ).toEqual([])
  })

  it('only offers date suggestions for date-like numeric queries', () => {
    const dateSuggestions: Suggestion[] = [{ term: '2024/02', count: 4, sources: ['Date'] }]
    const allIds = new Set([1])
    const dateEntries: SuggestionEntryLike[] = [{ id: 1, suggestionRows: new Map() }]

    expect(
      filterSuggestions({
        entries: dateEntries,
        suggestions: dateSuggestions,
        suggestionQuery: '2024',
        suggestionContextMatchedIds: allIds,
      }),
    ).toEqual([{ term: '2024/02', count: 4, sources: ['Date'], matchedCount: 4 }])

    expect(
      filterSuggestions({
        entries: dateEntries,
        suggestions: dateSuggestions,
        suggestionQuery: 'ma',
        suggestionContextMatchedIds: allIds,
      }),
    ).toEqual([])
  })
})

describe('resolveSuggestionContextMatchedIds', () => {
  const entries: Entry[] = [
    { id: 1, searchText: 'lucia blue' },
    { id: 2, searchText: 'max red' },
  ]
  const index = buildStrictIndex(entries)
  const matchedIds = new Set([1])

  it('returns all ids when there is no suggestion query or the operator is OR', () => {
    expect(
      resolveSuggestionContextMatchedIds({
        suggestionQuery: '',
        suggestionContextQuery: 'lucia',
        matchedIds,
        index,
        suggestionOperator: null,
        rawQuery: 'lucia',
      }),
    ).toBe(index.allIds)
    expect(
      resolveSuggestionContextMatchedIds({
        suggestionQuery: 'b',
        suggestionContextQuery: 'lucia |',
        matchedIds,
        index,
        suggestionOperator: 'or',
        rawQuery: 'lucia | b',
      }),
    ).toBe(index.allIds)
  })

  it('reuses the matched ids when the context equals the raw query, otherwise re-searches', () => {
    expect(
      resolveSuggestionContextMatchedIds({
        suggestionQuery: 'b',
        suggestionContextQuery: 'lucia',
        matchedIds: index.allIds,
        index,
        suggestionOperator: 'and',
        rawQuery: 'lucia',
      }),
    ).toBe(index.allIds)
    expect(
      sortedIds(
        resolveSuggestionContextMatchedIds({
          suggestionQuery: 'x',
          suggestionContextQuery: 'max',
          matchedIds,
          index,
          suggestionOperator: 'and',
          rawQuery: 'max x',
        }),
      ),
    ).toEqual([2])
  })
})
