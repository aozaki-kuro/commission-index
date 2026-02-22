import Fuse from 'fuse.js'
import { describe, expect, it } from 'vitest'
import { getCommissionData } from '#data/commissionData'
import { parseCommissionFileName } from '#lib/commissions/index'
import {
  buildStrictTermIndex,
  collectSuggestions,
  extractSuggestionContextQuery,
  extractSuggestionQuery,
  filterSuggestions,
  getSuggestionTokenOperator,
  getMatchedEntryIds,
  parseSuggestionRows,
  resolveSuggestionContextMatchedIds,
  type Suggestion,
  type SuggestionEntryLike,
  type SearchEntryLike,
  type SearchIndexLike,
} from './index'

type Entry = SearchEntryLike

const buildIndex = (entries: Entry[]): SearchIndexLike<Entry> => ({
  entries,
  allIds: new Set(entries.map(entry => entry.id)),
  strictTermIndex: buildStrictTermIndex(entries),
  fuse: new Fuse(entries, {
    keys: ['searchText'],
    threshold: 0.33,
    ignoreLocation: true,
    includeScore: false,
    minMatchCharLength: 1,
    useExtendedSearch: true,
  }),
})

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

const buildRealSuggestionFixtures = () => {
  const entries: SuggestionEntryLike[] = []
  const creatorToIds = new Map<string, number[]>()
  let id = 1

  for (const characterData of getCommissionData()) {
    for (const commission of characterData.Commissions) {
      const { date, year, creator } = parseCommissionFileName(commission.fileName)
      const month = date.slice(4, 6)
      const keywordTerms = (commission.Keyword ?? '')
        .split(/[,\n，、;；]/)
        .map(keyword => keyword.trim())
        .filter(Boolean)

      const suggestionEntries = [
        { source: 'Character', term: characterData.Character },
        { source: 'Date', term: `${year}/${month}` },
        ...(creator ? [{ source: 'Creator', term: creator }] : []),
        ...keywordTerms.map(keyword => ({ source: 'Keyword', term: keyword })),
      ]
      const uniqueSuggestions = new Map<string, { source: string; term: string }>()
      for (const entry of suggestionEntries) {
        const normalizedTerm = normalizeSuggestionKey(entry.term)
        if (!normalizedTerm || uniqueSuggestions.has(normalizedTerm)) continue
        uniqueSuggestions.set(normalizedTerm, entry)
      }
      const searchSuggestionText = [...uniqueSuggestions.values()]
        .map(entry => `${entry.source}\t${entry.term}`)
        .join('\n')
      const suggestionRows = parseSuggestionRows(searchSuggestionText)
      entries.push({ id, suggestionRows })

      if (creator) {
        const ids = creatorToIds.get(creator) ?? []
        ids.push(id)
        creatorToIds.set(creator, ids)
      }
      id += 1
    }
  }

  return { entries, suggestions: collectSuggestions(entries), creatorToIds }
}

describe('search date token normalization', () => {
  it('matches month/year query formats like 09/2025 against normalized date tokens', () => {
    const index = buildIndex([
      { id: 1, searchText: 'date_y_2025 date_ym_2025_09' },
      { id: 2, searchText: 'date_y_2025 date_ym_2025_08' },
    ])

    expect([...getMatchedEntryIds('09/2025', index)]).toEqual([1])
    expect([...getMatchedEntryIds('2025-09', index)]).toEqual([1])
    expect([...getMatchedEntryIds('2025/09/20', index)]).toEqual([1])
    expect([...getMatchedEntryIds('2025', index)]).toEqual([1, 2])
  })
})

