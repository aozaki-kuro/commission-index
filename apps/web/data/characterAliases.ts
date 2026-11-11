import type { CharacterAliasEntry } from '@commission-index/domain'
import {
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  parseCharacterAliasesJson,
} from '@commission-index/domain'
import { cachedOutsideDev } from './cachedOutsideDev'
import { getGeneratedFactSourceContent } from './generatedFactSource'

function loadCharacterAliases(): CharacterAliasEntry[] {
  const aliasMap = new Map<string, { characterName: string, aliases: string[] }>()
  getGeneratedFactSourceContent().characterAliases.forEach((row) => {
    const normalizedCharacterName = normalizeCharacterAliasName(row.characterName)
    if (!normalizedCharacterName)
      return

    const key = normalizeCharacterAliasKey(normalizedCharacterName)
    if (!key)
      return

    const aliases = parseCharacterAliasesJson(JSON.stringify(row.aliases))
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      characterName: previous?.characterName ?? normalizedCharacterName,
      aliases: normalizeCharacterAliases([
        ...(previous?.aliases ?? []),
        ...aliases,
      ]),
    })
  })

  return [
    ...aliasMap.values(),
  ].toSorted((a, b) =>
    a.characterName.localeCompare(b.characterName, 'ja'))
}

export const getCharacterAliases: () => CharacterAliasEntry[] = cachedOutsideDev(loadCharacterAliases)

export function getCharacterAliasesMap() {
  return new Map(
    getCharacterAliases()
      .map((row) => {
        const key = normalizeCharacterAliasKey(row.characterName)
        if (!key)
          return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
}
