import type { CharacterAliasEntry } from '@commission-index/domain'
import process from 'node:process'
import {
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  parseCharacterAliasesJson,
} from '@commission-index/domain'
import { getGeneratedFactSourceContent } from './generatedFactSource'

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedCharacterAliases: CharacterAliasEntry[] | null = null

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

export function getCharacterAliases(): CharacterAliasEntry[] {
  if (!isDevelopment && cachedCharacterAliases) {
    return cachedCharacterAliases
  }

  const result = loadCharacterAliases()

  if (!isDevelopment) {
    cachedCharacterAliases = result
  }

  return result
}

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
