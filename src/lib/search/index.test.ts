import type { SearchEntryLike, SearchIndexLike, SuggestionEntryLike } from './index'
import { getCommissionData } from '#data/commissionData'
import { flattenCommissions, parseCommissionFileName } from '#lib/commissions/index'
import Fuse from 'fuse.js'
import { describe, expect, it, vi } from 'vitest'
import {
  applySuggestionToQuery,
  buildStrictTermIndex,
  collectSuggestions,
  extractSuggestionContextQuery,
  extractSuggestionQuery,
  filterSuggestions,
  getMatchedEntryIds,
  getSuggestionTokenOperator,
  parseSuggestionRows,
  resolveSuggestionContextMatchedIds,

} from './index'

type Entry = SearchEntryLike

function buildIndex(entries: Entry[]): SearchIndexLike<Entry> {
  return {
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
  }
}

const normalizeTerm = (term: string) => term.trim().toLowerCase()

function buildRealFixtures() {
  const suggestionEntries: SuggestionEntryLike[] = []
  const creatorToIds = new Map<string, number[]>()
  const searchEntries: Entry[] = []
  const commissions = flattenCommissions(getCommissionData())

  commissions.forEach((commission, index) => {
    const id = index + 1
    const { date, year, creator } = parseCommissionFileName(commission.fileName)
    const month = date.slice(4, 6)
    const dateTokens = [
      `date_y_${year}`,
      month ? `date_ym_${year}_${month}` : '',
      date ? `date_ymd_${date}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    searchEntries.push({
      id,
      searchText: [commission.character, creator, commission.Keyword ?? '', dateTokens]
        .filter(Boolean)
        .join(' '),
    })

    const rows = new Map<
      string,
      { source: 'Character' | 'Creator' | 'Keyword' | 'Date', term: string }
    >()
    const candidates = [
      { source: 'Character' as const, term: commission.character },
      { source: 'Date' as const, term: `${year}/${month}` },
      ...(creator ? [{ source: 'Creator' as const, term: creator }] : []),
      ...String(commission.Keyword ?? '')
        .split(/[\n,，、;；]/)
        .map(term => term.trim())
        .filter(Boolean)
        .map(term => ({ source: 'Keyword' as const, term })),
    ]

    for (const candidate of candidates) {
      const normalized = normalizeTerm(candidate.term)
      if (!normalized || rows.has(normalized))
        continue
      rows.set(normalized, candidate)
    }

    suggestionEntries.push({ id, suggestionRows: rows })

    if (creator) {
      const existing = creatorToIds.get(creator) ?? []
      existing.push(id)
      creatorToIds.set(creator, existing)
    }
  })

  return {
    searchIndex: buildIndex(searchEntries),
    suggestionEntries,
    suggestions: collectSuggestions(suggestionEntries),
    creatorToIds,
  }
}

describe('search utils (trimmed + real db sample)', () => {
  it('matches normalized date queries against real index tokens', () => {
    const { searchIndex } = buildRealFixtures()
    const target = searchIndex.entries.find(entry => /date_ym_\d{4}_\d{2}/.test(entry.searchText))

    expect(target).toBeTruthy()

    const ymToken = target!.searchText.match(/date_ym_(\d{4})_(\d{2})/)!
    const year = ymToken[1]
    const month = ymToken[2]

    const matchedByMonthYear = getMatchedEntryIds(`${month}/${year}`, searchIndex)
    const matchedByDate = getMatchedEntryIds(`${year}-${month}-01`, searchIndex)

    expect(matchedByMonthYear.has(target!.id)).toBe(true)
    expect(matchedByDate.has(target!.id)).toBe(true)
  })

  it('parses token operator around quoted terms correctly', () => {
    const rawQuery = '"Kanaut Nishe" | N'

    expect(extractSuggestionQuery(rawQuery)).toBe('N')
    expect(extractSuggestionContextQuery(rawQuery)).toBe('"Kanaut Nishe" |')
    expect(getSuggestionTokenOperator(rawQuery)).toBe('or')
  })

  it('filters creator suggestions by context and exclusion with real counts', () => {
    const { searchIndex, suggestionEntries, suggestions, creatorToIds } = buildRealFixtures()
    const target = [...creatorToIds.entries()].find(([, ids]) => ids.length >= 2)

    expect(target).toBeTruthy()

    const [creator, ids] = target!
    const rawQuery = creator
    const suggestionQuery = extractSuggestionQuery(rawQuery)
    const suggestionContextQuery = extractSuggestionContextQuery(rawQuery)
    const matchedIds = getMatchedEntryIds(rawQuery, searchIndex)
    const contextIds = resolveSuggestionContextMatchedIds({
      rawQuery,
      suggestionQuery,
      suggestionContextQuery,
      matchedIds,
      index: searchIndex,
    })

    const narrowedContext = new Set([ids[0]])

    const includeResult = filterSuggestions({
      entries: suggestionEntries,
      suggestions,
      suggestionQuery,
      suggestionContextMatchedIds: narrowedContext,
    }).find(item => item.term === creator)

    const excludeResult = filterSuggestions({
      entries: suggestionEntries,
      suggestions,
      suggestionQuery,
      suggestionContextMatchedIds: new Set(ids.slice(0, 2)),
      isExclusionSuggestion: true,
    }).find(item => item.term === creator)

    expect(contextIds.size).toBeGreaterThan(0)
    expect(includeResult?.matchedCount).toBe(1)
    expect(excludeResult?.matchedCount).toBe(0)
  })

  it('parses suggestion rows and removes duplicate normalized terms', () => {
    const rows = parseSuggestionRows('Character\tL*cia\nCharacter\tLucia\nCharacter\tL*cia')

    expect(rows.size).toBe(2)
    expect(rows.get('l*cia')?.term).toBe('L*cia')
    expect(rows.get('lucia')?.term).toBe('Lucia')
  })

  it('replaces a partial multi-word prefix without duplicating leading terms', () => {
    expect(applySuggestionToQuery('Kanaut N', 'Kanaut Nishe')).toBe('"Kanaut Nishe" ')
  })

  it('replaces an equivalent multi-word query with a single quoted phrase', () => {
    expect(applySuggestionToQuery('Kanaut Nishe', 'Kanaut Nishe')).toBe('"Kanaut Nishe" ')
  })

  it('reuses query cache across index wrappers that share a fuse instance', () => {
    const entries: Entry[] = [{ id: 1, searchText: 'lucia maid outfit' }]
    const fuse = {
      search: vi.fn(() => [{ item: entries[0] }]),
    } as unknown as Fuse<Entry>
    const firstIndex: SearchIndexLike<Entry> = {
      entries,
      allIds: new Set([1]),
      strictTermIndex: new Map(),
      fuse,
    }
    const secondIndex: SearchIndexLike<Entry> = {
      ...firstIndex,
    }

    const firstMatch = getMatchedEntryIds('luc', firstIndex)
    const secondMatch = getMatchedEntryIds('luc', secondIndex)

    expect(fuse.search).toHaveBeenCalledTimes(1)
    expect(secondMatch).toBe(firstMatch)
  })

  it('does not reuse non-fuse fallback cache after fuse hydration', () => {
    const entries: Entry[] = [{ id: 1, searchText: 'lucia maid outfit' }]
    const coldIndex: SearchIndexLike<Entry> = {
      cacheKey: entries,
      entries,
      allIds: new Set([1]),
      strictTermIndex: new Map(),
      fuse: null,
    }
    const fuse = {
      search: vi.fn(() => [{ item: entries[0] }]),
    } as unknown as Fuse<Entry>
    const warmIndex: SearchIndexLike<Entry> = {
      ...coldIndex,
      fuse,
    }

    expect(getMatchedEntryIds('luc', coldIndex).size).toBe(0)

    const warmMatch = getMatchedEntryIds('luc', warmIndex)

    expect(fuse.search).toHaveBeenCalledTimes(1)
    expect(warmMatch).toEqual(new Set([1]))
  })
})
