import type { CharacterCommissions, KeywordAliasEntry } from '@commission-index/domain'
import { normalizeKeywordAliasKey, splitKeywordTerms } from '@commission-index/domain'

export interface KeywordBrowseGroup {
  character: string
  keywords: string[]
}

/**
 * Groups keywords under the character whose works carry them, in the given character order.
 * Every keyword in the data belongs to exactly one character, so a flat keyword list would hide that hierarchy.
 * Aliases collapse to their base keyword; keywords sort by work count, then name.
 */
export function buildKeywordBrowseGroups(
  orderedCharacters: CharacterCommissions[],
  keywordAliases: KeywordAliasEntry[],
): KeywordBrowseGroup[] {
  const baseKeywordByKey = new Map<string, string>()
  for (const row of keywordAliases) {
    for (const term of [row.baseKeyword, ...row.aliases]) {
      const key = normalizeKeywordAliasKey(term)
      if (key && !baseKeywordByKey.has(key))
        baseKeywordByKey.set(key, row.baseKeyword)
    }
  }

  return orderedCharacters
    .filter(character => character.Commissions.length > 0)
    .map((character) => {
      const characterKey = normalizeKeywordAliasKey(character.Character)
      const counts = new Map<string, { keyword: string, count: number }>()

      for (const commission of character.Commissions) {
        const seen = new Set<string>()
        for (const term of splitKeywordTerms(commission.Keyword)) {
          const keyword = baseKeywordByKey.get(normalizeKeywordAliasKey(term) ?? '') ?? term
          const key = normalizeKeywordAliasKey(keyword)
          if (!key || key === characterKey || seen.has(key))
            continue
          seen.add(key)
          const previous = counts.get(key)
          if (previous)
            previous.count += 1
          else
            counts.set(key, { keyword, count: 1 })
        }
      }

      return {
        character: character.Character,
        keywords: [
          ...counts.values(),
        ]
          .toSorted((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
          .map(item => item.keyword),
      }
    })
}
