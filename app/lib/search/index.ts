import Fuse from 'fuse.js'
import { normalizeDateQueryToken, parseDateSearchInput } from '#lib/date/search'
import { getBaseFileName } from '#lib/utils/strings'

export type SuggestionSource = 'Character' | 'Creator' | 'Keyword' | 'Date'

export type Suggestion = {
  term: string
  count: number
  sources: SuggestionSource[]
}

export type FilteredSuggestion = Suggestion & {
  matchedCount: number
}

export type SuggestionTokenOperator = 'exclude' | 'or' | 'and' | null

export type SearchEntryLike = {
  id: number
  searchText: string
}

export type SuggestionRows = Map<string, { source: SuggestionSource; term: string }>

export type SuggestionEntryLike = {
  id: number
  suggestionRows: SuggestionRows
}

export type SearchIndexLike<T extends SearchEntryLike> = {
  entries: T[]
  allIds: Set<number>
  strictTermIndex?: Map<string, Set<number>>
  fuse: Fuse<T> | null
}

type PreparedSuggestion = {
  suggestion: Suggestion
  normalizedTerm: string
  normalizedMatchToken: string
  hasMaskWildcard: boolean
  isDateSuggestion: boolean
  monthSortKey: number | null
}

type SuggestionMatch = {
  suggestion: Suggestion
  contextCount: number
  rank: 0 | 1 | 2
  isDateSuggestion: boolean
  monthSortKey: number | null
}

type ParsedFuseQuery = {
  normalizedRawQuery: string
  tokens: string[]
}

type ParsedSuggestionInputState = {
  suggestionQuery: string
  suggestionContextQuery: string
  suggestionOperator: SuggestionTokenOperator
  suggestionIsExclusion: boolean
}

