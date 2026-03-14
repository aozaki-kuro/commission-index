import type Fuse from 'fuse.js'
import { normalizeDateQueryToken, parseDateSearchInput } from '#lib/date/search'
import { getBaseFileName } from '#lib/utils/strings'

export type SuggestionSource = 'Character' | 'Creator' | 'Keyword' | 'Date'

export interface Suggestion {
  term: string
  count: number
  sources: SuggestionSource[]
}

export type FilteredSuggestion = Suggestion & {
  matchedCount: number
}

export type SuggestionTokenOperator = 'exclude' | 'or' | 'and' | null

export interface SearchEntryLike {
  id: number
  searchText: string
}

export type SuggestionRows = Map<string, { source: SuggestionSource, term: string }>

export interface SuggestionEntryLike {
  id: number
  suggestionRows: SuggestionRows
}

export interface SearchIndexLike<T extends SearchEntryLike> {
  cacheKey?: object
  entries: T[]
  allIds: Set<number>
  strictTermIndex?: Map<string, Set<number>>
  fuse: Fuse<T> | null
}

interface PreparedSuggestion {
  suggestion: Suggestion
  normalizedTerm: string
  normalizedMatchToken: string
  hasMaskWildcard: boolean
  isDateSuggestion: boolean
  monthSortKey: number | null
}

interface SuggestionMatch {
  suggestion: Suggestion
  contextCount: number
  rank: 0 | 1 | 2
  isDateSuggestion: boolean
  monthSortKey: number | null
}

interface ParsedFuseQuery {
  normalizedRawQuery: string
  tokens: string[]
}

interface ParsedSuggestionInputState {
  suggestionQuery: string
  suggestionContextQuery: string
  suggestionOperator: SuggestionTokenOperator
  suggestionIsExclusion: boolean
}

const normalize = (s: string) => s.trim().toLowerCase()
const ESCAPE_REGEXP_PATTERN = /[.*+?^${}()|[\]\\]/g
const SUGGESTION_MATCH_TOKEN_PATTERN = /[\s"'`]+/g
const TOKENIZE_QUERY_PATTERN = /"[^"]*"|\S+/g
const TRAILING_TOKEN_SEPARATOR_PATTERN = /[\s|!]$/
const TRAILING_WHITESPACE_PATTERN = /\s+$/g
const ENDS_WITH_WHITESPACE_PATTERN = /\s+$/
const SEARCH_TEXT_TERM_PATTERN = /[a-z0-9_]+/g
const NORMALIZE_PIPE_PATTERN = /\s*\|\s*/g
const NORMALIZE_NEGATION_PATTERN = /\s*!\s*/g
const NORMALIZE_MULTI_SPACE_PATTERN = /\s+/g
const QUOTED_TOKEN_BOUNDARY_PATTERN = /("[^"]*")(?=[^\s|!])/g
const HAS_DIGIT_PATTERN = /\d/
const LIKELY_DATE_QUERY_PATTERN = /^[\d./-]+$/
const escapeRegExp = (s: string) => s.replace(ESCAPE_REGEXP_PATTERN, '\\$&')
const normalizeSuggestionMatchToken = (term: string) => normalize(term).replace(SUGGESTION_MATCH_TOKEN_PATTERN, '')
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
let fuseModulePromise: Promise<typeof import('fuse.js')> | null = null
const EMPTY_IDS = new Set<number>()
const EMPTY_STRING_SET = new Set<string>()
const searchIndexCache = new WeakMap<SearchEntryLike[], SearchIndexLike<SearchEntryLike>>()
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

function setLruCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (cache.has(key))
    cache.delete(key)
  cache.set(key, value)
  if (cache.size > limit) {
    const oldestKey = cache.keys().next().value as K | undefined
    if (oldestKey !== undefined)
      cache.delete(oldestKey)
  }
  return value
}

function getStrictTermCacheKey<T extends SearchEntryLike>(index: SearchIndexLike<T>) {
  return index.cacheKey ?? (index as object)
}

