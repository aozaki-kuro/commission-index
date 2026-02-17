import Fuse from 'fuse.js'
import { getBaseFileName } from '#lib/strings'

export type SuggestionSource = 'Character' | 'Creator' | 'Keyword'

export type Suggestion = {
  term: string
  count: number
  sources: SuggestionSource[]
}

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
  fuse: Fuse<T> | null
}

type PreparedSuggestion = {
  suggestion: Suggestion
  normalizedTerm: string
  normalizedMatchToken: string
}

const normalize = (s: string) => s.trim().toLowerCase()
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasOperatorSyntax = (query: string) => /[|!]/.test(query)
const normalizeSuggestionMatchToken = (term: string) => normalize(term).replace(/[\s"'`]+/g, '')
const trailingTokenSeparatorPattern = /(?:\s|\||!)$/
const replaceLastTokenPattern = /(.*)([\s|!]+)(.*$)/
const MAX_QUERY_CACHE_SIZE = 300
const EMPTY_IDS = new Set<number>()
const matchedIdsCache = new WeakMap<object, Map<string, Set<number>>>()
const strictTermMatchesCache = new WeakMap<object, Map<string, Set<number>>>()
const preparedSuggestionsCache = new WeakMap<Suggestion[], PreparedSuggestion[]>()
const contextTermCountsCache = new WeakMap<
  SuggestionEntryLike[],
  WeakMap<Set<number>, Map<string, number>>
>()

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
  const next = suggestions.map(suggestion => ({
    suggestion,
    normalizedTerm: normalize(suggestion.term),
    normalizedMatchToken: normalizeSuggestionMatchToken(suggestion.term),
  }))
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

  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')
  const matches = new Set(
    index.entries.filter(entry => pattern.test(entry.searchText)).map(entry => entry.id),
  )
  termCache.set(term, matches)
  return matches
}

const intersectInto = (source: Set<number>, filter: Set<number>) => {
  if (source.size > filter.size) {
    const next = new Set<number>()
    for (const id of filter) {
      if (source.has(id)) next.add(id)
    }
    return next
  }

  const next = new Set<number>()
  for (const id of source) {
    if (filter.has(id)) next.add(id)
  }
  return next
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
  for (const entry of entries) {
    if (!matchedIds.has(entry.id)) continue
    for (const term of entry.suggestionRows.keys()) {
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }
  byMatchedSet.set(matchedIds, counts)
  return counts
}

const toSuggestionSource = (rawSource: string): SuggestionSource => {
  if (rawSource === 'Character' || rawSource === 'Creator' || rawSource === 'Keyword') {
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

const matchesMaskedAt = (pattern: string, query: string, startIndex: number) => {
  for (let i = 0; i < query.length; i += 1) {
    const patternChar = pattern[startIndex + i]
    const queryChar = query[i]
    if (patternChar === '*') continue
    if (patternChar !== queryChar) return false
  }
  return true
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

const toFuseOperatorQuery = (rawQuery: string) =>
  normalize(rawQuery)
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s*!\s*/g, ' !')
    .replace(/\s+/g, ' ')

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
  const tokenMatch = rawQuery.match(/(?:^|[\s|])!?(?:"([^"]*)|([^\s|!]*))$/)
  if (!tokenMatch) return ''
  return tokenMatch[1] ?? tokenMatch[2] ?? ''
}

export const extractSuggestionContextQuery = (rawQuery: string) => {
  if (!rawQuery.trim()) return ''
  if (/(?:\s|\||!)$/.test(rawQuery)) return rawQuery

  const tokenMatch = rawQuery.match(/(!?)(?:"[^"]*"|"[^"]*|[^\s|!]+)$/)
  if (!tokenMatch) return rawQuery

  const [fullToken] = tokenMatch
  return rawQuery.slice(0, rawQuery.length - fullToken.length).trimEnd()
}

export const getMatchedEntryIds = <T extends SearchEntryLike>(
  rawQuery: string,
  index: SearchIndexLike<T>,
) => {
  const { entries, allIds, fuse } = index
  const normalizedRawQuery = toFuseOperatorQuery(rawQuery)
  if (!entries.length || !fuse) return EMPTY_IDS
  if (!normalizedRawQuery) return allIds

  const queryCache = getQueryCache(index)
  const cached = queryCache.get(normalizedRawQuery)
  if (cached) return cached

  const terms = normalizedRawQuery.split(/\s+/).filter(Boolean)
  let strictMatchIds: Set<number> | null = null

  if (!hasOperatorSyntax(normalizedRawQuery) && terms.length) {
    let currentMatches: Set<number> | null = null
    for (const term of terms) {
      const termMatches = getStrictTermMatches(index, term)
      currentMatches = currentMatches ? intersectInto(currentMatches, termMatches) : termMatches
      if (currentMatches.size === 0) break
    }
    strictMatchIds = currentMatches ? new Set(currentMatches) : null
  }

  const matched =
    strictMatchIds && strictMatchIds.size > 0
      ? strictMatchIds
      : new Set(fuse.search(normalizedRawQuery).map(result => result.item.id))
  if (queryCache.size >= MAX_QUERY_CACHE_SIZE) {
    const oldestKey = queryCache.keys().next().value
    if (oldestKey) queryCache.delete(oldestKey)
  }
  queryCache.set(normalizedRawQuery, matched)
  return matched
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

  const sourceOrder = { Character: 0, Keyword: 1, Creator: 2 } satisfies Record<
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

export const filterSuggestions = ({
  entries,
  suggestions,
  suggestionQuery,
  suggestionContextMatchedIds,
  limit = 8,
}: {
  entries: SuggestionEntryLike[]
  suggestions: Suggestion[]
  suggestionQuery: string
  suggestionContextMatchedIds: Set<number>
  limit?: number
}) => {
  if (!suggestionQuery) return []
  const normalizedSuggestionQuery = normalizeSuggestionMatchToken(suggestionQuery)
  if (!normalizedSuggestionQuery) return []
  if (suggestions.length === 0) return []

  const useGlobalCounts = suggestionContextMatchedIds.size === entries.length
  const contextTermCounts = useGlobalCounts
    ? null
    : getContextTermCounts(entries, suggestionContextMatchedIds)
  const matches: Array<{ suggestion: Suggestion; contextCount: number; rank: 0 | 1 | 2 }> = []
  const preparedSuggestions = getPreparedSuggestions(suggestions)

  for (const preparedSuggestion of preparedSuggestions) {
    const { suggestion, normalizedMatchToken, normalizedTerm } = preparedSuggestion
    const matchType = matchesMaskedSuggestion(normalizedMatchToken, normalizedSuggestionQuery)
    if (!matchType) continue

    const rank = matchType === 'exact' ? 0 : matchType === 'startsWith' ? 1 : 2
    const contextCount = useGlobalCounts
      ? suggestion.count
      : (contextTermCounts?.get(normalizedTerm) ?? 0)
    matches.push({ suggestion, contextCount, rank })
  }

  const byPriority = (
    a: { suggestion: Suggestion; contextCount: number; rank: 0 | 1 | 2 },
    b: { suggestion: Suggestion; contextCount: number; rank: 0 | 1 | 2 },
  ) =>
    a.rank - b.rank ||
    b.contextCount - a.contextCount ||
    b.suggestion.count - a.suggestion.count ||
    a.suggestion.term.localeCompare(b.suggestion.term)

  return matches
    .sort(byPriority)
    .slice(0, limit)
    .map(item => item.suggestion)
}

export const normalizeQuery = normalize
