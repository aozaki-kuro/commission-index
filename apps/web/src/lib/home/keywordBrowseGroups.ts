import type { CharacterAliasEntry, CharacterCommissions, KeywordAliasEntry } from '@commission-index/domain'
import { normalizeCharacterAliasKey, normalizeKeywordAliasKey, splitKeywordTerms } from '@commission-index/domain'

export interface KeywordBrowseGroup {
  character: string
  /** Other characters tagged on this character's works, i.e. co-appearances. */
  coCharacters: string[]
  keywords: string[]
}

type TermCounts = Map<string, { term: string, count: number }>

function countTerm(counts: TermCounts, key: string, term: string) {
  const previous = counts.get(key)
  if (previous)
    previous.count += 1
  else
    counts.set(key, { term, count: 1 })
}

function rankTerms(counts: TermCounts) {
  return [
    ...counts.values(),
  ]
    .toSorted((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .map(item => item.term)
}

/**
 * Groups keywords under the character whose works carry them, in the given character order.
 * Every keyword in the data belongs to exactly one character, so a flat keyword list would hide that hierarchy.
 * Aliases collapse to their base keyword; keywords sort by work count, then name.
 * A keyword naming a listed character (directly or by character alias) is a co-appearance tag: it moves to
 * `coCharacters`, or is dropped when it names the character itself.
 */
export function buildKeywordBrowseGroups(
  orderedCharacters: CharacterCommissions[],
  keywordAliases: KeywordAliasEntry[],
  characterAliases: CharacterAliasEntry[] = [],
): KeywordBrowseGroup[] {
  const baseKeywordByKey = new Map<string, string>()
  for (const row of keywordAliases) {
    for (const term of [row.baseKeyword, ...row.aliases]) {
      const key = normalizeKeywordAliasKey(term)
      if (key && !baseKeywordByKey.has(key))
        baseKeywordByKey.set(key, row.baseKeyword)
    }
  }

  const visibleCharacters = orderedCharacters.filter(character => character.Commissions.length > 0)
  const characterByKey = new Map<string, string>()
  for (const character of visibleCharacters) {
    const key = normalizeCharacterAliasKey(character.Character)
    if (key)
      characterByKey.set(key, character.Character)
  }
  for (const row of characterAliases) {
    const character = characterByKey.get(normalizeCharacterAliasKey(row.characterName) ?? '')
    if (!character)
      continue
    for (const alias of row.aliases) {
      const key = normalizeCharacterAliasKey(alias)
      if (key && !characterByKey.has(key))
        characterByKey.set(key, character)
    }
  }

  return visibleCharacters.map((character) => {
    const keywordCounts: TermCounts = new Map()
    const coCharacterCounts: TermCounts = new Map()

    for (const commission of character.Commissions) {
      const seen = new Set<string>()
      for (const term of splitKeywordTerms(commission.Keyword)) {
        const namedCharacter = characterByKey.get(normalizeCharacterAliasKey(term) ?? '')
        if (namedCharacter) {
          if (namedCharacter !== character.Character && !seen.has(`character:${namedCharacter}`)) {
            seen.add(`character:${namedCharacter}`)
            countTerm(coCharacterCounts, namedCharacter, namedCharacter)
          }
          continue
        }

        const keyword = baseKeywordByKey.get(normalizeKeywordAliasKey(term) ?? '') ?? term
        const key = normalizeKeywordAliasKey(keyword)
        if (!key || seen.has(key))
          continue
        seen.add(key)
        countTerm(keywordCounts, key, keyword)
      }
    }

    return {
      character: character.Character,
      coCharacters: rankTerms(coCharacterCounts),
      keywords: rankTerms(keywordCounts),
    }
  })
}