describe('search operator strict matching', () => {
  it('prefers strict token matching for operator queries before fuzzy fallback', () => {
    const index = buildIndex([
      { id: 1, searchText: 'n*yuta azki' },
      { id: 2, searchText: 'kanaut nishe' },
      { id: 3, searchText: 'azki' },
    ])

    expect([...getMatchedEntryIds('n*yuta | AZKi', index)].sort((a, b) => a - b)).toEqual([1, 3])
  })

  it('falls back to fuzzy matching when strict operator query has no hits', () => {
    const index = buildIndex([
      { id: 1, searchText: 'nanashi artist' },
      { id: 2, searchText: 'azki' },
    ])

    expect([...getMatchedEntryIds('na | az', index)].sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('search suggestion token operator', () => {
  it('detects exclude operator for negation token', () => {
    expect(getSuggestionTokenOperator('Albemuth !BEMA')).toBe('exclude')
  })

  it('detects OR operator for union token', () => {
    expect(getSuggestionTokenOperator('Albemuth | BEMA')).toBe('or')
  })

  it('detects AND operator for space-separated unquoted token', () => {
    expect(getSuggestionTokenOperator('Albemuth BEMA')).toBe('and')
  })

  it('does not mark AND for quoted token', () => {
    expect(getSuggestionTokenOperator('Albemuth "BEMA"')).toBeNull()
  })

  it('returns null when token has no operator', () => {
    expect(getSuggestionTokenOperator('Albemuth')).toBeNull()
  })

  it('keeps unfinished quoted token behavior for query/operator parsing', () => {
    const rawQuery = 'Albemuth "BEMA'

    expect(extractSuggestionQuery(rawQuery)).toBe('BEMA')
    expect(extractSuggestionContextQuery(rawQuery)).toBe('Albemuth')
    expect(getSuggestionTokenOperator(rawQuery)).toBe('and')
  })
})

describe('search suggestion context scope', () => {
  it('uses global scope for OR suggestion token', () => {
    const index = buildIndex([
      { id: 1, searchText: 'l*cia dorie' },
      { id: 2, searchText: 'nanashi artist' },
    ])
    const rawQuery = 'L*cia | N'
    const matchedIds = getMatchedEntryIds(rawQuery, index)

    const contextIds = resolveSuggestionContextMatchedIds({
      rawQuery,
      suggestionQuery: extractSuggestionQuery(rawQuery),
      suggestionContextQuery: extractSuggestionContextQuery(rawQuery),
      matchedIds,
      index,
    })

    expect([...contextIds].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('keeps narrowed scope for non-OR suggestion token', () => {
    const index = buildIndex([
      { id: 1, searchText: 'l*cia dorie' },
      { id: 2, searchText: 'nanashi artist' },
    ])
    const rawQuery = 'L*cia N'
    const matchedIds = getMatchedEntryIds(rawQuery, index)

    const contextIds = resolveSuggestionContextMatchedIds({
      rawQuery,
      suggestionQuery: extractSuggestionQuery(rawQuery),
      suggestionContextQuery: extractSuggestionContextQuery(rawQuery),
      matchedIds,
      index,
    })

    expect([...contextIds].sort((a, b) => a - b)).toEqual([1])
  })
})

describe('search date suggestions', () => {
  it('shows date suggestions only for likely date numeric query input', () => {
    const entries: SuggestionEntryLike[] = [{ id: 1, suggestionRows: new Map() }]
    const suggestions: Suggestion[] = [
      { term: '2025/09', count: 2, sources: ['Date'] },
      { term: 'nanashi', count: 3, sources: ['Creator'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: '20',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).toContain('2025/09')

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: 'na',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).not.toContain('2025/09')
  })

  it('sorts date suggestions from newest to oldest', () => {
    const entries: SuggestionEntryLike[] = [{ id: 1, suggestionRows: new Map() }]
    const suggestions: Suggestion[] = [
      { term: '2025/08', count: 1, sources: ['Date'] },
      { term: '2025/10', count: 1, sources: ['Date'] },
      { term: '2024/12', count: 1, sources: ['Date'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: '202',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).toEqual(['2025/10', '2025/08', '2024/12'])
  })

  it('removes suggestions not present in the current context set', () => {
    const entries: SuggestionEntryLike[] = [
      { id: 1, suggestionRows: new Map([['2025/10', { source: 'Date', term: '2025/10' }]]) },
      { id: 2, suggestionRows: new Map([['2025/08', { source: 'Date', term: '2025/08' }]]) },
    ]
    const suggestions: Suggestion[] = [
      { term: '2025/10', count: 1, sources: ['Date'] },
      { term: '2025/08', count: 1, sources: ['Date'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: '2025',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).toEqual(['2025/10'])
  })

  it('keeps only top N suggestions without full sorting', () => {
    const entries: SuggestionEntryLike[] = [{ id: 1, suggestionRows: new Map() }]
    const suggestions: Suggestion[] = [
      { term: '2025/08', count: 1, sources: ['Date'] },
      { term: '2025/10', count: 1, sources: ['Date'] },
      { term: '2024/12', count: 1, sources: ['Date'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: '202',
        suggestionContextMatchedIds: new Set([1]),
        limit: 2,
      }).map(item => item.term),
    ).toEqual(['2025/10', '2025/08'])
  })

  it('returns matchedCount from the current context set', () => {
    const { entries, suggestions, creatorToIds } = buildRealSuggestionFixtures()
    const target = [...creatorToIds.entries()].find(([, ids]) => ids.length >= 2)

    expect(target).toBeTruthy()

    const [creator, ids] = target!
    const [firstId] = ids

    const result = filterSuggestions({
      entries,
      suggestions,
      suggestionQuery: creator,
      suggestionContextMatchedIds: new Set([firstId]),
    }).find(item => item.term === creator)

    expect(result).toBeTruthy()
    expect(result?.sources).toContain('Creator')
    expect(result?.count).toBeGreaterThanOrEqual(2)
    expect(result?.matchedCount).toBe(1)
  })

  it('returns remaining result count for exclusion suggestions', () => {
    const { entries, suggestions, creatorToIds } = buildRealSuggestionFixtures()
    const target = [...creatorToIds.entries()].find(([, ids]) => ids.length >= 2)

    expect(target).toBeTruthy()

    const [creator, ids] = target!
    const contextIds = new Set(ids.slice(0, 2))

    const result = filterSuggestions({
      entries,
      suggestions,
      suggestionQuery: creator,
      suggestionContextMatchedIds: contextIds,
      isExclusionSuggestion: true,
    }).find(item => item.term === creator)

    expect(result).toBeTruthy()
    expect(result?.sources).toContain('Creator')
    expect(result?.count).toBeGreaterThanOrEqual(2)
    expect(result?.matchedCount).toBe(0)
  })

  it('deduplicates suggestions already present in context query', () => {
    const entries: SuggestionEntryLike[] = [
      {
        id: 1,
        suggestionRows: new Map([
          ['l*cia', { source: 'Character', term: 'L*cia' }],
          ['lucia', { source: 'Character', term: 'Lucia' }],
        ]),
      },
    ]
    const suggestions: Suggestion[] = [
      { term: 'L*cia', count: 1, sources: ['Character'] },
      { term: 'Lucia', count: 1, sources: ['Character'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: 'L',
        suggestionContextQuery: 'L*cia |',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).toEqual(['Lucia'])
  })

  it('deduplicates unquoted multi-word suggestions present in context query', () => {
    const entries: SuggestionEntryLike[] = [
      {
        id: 1,
        suggestionRows: new Map([
          ['kanaut nishe', { source: 'Character', term: 'Kanaut Nishe' }],
          ['kanaut', { source: 'Character', term: 'Kanaut' }],
        ]),
      },
    ]
    const suggestions: Suggestion[] = [
      { term: 'Kanaut Nishe', count: 1, sources: ['Character'] },
      { term: 'Kanaut', count: 1, sources: ['Character'] },
    ]

    expect(
      filterSuggestions({
        entries,
        suggestions,
        suggestionQuery: 'K',
        suggestionContextQuery: 'Kanaut Nishe ',
        suggestionContextMatchedIds: new Set([1]),
      }).map(item => item.term),
    ).toEqual([])
  })
})