function getQueryCache<T extends SearchEntryLike>(index: SearchIndexLike<T>) {
  const cacheKey = index.fuse ?? index.cacheKey ?? (index as object)
  const cached = matchedIdsCache.get(cacheKey)
  if (cached)
    return cached
  const next = new Map<string, Set<number>>()
  matchedIdsCache.set(cacheKey, next)
  return next
}

function getPreparedSuggestions(suggestions: Suggestion[]) {
  const cached = preparedSuggestionsCache.get(suggestions)
  if (cached)
    return cached
  const next = suggestions.map((suggestion) => {
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

function getStrictTermCache<T extends SearchEntryLike>(index: SearchIndexLike<T>) {
  const cacheKey = getStrictTermCacheKey(index)
  const cached = strictTermMatchesCache.get(cacheKey)
  if (cached)
    return cached
  const next = new Map<string, Set<number>>()
  strictTermMatchesCache.set(cacheKey, next)
  return next
}

function getStrictTermMatches<T extends SearchEntryLike>(index: SearchIndexLike<T>, term: string): Set<number> {
  const termCache = getStrictTermCache(index)
  const cached = termCache.get(term)
  if (cached)
    return cached

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

function intersectInPlace(source: Set<number>, filter: Set<number>) {
  for (const id of source) {
    if (!filter.has(id))
      source.delete(id)
  }
}

function excludeInPlace(source: Set<number>, excluded: Set<number>) {
  for (const id of excluded) {
    source.delete(id)
  }
}

function includeInverseInPlace(source: Set<number>, allIds: Set<number>, excluded: Set<number>) {
  for (const id of allIds) {
    if (!excluded.has(id))
      source.add(id)
  }
}

const tokenizeQuery = (query: string) => query.match(TOKENIZE_QUERY_PATTERN) ?? []
function getSuggestionTokenTailStart(rawQuery: string) {
  let inQuote = false
  let tokenStart: number | null = null

  for (let i = 0; i < rawQuery.length; i += 1) {
    const char = rawQuery[i]

    if (!inQuote && (char === ' ' || char === '|' || char === '!')) {
      tokenStart = null
      continue
    }

    if (tokenStart === null)
      tokenStart = i
    if (char === '"')
      inQuote = !inQuote
  }

  return tokenStart
}

function getParsedFuseQuery(rawQuery: string): ParsedFuseQuery {
  const cached = parsedFuseQueryCache.get(rawQuery)
  if (cached)
    return cached

  const normalizedRawQuery = toFuseOperatorQuery(rawQuery)
  const parsed = {
    normalizedRawQuery,
    tokens: normalizedRawQuery ? tokenizeQuery(normalizedRawQuery) : [],
  }

  return setLruCacheEntry(parsedFuseQueryCache, rawQuery, parsed, MAX_PARSED_QUERY_CACHE_SIZE)
}

export function parseSuggestionInputState(rawQuery: string): ParsedSuggestionInputState {
  const cached = parsedSuggestionInputStateCache.get(rawQuery)
  if (cached)
    return cached

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

  if (TRAILING_TOKEN_SEPARATOR_PATTERN.test(rawQuery)) {
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

  const tokenStart = getSuggestionTokenTailStart(rawQuery)
  if (tokenStart === null) {
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

  const prefix = rawQuery.slice(0, tokenStart)
  const rawToken = rawQuery.slice(tokenStart)
  const hasNegationPrefix = rawToken.startsWith('!')
  const tokenWithPossibleQuotes = hasNegationPrefix ? rawToken.slice(1) : rawToken
  const hasOpeningQuote = tokenWithPossibleQuotes.startsWith('"')
  const hasClosedQuote
    = hasOpeningQuote && tokenWithPossibleQuotes.length >= 2 && tokenWithPossibleQuotes.endsWith('"')
  const tokenBody = hasOpeningQuote
    ? (hasClosedQuote
        ? tokenWithPossibleQuotes.slice(1, -1)
        : tokenWithPossibleQuotes.slice(1)
      ).trim()
    : tokenWithPossibleQuotes.trim()
  let suggestionOperator: SuggestionTokenOperator = null

  if (tokenBody) {
    const trimmedPrefix = prefix.replace(TRAILING_WHITESPACE_PATTERN, '')
    const prefixEndsWithNegation = trimmedPrefix.at(-1) === '!'

    if (hasNegationPrefix || prefixEndsWithNegation) {
      suggestionOperator = 'exclude'
    }
    else {
      if (trimmedPrefix.at(-1) === '|') {
        suggestionOperator = 'or'
      }
      else if (!hasClosedQuote && ENDS_WITH_WHITESPACE_PATTERN.test(prefix) && trimmedPrefix.length > 0) {
        suggestionOperator = 'and'
      }
    }
  }

  let suggestionContextQuery = prefix.trimEnd()
  if (
    tokenBody
    && suggestionOperator === 'exclude'
    && !hasNegationPrefix
    && suggestionContextQuery.endsWith('!')
  ) {
    suggestionContextQuery = suggestionContextQuery.slice(0, -1).trimEnd()
  }

  return setLruCacheEntry(
    parsedSuggestionInputStateCache,
    rawQuery,
    {
      suggestionQuery: tokenBody,
      suggestionContextQuery,
      suggestionOperator,
      suggestionIsExclusion: suggestionOperator === 'exclude',
    },
    MAX_PARSED_QUERY_CACHE_SIZE,
  )
}

function parseQueryTermToken(token: string) {
  if (!token || token === '|')
    return null

  const isNegated = token.startsWith('!')
  const rawTerm = trimWrappingQuotes(isNegated ? token.slice(1) : token)
  if (!rawTerm)
    return null

  return { isNegated, rawTerm }
}

function collectExcludedSuggestionTermsUncached(rawQuery: string) {
  if (!rawQuery.trim())
    return new Set<string>()

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
    if (!parsedToken)
      continue
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

function collectExcludedSuggestionTerms(rawQuery: string) {
  if (!rawQuery.trim())
    return EMPTY_STRING_SET

  const cached = excludedSuggestionTermsCache.get(rawQuery)
  if (cached)
    return cached

  return setLruCacheEntry(
    excludedSuggestionTermsCache,
    rawQuery,
    collectExcludedSuggestionTermsUncached(rawQuery),
    MAX_EXCLUDED_SUGGESTION_TERMS_CACHE_SIZE,
  )
}

function evaluateStrictQuery<T extends SearchEntryLike>(index: SearchIndexLike<T>, tokens: string[]) {
  let current: Set<number> | null = null
  let hasTerm = false
  let pendingOperator: 'and' | 'or' = 'and'

  for (const token of tokens) {
    if (token === '|') {
      pendingOperator = 'or'
      continue
    }

    const parsedToken = parseQueryTermToken(token)
    if (!parsedToken)
      continue
    const { isNegated, rawTerm } = parsedToken

    hasTerm = true
    const termMatches = getStrictTermMatches(index, rawTerm)
    if (!current) {
      current = isNegated ? new Set(index.allIds) : new Set(termMatches)
      if (isNegated)
        excludeInPlace(current, termMatches)
    }
    else if (pendingOperator === 'or') {
      if (isNegated) {
        includeInverseInPlace(current, index.allIds, termMatches)
      }
      else {
        for (const id of termMatches) current.add(id)
      }
    }
    else {
      if (isNegated)
        excludeInPlace(current, termMatches)
      else intersectInPlace(current, termMatches)
    }

    pendingOperator = 'and'
  }

  return hasTerm ? current : null
}

function getSuggestionEntriesById(entries: SuggestionEntryLike[]) {
  const cached = suggestionEntriesByIdCache.get(entries)
  if (cached)
    return cached

  const next = new Map(entries.map(entry => [entry.id, entry]))
  suggestionEntriesByIdCache.set(entries, next)
  return next
}

function addSuggestionRowTermsToCounts(counts: Map<string, number>, entry: SuggestionEntryLike | undefined) {
  if (!entry)
    return
  for (const term of entry.suggestionRows.keys()) {
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }
}

function getContextTermCounts(entries: SuggestionEntryLike[], matchedIds: Set<number>) {
  let byMatchedSet = contextTermCountsCache.get(entries)
  if (!byMatchedSet) {
    byMatchedSet = new WeakMap<Set<number>, Map<string, number>>()
    contextTermCountsCache.set(entries, byMatchedSet)
  }
  const cached = byMatchedSet.get(matchedIds)
  if (cached)
    return cached

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
  }
  else {
    for (const entry of entries) {
      if (!matchedIds.has(entry.id))
        continue
      addSuggestionRowTermsToCounts(counts, entry)
    }
  }
  byMatchedSet.set(matchedIds, counts)
  return counts
}

function toSuggestionSource(rawSource: string): SuggestionSource {
  if (
    rawSource === 'Character'
    || rawSource === 'Creator'
    || rawSource === 'Keyword'
    || rawSource === 'Date'
  ) {
    return rawSource
  }
  return 'Keyword'
}

export function parseSuggestionRows(suggestText: string): SuggestionRows {
  const rows = new Map<string, { source: SuggestionSource, term: string }>()
  for (const rawRow of suggestText.split('\n')) {
    const row = rawRow.trim()
    if (!row)
      continue
    const [rawSource = 'Keyword', ...rest] = row.split('\t')
    const term = normalizeSuggestionTerm(rest.join('\t').trim())
    const normalizedTerm = normalize(term)
    if (!normalizedTerm || rows.has(normalizedTerm))
      continue
    rows.set(normalizedTerm, {
      source: toSuggestionSource(rawSource),
      term: term || normalizedTerm,
    })
  }
  return rows
}

export function buildStrictTermIndex<T extends SearchEntryLike>(entries: T[]) {
  const index = new Map<string, Set<number>>()

  for (const entry of entries) {
    const terms = entry.searchText.match(SEARCH_TEXT_TERM_PATTERN)
    if (!terms)
      continue
    const uniqueTerms = new Set(terms)

    for (const term of uniqueTerms) {
      const ids = index.get(term)
      if (ids) {
        ids.add(entry.id)
      }
      else {
        index.set(term, new Set([entry.id]))
      }
    }
  }

  return index
}

async function loadFuseModule() {
  if (!fuseModulePromise) {
    fuseModulePromise = import('fuse.js')
  }

  return fuseModulePromise
}

export async function createSearchFuse<T extends SearchEntryLike>(entries: T[]) {
  const fuseModule = await loadFuseModule()
  const FuseConstructor = fuseModule.default
  return new FuseConstructor(entries, {
    keys: ['searchText'],
    ...BASE_SEARCH_FUSE_OPTIONS,
  })
}

export function createSearchIndex<T extends SearchEntryLike>(entries: T[]): SearchIndexLike<T> {
  const cached = searchIndexCache.get(entries)
  if (cached)
    return cached as SearchIndexLike<T>

  const next: SearchIndexLike<T> = {
    cacheKey: entries,
    entries,
    allIds: new Set(entries.map(entry => entry.id)),
    strictTermIndex: buildStrictTermIndex(entries),
    fuse: null,
  }

  searchIndexCache.set(entries, next)
  return next
}

export async function hydrateSearchIndexFuse<
  T extends SearchEntryLike,
  I extends SearchIndexLike<T>,
>(index: I): Promise<I> {
  if (index.fuse)
    return index
  return {
    ...index,
    fuse: await createSearchFuse(index.entries),
  } as I
}

function matchesMaskedAt(pattern: string, query: string, startIndex: number) {
  for (let i = 0; i < query.length; i += 1) {
    const patternChar = pattern[startIndex + i]
    const queryChar = query[i]
    if (patternChar === '*')
      continue
    if (patternChar !== queryChar)
      return false
  }
  return true
}

function matchesPlainSuggestion(pattern: string, query: string): 'exact' | 'startsWith' | 'includes' | null {
  if (!pattern || !query || query.length > pattern.length)
    return null
  if (pattern === query)
    return 'exact'
  if (pattern.startsWith(query))
    return 'startsWith'
  return pattern.includes(query) ? 'includes' : null
}

function matchesMaskedSuggestion(pattern: string, query: string): 'exact' | 'startsWith' | 'includes' | null {
  if (!pattern || !query || query.length > pattern.length)
    return null

  if (pattern.length === query.length && matchesMaskedAt(pattern, query, 0))
    return 'exact'
  if (matchesMaskedAt(pattern, query, 0))
    return 'startsWith'

  for (let start = 1; start <= pattern.length - query.length; start += 1) {
    if (matchesMaskedAt(pattern, query, start))
      return 'includes'
  }

  return null
}

function trimWrappingQuotes(value: string) {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1) : value
}

function normalizeDateTokenInQuery(token: string) {
  const parsedToken = parseQueryTermToken(token)
  if (!parsedToken)
    return token

  const normalizedDate = normalizeDateQueryToken(parsedToken.rawTerm)
  if (!normalizedDate)
    return token

  return `${parsedToken.isNegated ? '!' : ''}${normalizedDate}`
}

function toFuseOperatorQuery(rawQuery: string) {
  const normalizedQuery = normalize(rawQuery)
    .replace(NORMALIZE_PIPE_PATTERN, ' | ')
    .replace(NORMALIZE_NEGATION_PATTERN, ' !')
    .replace(NORMALIZE_MULTI_SPACE_PATTERN, ' ')
  const tokens = normalizedQuery.match(TOKENIZE_QUERY_PATTERN) ?? []
  return tokens.map(normalizeDateTokenInQuery).join(' ')
}

export function normalizeSuggestionTerm(term: string) {
  return getBaseFileName(term).trim()
}

export function normalizeQuotedTokenBoundary(rawQuery: string) {
  return rawQuery.replace(QUOTED_TOKEN_BOUNDARY_PATTERN, '$1 ')
}

export function applySuggestionToQuery(rawQuery: string, suggestion: string) {
  if (!suggestion)
    return rawQuery

  let suggestionToken = suggestion
  if (suggestionToken.includes(' ') && !suggestionToken.startsWith('"')) {
    suggestionToken = `"${suggestionToken}"`
  }

  const normalizedRawToken = normalizeSuggestionMatchToken(trimWrappingQuotes(rawQuery))
  const normalizedSuggestionToken = normalizeSuggestionMatchToken(
    trimWrappingQuotes(suggestionToken),
  )
  if (normalizedRawToken && normalizedSuggestionToken.startsWith(normalizedRawToken)) {
    return TRAILING_TOKEN_SEPARATOR_PATTERN.test(suggestionToken)
      ? suggestionToken
      : `${suggestionToken} `
  }

  const tokenTailStart = getSuggestionTokenTailStart(rawQuery)
  const nextQuery = tokenTailStart === null
    ? (rawQuery ? `${rawQuery}${suggestionToken}` : suggestionToken)
    : `${rawQuery.slice(0, tokenTailStart)}${suggestionToken}`
  return TRAILING_TOKEN_SEPARATOR_PATTERN.test(nextQuery) ? nextQuery : `${nextQuery} `
}

export function extractSuggestionQuery(rawQuery: string) {
  return parseSuggestionInputState(rawQuery).suggestionQuery
}

export function isSuggestionExclusionToken(rawQuery: string) {
  return parseSuggestionInputState(rawQuery).suggestionIsExclusion
}

export function getSuggestionTokenOperator(rawQuery: string): SuggestionTokenOperator {
  return parseSuggestionInputState(rawQuery).suggestionOperator
}

export function extractSuggestionContextQuery(rawQuery: string) {
  return parseSuggestionInputState(rawQuery).suggestionContextQuery
}

export function getMatchedEntryIds<T extends SearchEntryLike>(rawQuery: string, index: SearchIndexLike<T>) {
  const { entries, allIds, fuse } = index
  const { normalizedRawQuery, tokens } = getParsedFuseQuery(rawQuery)
  if (!entries.length)
    return EMPTY_IDS
  if (!normalizedRawQuery)
    return allIds

  const queryCache = getQueryCache(index)
  const cached = queryCache.get(normalizedRawQuery)
  if (cached)
    return cached

  const strictMatchIds = tokens.length ? evaluateStrictQuery(index, tokens) : null
  if (!fuse) {
    return setLruCacheEntry(
      queryCache,
      normalizedRawQuery,
      strictMatchIds ?? allIds,
      MAX_QUERY_CACHE_SIZE,
    )
  }

  const matched
    = strictMatchIds && strictMatchIds.size > 0
      ? strictMatchIds
      : new Set(fuse.search(normalizedRawQuery).map(result => result.item.id))
  return setLruCacheEntry(queryCache, normalizedRawQuery, matched, MAX_QUERY_CACHE_SIZE)
}

export function resolveSuggestionContextMatchedIds<T extends SearchEntryLike>({
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
}) {
  if (!suggestionQuery)
    return index.allIds
  if ((suggestionOperator ?? getSuggestionTokenOperator(rawQuery)) === 'or')
    return index.allIds
  if (suggestionContextQuery === rawQuery)
    return matchedIds
  return getMatchedEntryIds(suggestionContextQuery, index)
}

export function collectSuggestions(entries: SuggestionEntryLike[]) {
  const suggestionCounts = new Map<
    string,
    { term: string, count: number, sources: Set<SuggestionSource> }
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
  return Array.from(suggestionCounts.values(), item => ({
    term: item.term,
    count: item.count,
    sources: [...item.sources].toSorted((a, b) => sourceOrder[a] - sourceOrder[b]),
  }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
}

function isLikelyDateNumericQuery(query: string) {
  const trimmed = query.trim()
  return HAS_DIGIT_PATTERN.test(trimmed) && LIKELY_DATE_QUERY_PATTERN.test(trimmed)
}

function compareSuggestionMatches(a: SuggestionMatch, b: SuggestionMatch) {
  if (a.isDateSuggestion && b.isDateSuggestion) {
    if (a.monthSortKey !== null && b.monthSortKey !== null && a.monthSortKey !== b.monthSortKey) {
      return b.monthSortKey - a.monthSortKey
    }
  }

  return (
    a.rank - b.rank
    || b.contextCount - a.contextCount
    || b.suggestion.count - a.suggestion.count
    || a.suggestion.term.localeCompare(b.suggestion.term)
  )
}

function insertTopSuggestionMatch(topMatches: SuggestionMatch[], candidate: SuggestionMatch, limit: number) {
  let index = topMatches.length
  for (let i = 0; i < topMatches.length; i += 1) {
    if (compareSuggestionMatches(candidate, topMatches[i]) < 0) {
      index = i
      break
    }
  }

  topMatches.splice(index, 0, candidate)
  if (topMatches.length > limit)
    topMatches.pop()
}

export function filterSuggestions({
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
}) {
  if (limit <= 0)
    return []
  if (!suggestionQuery)
    return []
  const normalizedSuggestionQuery = normalizeSuggestionMatchToken(suggestionQuery)
  if (!normalizedSuggestionQuery)
    return []
  if (suggestions.length === 0)
    return []
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
    if (isDateSuggestion && !showDateSuggestions)
      continue
    if (excludedSuggestionTerms.has(normalizedMatchToken))
      continue

    const matchType = hasMaskWildcard
      ? matchesMaskedSuggestion(normalizedMatchToken, normalizedSuggestionQuery)
      : matchesPlainSuggestion(normalizedMatchToken, normalizedSuggestionQuery)
    if (!matchType)
      continue

    const rank = matchType === 'exact' ? 0 : matchType === 'startsWith' ? 1 : 2
    const contextCount = useGlobalCounts
      ? suggestion.count
      : (contextTermCounts?.get(normalizedTerm) ?? 0)
    if (!useGlobalCounts && contextCount === 0)
      continue
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
