import Fuse from 'fuse.js'
import { describe, expect, it } from 'vitest'
import {
  buildStrictTermIndex,
  filterSuggestions,
  getMatchedEntryIds,
  type Suggestion,
  type SuggestionEntryLike,
  type SearchEntryLike,
  type SearchIndexLike,
} from './search'

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
})