const normalize = (s: string) => s.trim().toLowerCase()
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normalizeSuggestionMatchToken = (term: string) => normalize(term).replace(/[\s"'`]+/g, '')
const trailingTokenSeparatorPattern = /(?:\s|\||!)$/
const replaceLastTokenPattern = /(.*)([\s|!]+)(.*$)/
const indexedTermPattern = /^[a-z0-9_]+$/
const MAX_QUERY_CACHE_SIZE = 300
const MAX_PARSED_QUERY_CACHE_SIZE = 300
const MAX_EXCLUDED_SUGGESTION_TERMS_CACHE_SIZE = 200
const BASE_SEARCH_FUSE_OPTIONS = {
  threshold: 0.33,
  ignoreLocation: true,
  includeScore: false,
  minMatchCharLength: 1,
  useExtendedSearch: true,
} as const
const EMPTY_IDS = new Set<number>()
const EMPTY_STRING_SET = new Set<string>()
const matchedIdsCache = new WeakMap<object, Map<string, Set<number>>>()
const strictTermMatchesCache = new WeakMap<object, Map<string, Set<number>>>()
const preparedSuggestionsCache = new WeakMap<Suggestion[], PreparedSuggestion[]>()
const parsedFuseQueryCache = new Map<string, ParsedFuseQuery>()
const excludedSuggestionTermsCache = new Map<string, Set<string>>()
const parsedSuggestionInputStateCache = new Map<string, ParsedSuggestionInputState>()
const suggestionEntriesByIdCache = new WeakMap<
  SuggestionEntryLike[],
  Map<number, SuggestionEntryLike>
>()
const contextTermCountsCache = new WeakMap<
  SuggestionEntryLike[],
  WeakMap<Set<number>, Map<string, number>>
>()

const setLruCacheEntry = <K, V>(cache: Map<K, V>, key: K, value: V, limit: number) => {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > limit) {
    const oldestKey = cache.keys().next().value as K | undefined
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  return value
}

const getQueryCache = <T extends SearchEntryLike>(index: SearchIndexLike<T>) => {
  const cached = matchedIdsCache.get(index as object)
  if (cached) return cached
  const next = new Map<string, Set<number>>()
  matchedIdsCache.set(index as object, next)
  return next
}

const getPreparedSuggestions = (suggestions: Suggestion[]) => {
  const cached = preparedSuggestionsCache.get(suggestions)
  if (cached) return cached
  const next = suggestions.map(suggestion => {
    const isDateSuggestion = suggestion.sources.includes('Date')
    const parsed = isDateSuggestion ? parseDateSearchInput(suggestion.term) : null
    const normalizedTerm = normalize(suggestion.term)
    const normalizedMatchToken = normalizeSuggestionMatchToken(suggestion.term)

    return {
      suggestion,
      normalizedTerm,
      normalizedMatchToken,
      hasMaskWildcard: normalizedMatchToken.includes('*'),
      isDateSuggestion,
      monthSortKey:
        isDateSuggestion && parsed?.month ? Number(`${parsed.year}${parsed.month}`) : null,
    }
  })
  preparedSuggestionsCache.set(suggestions, next)
  return next
}

const getStrictTermCache = <T extends SearchEntryLike>(index: SearchIndexLike<T>) => {
  const cached = strictTermMatchesCache.get(index as object)
  if (cached) return cached
  const next = new Map<string, Set<number>>()
  strictTermMatchesCache.set(index as object, next)
  return next
}

const getStrictTermMatches = <T extends SearchEntryLike>(
  index: SearchIndexLike<T>,
  term: string,
): Set<number> => {
  const termCache = getStrictTermCache(index)
  const cached = termCache.get(term)
  if (cached) return cached

  const indexedMatches = index.strictTermIndex?.get(term)
  if (indexedMatches) {
    termCache.set(term, indexedMatches)
    return indexedMatches
  }
  if (index.strictTermIndex && indexedTermPattern.test(term)) {
    termCache.set(term, EMPTY_IDS)
    return EMPTY_IDS
  }

  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
  const matches = new Set(
    index.entries.filter(entry => pattern.test(entry.searchText)).map(entry => entry.id),
  )
  termCache.set(term, matches)
  return matches
}

const intersectInPlace = (source: Set<number>, filter: Set<number>) => {
  for (const id of source) {
    if (!filter.has(id)) source.delete(id)
  }
}

const excludeInPlace = (source: Set<number>, excluded: Set<number>) => {
  for (const id of excluded) {
    source.delete(id)
  }
}

const includeInverseInPlace = (source: Set<number>, allIds: Set<number>, excluded: Set<number>) => {
  for (const id of allIds) {
    if (!excluded.has(id)) source.add(id)
  }
}

const tokenizeQuery = (query: string) => query.match(/"[^"]*"|\S+/g) ?? []
const suggestionTokenTailPattern = /^(.*?)(!?)(?:"([^"]*)"|"([^"]*)|([^\s|!]*))$/

const getParsedFuseQuery = (rawQuery: string): ParsedFuseQuery => {
  const cached = parsedFuseQueryCache.get(rawQuery)
  if (cached) return cached

  const normalizedRawQuery = toFuseOperatorQuery(rawQuery)
  const parsed = {
    normalizedRawQuery,
    tokens: normalizedRawQuery ? tokenizeQuery(normalizedRawQuery) : [],
  }

  return setLruCacheEntry(parsedFuseQueryCache, rawQuery, parsed, MAX_PARSED_QUERY_CACHE_SIZE)
}

export const parseSuggestionInputState = (rawQuery: string): ParsedSuggestionInputState => {
  const cached = parsedSuggestionInputStateCache.get(rawQuery)
  if (cached) return cached

  const trimmedQuery = rawQuery.trim()
  if (!trimmedQuery) {
    return setLruCacheEntry(
      parsedSuggestionInputStateCache,
      rawQuery,
      {
        suggestionQuery: '',
        suggestionContextQuery: '',
        suggestionOperator: null,
        suggestionIsExclusion: false,
      },
      MAX_PARSED_QUERY_CACHE_SIZE,
    )
  }

  if (trailingTokenSeparatorPattern.test(rawQuery)) {
    return setLruCacheEntry(
      parsedSuggestionInputStateCache,
      rawQuery,
      {
        suggestionQuery: '',
        suggestionContextQuery: rawQuery,
        suggestionOperator: null,
        suggestionIsExclusion: false,
      },
      MAX_PARSED_QUERY_CACHE_SIZE,
    )
  }

  const match = rawQuery.match(suggestionTokenTailPattern)
  if (!match) {
    return setLruCacheEntry(
      parsedSuggestionInputStateCache,
      rawQuery,
      {
        suggestionQuery: '',
        suggestionContextQuery: rawQuery,
        suggestionOperator: null,
        suggestionIsExclusion: false,
      },
      MAX_PARSED_QUERY_CACHE_SIZE,
    )
  }

  const prefix = match[1] ?? ''
  const negation = match[2] ?? ''
  const closedQuotedToken = match[3]
  const openQuotedToken = match[4]
  const unquotedToken = match[5]
  const tokenBody = (closedQuotedToken ?? openQuotedToken ?? unquotedToken ?? '').trim()
  let suggestionOperator: SuggestionTokenOperator = null

  if (tokenBody) {
    if (negation === '!') {
      suggestionOperator = 'exclude'
    } else {
      const trimmedPrefix = prefix.replace(/\s+$/g, '')
      if (trimmedPrefix.at(-1) === '|') {
        suggestionOperator = 'or'
      } else if (
        closedQuotedToken === undefined &&
        /\s+$/.test(prefix) &&
        trimmedPrefix.length > 0
      ) {
        suggestionOperator = 'and'
      }
    }
  }

  return setLruCacheEntry(
    parsedSuggestionInputStateCache,
    rawQuery,
    {
      suggestionQuery: tokenBody,
      suggestionContextQuery: prefix.trimEnd(),
      suggestionOperator,
      suggestionIsExclusion: suggestionOperator === 'exclude',
    },
    MAX_PARSED_QUERY_CACHE_SIZE,
  )
}

const parseQueryTermToken = (token: string) => {
  if (!token || token === '|') return null

  const isNegated = token.startsWith('!')
  const rawTerm = trimWrappingQuotes(isNegated ? token.slice(1) : token)
  if (!rawTerm) return null

  return { isNegated, rawTerm }
}

const collectExcludedSuggestionTermsUncached = (rawQuery: string) => {
  if (!rawQuery.trim()) return new Set<string>()

  const excludedTerms = new Set<string>()
  const tokens = tokenizeQuery(normalizeQuotedTokenBoundary(rawQuery))
  let segmentTerms: string[] = []

  const flushSegmentTerms = () => {
    if (segmentTerms.length <= 1) {
      segmentTerms = []
      return
    }

    for (let start = 0; start < segmentTerms.length - 1; start += 1) {
      let phrase = segmentTerms[start]
      for (let end = start + 1; end < segmentTerms.length; end += 1) {
        phrase = `${phrase} ${segmentTerms[end]}`
        excludedTerms.add(normalizeSuggestionMatchToken(phrase))
      }
    }

    segmentTerms = []
  }

  for (const token of tokens) {
    if (token === '|') {
      flushSegmentTerms()
      continue
    }

    const parsedToken = parseQueryTermToken(token)
    if (!parsedToken) continue
    const { rawTerm } = parsedToken

    segmentTerms.push(rawTerm)
    excludedTerms.add(normalizeSuggestionMatchToken(rawTerm))

    const normalizedDateTerm = normalizeDateQueryToken(rawTerm)
    if (normalizedDateTerm) {
      excludedTerms.add(normalizeSuggestionMatchToken(normalizedDateTerm))
    }
  }

  flushSegmentTerms()
  return excludedTerms
}

const collectExcludedSuggestionTerms = (rawQuery: string) => {
  if (!rawQuery.trim()) return EMPTY_STRING_SET

  const cached = excludedSuggestionTermsCache.get(rawQuery)
  if (cached) return cached

  return setLruCacheEntry(
    excludedSuggestionTermsCache,
    rawQuery,
    collectExcludedSuggestionTermsUncached(rawQuery),
    MAX_EXCLUDED_SUGGESTION_TERMS_CACHE_SIZE,
  )
}

const evaluateStrictQuery = <T extends SearchEntryLike>(
  index: SearchIndexLike<T>,
  tokens: string[],
) => {
  let current: Set<number> | null = null
  let hasTerm = false
  let pendingOperator: 'and' | 'or' = 'and'

  for (const token of tokens) {
    if (token === '|') {
      pendingOperator = 'or'
      continue
    }

    const parsedToken = parseQueryTermToken(token)
    if (!parsedToken) continue
    const { isNegated, rawTerm } = parsedToken

    hasTerm = true
    const termMatches = getStrictTermMatches(index, rawTerm)
    if (!current) {
      current = isNegated ? new Set(index.allIds) : new Set(termMatches)
      if (isNegated) excludeInPlace(current, termMatches)
    } else if (pendingOperator === 'or') {
      if (isNegated) includeInverseInPlace(current, index.allIds, termMatches)
      else {
        for (const id of termMatches) current.add(id)
      }
    } else {
      if (isNegated) excludeInPlace(current, termMatches)
      else intersectInPlace(current, termMatches)
    }

    pendingOperator = 'and'
  }

  return hasTerm ? current : null
}

const getSuggestionEntriesById = (entries: SuggestionEntryLike[]) => {
  const cached = suggestionEntriesByIdCache.get(entries)
  if (cached) return cached

  const next = new Map(entries.map(entry => [entry.id, entry]))
  suggestionEntriesByIdCache.set(entries, next)
  return next
}

const addSuggestionRowTermsToCounts = (
  counts: Map<string, number>,
  entry: SuggestionEntryLike | undefined,
) => {
  if (!entry) return
  for (const term of entry.suggestionRows.keys()) {
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }
}

const getContextTermCounts = (entries: SuggestionEntryLike[], matchedIds: Set<number>) => {
  let byMatchedSet = contextTermCountsCache.get(entries)
  if (!byMatchedSet) {
    byMatchedSet = new WeakMap<Set<number>, Map<string, number>>()
    contextTermCountsCache.set(entries, byMatchedSet)
  }
  const cached = byMatchedSet.get(matchedIds)
  if (cached) return cached

  const counts = new Map<string, number>()

  if (matchedIds.size === 0) {
    byMatchedSet.set(matchedIds, counts)
    return counts
  }

  // For narrow contexts, iterating the matched id set avoids scanning every entry.
  if (matchedIds.size * 3 <= entries.length) {
    const entryById = getSuggestionEntriesById(entries)
    for (const id of matchedIds) {
      addSuggestionRowTermsToCounts(counts, entryById.get(id))
    }
  } else {
    for (const entry of entries) {
      if (!matchedIds.has(entry.id)) continue
      addSuggestionRowTermsToCounts(counts, entry)
    }
  }
  byMatchedSet.set(matchedIds, counts)
  return counts
}

const toSuggestionSource = (rawSource: string): SuggestionSource => {
  if (
    rawSource === 'Character' ||
    rawSource === 'Creator' ||
    rawSource === 'Keyword' ||
    rawSource === 'Date'
  ) {
    return rawSource
  }
  return 'Keyword'
}

export const parseSuggestionRows = (suggestText: string): SuggestionRows => {
  const rows = new Map<string, { source: SuggestionSource; term: string }>()
  for (const rawRow of suggestText.split('\n')) {
    const row = rawRow.trim()
    if (!row) continue
    const [rawSource = 'Keyword', ...rest] = row.split('\t')
    const term = normalizeSuggestionTerm(rest.join('\t').trim())
    const normalizedTerm = normalize(term)
    if (!normalizedTerm || rows.has(normalizedTerm)) continue
    rows.set(normalizedTerm, {
      source: toSuggestionSource(rawSource),
      term: term || normalizedTerm,
    })
  }
  return rows
}

export const buildStrictTermIndex = <T extends SearchEntryLike>(entries: T[]) => {
  const index = new Map<string, Set<number>>()

  for (const entry of entries) {
    const terms = entry.searchText.match(/[a-z0-9_]+/g)
    if (!terms) continue
    const uniqueTerms = new Set(terms)

    for (const term of uniqueTerms) {
      const ids = index.get(term)
      if (ids) {
        ids.add(entry.id)
      } else {
        index.set(term, new Set([entry.id]))
      }
    }
  }

  return index
}

export const createSearchFuse = <T extends SearchEntryLike>(entries: T[]) =>
  new Fuse(entries, {
    keys: ['searchText'],
    ...BASE_SEARCH_FUSE_OPTIONS,
  })

export const createSearchIndex = <T extends SearchEntryLike>(entries: T[]): SearchIndexLike<T> => ({
  entries,
  allIds: new Set(entries.map(entry => entry.id)),
  strictTermIndex: buildStrictTermIndex(entries),
  fuse: createSearchFuse(entries),
})

const matchesMaskedAt = (pattern: string, query: string, startIndex: number) => {
  for (let i = 0; i < query.length; i += 1) {
    const patternChar = pattern[startIndex + i]
    const queryChar = query[i]
    if (patternChar === '*') continue
    if (patternChar !== queryChar) return false
  }
  return true
}

const matchesPlainSuggestion = (
  pattern: string,
  query: string,
): 'exact' | 'startsWith' | 'includes' | null => {
  if (!pattern || !query || query.length > pattern.length) return null
  if (pattern === query) return 'exact'
  if (pattern.startsWith(query)) return 'startsWith'
  return pattern.includes(query) ? 'includes' : null
}

const matchesMaskedSuggestion = (
  pattern: string,
  query: string,
): 'exact' | 'startsWith' | 'includes' | null => {
  if (!pattern || !query || query.length > pattern.length) return null

  if (pattern.length === query.length && matchesMaskedAt(pattern, query, 0)) return 'exact'
  if (matchesMaskedAt(pattern, query, 0)) return 'startsWith'

  for (let start = 1; start <= pattern.length - query.length; start += 1) {
    if (matchesMaskedAt(pattern, query, start)) return 'includes'
  }

  return null
}

const trimWrappingQuotes = (value: string) =>
  value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value

const normalizeDateTokenInQuery = (token: string) => {
  const parsedToken = parseQueryTermToken(token)
  if (!parsedToken) return token

  const normalizedDate = normalizeDateQueryToken(parsedToken.rawTerm)
  if (!normalizedDate) return token

  return `${parsedToken.isNegated ? '!' : ''}${normalizedDate}`
}

const toFuseOperatorQuery = (rawQuery: string) => {
  const normalizedQuery = normalize(rawQuery)
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s*!\s*/g, ' !')
    .replace(/\s+/g, ' ')
  const tokens = normalizedQuery.match(/"[^"]*"|\S+/g) ?? []
  return tokens.map(normalizeDateTokenInQuery).join(' ')
}

export const normalizeSuggestionTerm = (term: string) => getBaseFileName(term).trim()
export const normalizeQuotedTokenBoundary = (rawQuery: string) =>
  rawQuery.replace(/("[^"]*")(?=[^\s|!])/g, '$1 ')

export const applySuggestionToQuery = (rawQuery: string, suggestion: string) => {
  if (!suggestion) return rawQuery

  let suggestionToken = suggestion
  if (suggestionToken.includes(' ') && !suggestionToken.startsWith('"')) {
    suggestionToken = `"${suggestionToken}"`
  }

  const match = rawQuery.match(replaceLastTokenPattern)
  const nextQuery = match ? `${match[1]}${match[2]}${suggestionToken}` : suggestionToken
  return trailingTokenSeparatorPattern.test(nextQuery) ? nextQuery : `${nextQuery} `
}

export const extractSuggestionQuery = (rawQuery: string) => {
  return parseSuggestionInputState(rawQuery).suggestionQuery
}

export const isSuggestionExclusionToken = (rawQuery: string) => {
  return parseSuggestionInputState(rawQuery).suggestionIsExclusion
}

export const getSuggestionTokenOperator = (rawQuery: string): SuggestionTokenOperator => {
  return parseSuggestionInputState(rawQuery).suggestionOperator
}

export const extractSuggestionContextQuery = (rawQuery: string) => {
  return parseSuggestionInputState(rawQuery).suggestionContextQuery
}

export const getMatchedEntryIds = <T extends SearchEntryLike>(
  rawQuery: string,
  index: SearchIndexLike<T>,
) => {
  const { entries, allIds, fuse } = index
  const { normalizedRawQuery, tokens } = getParsedFuseQuery(rawQuery)
  if (!entries.length || !fuse) return EMPTY_IDS
  if (!normalizedRawQuery) return allIds

  const queryCache = getQueryCache(index)
  const cached = queryCache.get(normalizedRawQuery)
  if (cached) return cached

  const strictMatchIds = tokens.length ? evaluateStrictQuery(index, tokens) : null

  const matched =
    strictMatchIds && strictMatchIds.size > 0
      ? strictMatchIds
      : new Set(fuse.search(normalizedRawQuery).map(result => result.item.id))
  return setLruCacheEntry(queryCache, normalizedRawQuery, matched, MAX_QUERY_CACHE_SIZE)
}

export const resolveSuggestionContextMatchedIds = <T extends SearchEntryLike>({
  rawQuery,
  suggestionQuery,
  suggestionContextQuery,
  matchedIds,
  index,
  suggestionOperator,
}: {
  rawQuery: string
  suggestionQuery: string
  suggestionContextQuery: string
  matchedIds: Set<number>
  index: SearchIndexLike<T>
  suggestionOperator?: SuggestionTokenOperator
}) => {
  if (!suggestionQuery) return index.allIds
  if ((suggestionOperator ?? getSuggestionTokenOperator(rawQuery)) === 'or') return index.allIds
  if (suggestionContextQuery === rawQuery) return matchedIds
  return getMatchedEntryIds(suggestionContextQuery, index)
}

export const collectSuggestions = (entries: SuggestionEntryLike[]) => {
  const suggestionCounts = new Map<
    string,
    { term: string; count: number; sources: Set<SuggestionSource> }
  >()
  for (const entry of entries) {
    for (const [normalizedTerm, matchedRow] of entry.suggestionRows) {
      const source = matchedRow.source
      const originalTerm = matchedRow.term || normalizedTerm
      const existing = suggestionCounts.get(normalizedTerm)
      if (existing) {
        existing.count += 1
        existing.sources.add(source)
        continue
      }

      suggestionCounts.set(normalizedTerm, {
        term: originalTerm,
        count: 1,
        sources: new Set([source]),
      })
    }
  }

  const sourceOrder = { Character: 0, Date: 1, Keyword: 2, Creator: 3 } satisfies Record<
    SuggestionSource,
    number
  >
  return [...suggestionCounts.values()]
    .map(item => ({
      term: item.term,
      count: item.count,
      sources: [...item.sources].sort((a, b) => sourceOrder[a] - sourceOrder[b]),
    }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
}

const isLikelyDateNumericQuery = (query: string) => {
  const trimmed = query.trim()
  return /\d/.test(trimmed) && /^[\d./-]+$/.test(trimmed)
}

const compareSuggestionMatches = (a: SuggestionMatch, b: SuggestionMatch) => {
  if (a.isDateSuggestion && b.isDateSuggestion) {
    if (a.monthSortKey !== null && b.monthSortKey !== null && a.monthSortKey !== b.monthSortKey) {
      return b.monthSortKey - a.monthSortKey
    }
  }

  return (
    a.rank - b.rank ||
    b.contextCount - a.contextCount ||
    b.suggestion.count - a.suggestion.count ||
    a.suggestion.term.localeCompare(b.suggestion.term)
  )
}

const insertTopSuggestionMatch = (
  topMatches: SuggestionMatch[],
  candidate: SuggestionMatch,
  limit: number,
) => {
  let index = topMatches.length
  for (let i = 0; i < topMatches.length; i += 1) {
    if (compareSuggestionMatches(candidate, topMatches[i]) < 0) {
      index = i
      break
    }
  }

  topMatches.splice(index, 0, candidate)
  if (topMatches.length > limit) topMatches.pop()
}

export const filterSuggestions = ({
  entries,
  suggestions,
  suggestionQuery,
  suggestionContextQuery = '',
  suggestionContextMatchedIds,
  isExclusionSuggestion = false,
  limit = 8,
}: {
  entries: SuggestionEntryLike[]
  suggestions: Suggestion[]
  suggestionQuery: string
  suggestionContextQuery?: string
  suggestionContextMatchedIds: Set<number>
  isExclusionSuggestion?: boolean
  limit?: number
}) => {
  if (limit <= 0) return []
  if (!suggestionQuery) return []
  const normalizedSuggestionQuery = normalizeSuggestionMatchToken(suggestionQuery)
  if (!normalizedSuggestionQuery) return []
  if (suggestions.length === 0) return []
  const showDateSuggestions = isLikelyDateNumericQuery(suggestionQuery)

  const useGlobalCounts = suggestionContextMatchedIds.size === entries.length
  const contextTermCounts = useGlobalCounts
    ? null
    : getContextTermCounts(entries, suggestionContextMatchedIds)
  const topMatches: SuggestionMatch[] = []
  const preparedSuggestions = getPreparedSuggestions(suggestions)
  const excludedSuggestionTerms = collectExcludedSuggestionTerms(suggestionContextQuery)

  for (const preparedSuggestion of preparedSuggestions) {
    const {
      suggestion,
      normalizedMatchToken,
      normalizedTerm,
      hasMaskWildcard,
      isDateSuggestion,
      monthSortKey,
    } = preparedSuggestion
    if (isDateSuggestion && !showDateSuggestions) continue
    if (excludedSuggestionTerms.has(normalizedMatchToken)) continue

    const matchType = hasMaskWildcard
      ? matchesMaskedSuggestion(normalizedMatchToken, normalizedSuggestionQuery)
      : matchesPlainSuggestion(normalizedMatchToken, normalizedSuggestionQuery)
    if (!matchType) continue

    const rank = matchType === 'exact' ? 0 : matchType === 'startsWith' ? 1 : 2
    const contextCount = useGlobalCounts
      ? suggestion.count
      : (contextTermCounts?.get(normalizedTerm) ?? 0)
    if (!useGlobalCounts && contextCount === 0) continue
    insertTopSuggestionMatch(
      topMatches,
      { suggestion, contextCount, rank, isDateSuggestion, monthSortKey },
      limit,
    )
  }

  return topMatches.map(item => ({
    ...item.suggestion,
    matchedCount: isExclusionSuggestion
      ? Math.max(0, suggestionContextMatchedIds.size - item.contextCount)
      : item.contextCount,
  }))
}

export const normalizeQuery = normalize
