import { normalizeCreatorName } from './creatorAliases'
import { parseSuggestionRows } from './search'

/**
 * Ranks suggestion terms by how many entries carry them (Date rows skipped, one primary Creator per entry).
 * Product contract: the admin Suggestion options and the web fallback pool both rank through this function and
 * differ only in `maxKeywords`.
 */
export function buildPopularKeywordPoolFromSuggestTexts(suggestTexts: Iterable<string>, maxKeywords: number): string[] {
  const termStats = new Map<string, { term: string, count: number }>()

  for (const suggestText of suggestTexts) {
    const parsedRows = parseSuggestionRows(suggestText)
    let hasPrimaryCreatorInEntry = false

    for (const { source, term } of parsedRows.values()) {
      if (source === 'Date') {
        continue
      }

      if (source === 'Creator' && hasPrimaryCreatorInEntry) {
        continue
      }

      const normalizedTerm = source === 'Creator'
        ? (normalizeCreatorName(term) ?? term.trim())
        : term.trim()

      if (!normalizedTerm) {
        continue
      }

      const key = normalizedTerm.toLowerCase()
      const previous = termStats.get(key)
      if (previous) {
        previous.count += 1
      }
      else {
        termStats.set(key, {
          term: normalizedTerm,
          count: 1,
        })
      }

      if (source === 'Creator') {
        hasPrimaryCreatorInEntry = true
      }
    }
  }

  return [
    ...termStats.values(),
  ]
    .toSorted((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count
      }

      return left.term.localeCompare(right.term)
    })
    .slice(0, maxKeywords)
    .map(item => item.term)
}
