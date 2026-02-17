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

export type SuggestionEntryLike = {
  id: number
  suggestText: string
  suggestionTerms: string[]
}

export type SearchIndexLike<T extends SearchEntryLike> = {
  entries: T[]
  allIds: Set<number>
  fuse: Fuse<T> | null
}

const normalize = (s: string) => s.trim().toLowerCase()
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasOperatorSyntax = (query: string) => /[|!]/.test(query)
const hasWholeWord = (text: string, term: string) =>
  new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(text)
const normalizeSuggestionMatchToken = (term: string) => normalize(term).replace(/[\s"'`]+/g, '')
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

export const toFuseOperatorQuery = (rawQuery: string) =>
  normalize(rawQuery)
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s*!\s*/g, ' !')
    .replace(/\s+/g, ' ')

export const normalizeSuggestionTerm = (term: string) => getBaseFileName(term).trim()

export const getSuggestionTerms = (suggestText: string) =>
  suggestText
    .split('\n')
    .map(row => {
      const [, ...rest] = row.trim().split('\t')
      return normalize(normalizeSuggestionTerm(rest.join('\t').trim()))
    })
    .filter(Boolean)

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

export const formatSuggestionToken = (term: string) => {
  const normalizedTerm = term.trim()
  if (!normalizedTerm) return ''
  if (!/[\s|!]/.test(normalizedTerm)) return normalizedTerm
  const escapedTerm = normalizedTerm.replace(/"/g, '\\"')
  return `"${escapedTerm}"`
}

export const replaceLastTokenWithSuggestion = (rawQuery: string, suggestion: string) => {
  if (!rawQuery.trim()) return suggestion
  if (/(?:\s|\||!)$/.test(rawQuery)) return `${rawQuery}${suggestion}`

  const tokenMatch = rawQuery.match(/(!?)(?:"[^"]*"|"[^"]*|[^\s|!]+)$/)
  if (!tokenMatch) return `${rawQuery}${suggestion}`

  const [fullToken, negation = ''] = tokenMatch
  const prefix = rawQuery.slice(0, rawQuery.length - fullToken.length)
  return `${prefix}${negation}${suggestion}`
}

export const getMatchedEntryIds = <T extends SearchEntryLike>(
  rawQuery: string,
  index: SearchIndexLike<T>,
) => {
  const { entries, allIds, fuse } = index
  const normalizedRawQuery = normalize(rawQuery)
  if (!entries.length || !fuse) return new Set<number>()
  if (!normalizedRawQuery) return new Set(allIds)

  const terms = normalizedRawQuery.split(/\s+/).filter(Boolean)
  const strictMatchIds =
    !hasOperatorSyntax(normalizedRawQuery) && terms.length
      ? new Set(
          entries
            .filter(entry => terms.every(term => hasWholeWord(entry.searchText, term)))
            .map(entry => entry.id),
        )
      : null

  if (strictMatchIds && strictMatchIds.size > 0) return strictMatchIds
  return new Set(fuse.search(toFuseOperatorQuery(rawQuery)).map(result => result.item.id))
}

export const collectSuggestions = (entries: SuggestionEntryLike[]) => {
  const suggestionCounts = new Map<
    string,
    { term: string; count: number; sources: Set<SuggestionSource> }
  >()
  for (const entry of entries) {
    const suggestionRows = entry.suggestText
      .split('\n')
      .map(row => row.trim())
      .filter(Boolean)
    const uniqueTerms = new Set(entry.suggestionTerms)

    for (const normalizedTerm of uniqueTerms) {
      const matchedRow = suggestionRows.find(row => {
        const [, ...rest] = row.split('\t')
        const term = normalizeSuggestionTerm(rest.join('\t').trim())
        return normalize(term) === normalizedTerm
      })
      const [rawSource = 'Keyword', ...rest] = (matchedRow ?? '').split('\t')
      const source =
        rawSource === 'Character' || rawSource === 'Creator' || rawSource === 'Keyword'
          ? rawSource
          : 'Keyword'
      const originalTerm = normalizeSuggestionTerm(rest.join('\t').trim()) || normalizedTerm
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

  const sourceOrder: SuggestionSource[] = ['Character', 'Keyword', 'Creator']
  return [...suggestionCounts.values()]
    .map(item => ({
      term: item.term,
      count: item.count,
      sources: [...item.sources].sort((a, b) => sourceOrder.indexOf(a) - sourceOrder.indexOf(b)),
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

  const contextTermCounts = new Map<string, number>()
  for (const entry of entries) {
    if (!suggestionContextMatchedIds.has(entry.id)) continue
    for (const term of entry.suggestionTerms) {
      contextTermCounts.set(term, (contextTermCounts.get(term) ?? 0) + 1)
    }
  }

  const exactMatches: Array<{ suggestion: Suggestion; contextCount: number }> = []
  const startsWithMatches: Array<{ suggestion: Suggestion; contextCount: number }> = []
  const includesMatches: Array<{ suggestion: Suggestion; contextCount: number }> = []

  for (const suggestion of suggestions) {
    const normalizedSuggestion = normalizeSuggestionMatchToken(suggestion.term)
    const matchType = matchesMaskedSuggestion(normalizedSuggestion, normalizedSuggestionQuery)
    const contextCount = contextTermCounts.get(normalize(suggestion.term)) ?? 0

    if (matchType === 'exact') {
      exactMatches.push({ suggestion, contextCount })
    } else if (matchType === 'startsWith') {
      startsWithMatches.push({ suggestion, contextCount })
    } else if (matchType === 'includes') {
      includesMatches.push({ suggestion, contextCount })
    }
  }

  const byPriority = (
    a: { suggestion: Suggestion; contextCount: number },
    b: { suggestion: Suggestion; contextCount: number },
  ) =>
    b.contextCount - a.contextCount ||
    b.suggestion.count - a.suggestion.count ||
    a.suggestion.term.localeCompare(b.suggestion.term)

  exactMatches.sort(byPriority)
  startsWithMatches.sort(byPriority)
  includesMatches.sort(byPriority)

  return [...exactMatches, ...startsWithMatches, ...includesMatches]
    .slice(0, limit)
    .map(item => item.suggestion)
}

export const normalizeQuery = normalize
