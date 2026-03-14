import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { parseSuggestionRows } from '#lib/search/index'

export const DEFAULT_MAX_POPULAR_KEYWORDS = 36

const NORMALIZE_SPACES_PATTERN = /\s+/g
const normalizeKeyword = (value: string) => value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
const normalizeKeywordKey = (value: string) => normalizeKeyword(value).toLowerCase()

export function dedupeKeywords(keywords: Iterable<string>, maxCount = Number.POSITIVE_INFINITY) {
  const uniqueKeywords: string[] = []
  const seen = new Set<string>()

  for (const keyword of keywords) {
    const normalized = normalizeKeyword(keyword)
    if (!normalized)
      continue

    const key = normalizeKeywordKey(normalized)
    if (seen.has(key))
      continue

    seen.add(key)
    uniqueKeywords.push(normalized)

    if (uniqueKeywords.length >= maxCount)
      break
  }

  return uniqueKeywords
}

export function buildPopularKeywordPoolFromSuggestTexts(suggestTexts: Iterable<string>, maxKeywords = DEFAULT_MAX_POPULAR_KEYWORDS) {
  const termStats = new Map<string, { term: string, count: number }>()

  for (const suggestText of suggestTexts) {
    const parsedRows = parseSuggestionRows(suggestText)
    let hasPrimaryCreatorInEntry = false

    for (const { source, term } of parsedRows.values()) {
      if (source === 'Date')
        continue
      if (source === 'Creator' && hasPrimaryCreatorInEntry)
        continue

      const normalizedTerm
        = source === 'Creator' ? (normalizeCreatorName(term) ?? term.trim()) : term.trim()
      if (!normalizedTerm)
        continue

      const normalizedKey = normalizedTerm.toLowerCase()
      const previous = termStats.get(normalizedKey)
      if (previous) {
        previous.count += 1
      }
      else {
        termStats.set(normalizedKey, {
          term: normalizedTerm,
          count: 1,
        })
      }

      if (source === 'Creator') {
        hasPrimaryCreatorInEntry = true
      }
    }
  }

  return termStats.values().toSorted((a, b) => {
    if (a.count !== b.count)
      return b.count - a.count
    return a.term.localeCompare(b.term)
  }).slice(0, maxKeywords).map(item => item.term)
}
