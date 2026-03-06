import { queryAll } from './sqlite'
import {
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCharacterAliases,
  parseCharacterAliasesJson,
} from '#lib/characterAliases/shared'

type CharacterAliasRow = {
  characterName: string
  aliases: string[]
}

type RawCharacterAliasRow = {
  characterName: string
  aliasesJson: string
}

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedHasCharacterAliasesTable: boolean | null = null
let cachedCharacterAliases: CharacterAliasRow[] | null = null

const hasCharacterAliasesTable = (): boolean => {
  if (!isDevelopment && cachedHasCharacterAliasesTable !== null) {
    return cachedHasCharacterAliasesTable
  }

  const rows = queryAll<{ name?: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    ['character_aliases'],
  )
  const exists = rows[0]?.name === 'character_aliases'

  if (!isDevelopment) {
    cachedHasCharacterAliasesTable = exists
  }

  return exists
}

export const getCharacterAliases = (): CharacterAliasRow[] => {
  if (!isDevelopment && cachedCharacterAliases) {
    return cachedCharacterAliases
  }

  if (!hasCharacterAliasesTable()) return []

  const rows = queryAll<RawCharacterAliasRow>(
    `
      SELECT
        character_name as characterName,
        aliases as aliasesJson
      FROM character_aliases
      ORDER BY character_name ASC
    `,
  )

  const aliasMap = new Map<string, { characterName: string; aliases: string[] }>()
  rows.forEach(row => {
    const normalizedCharacterName = normalizeCharacterAliasName(row.characterName)
    if (!normalizedCharacterName) return

    const key = normalizeCharacterAliasKey(normalizedCharacterName)
    if (!key) return

    const aliases = parseCharacterAliasesJson(row.aliasesJson)
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      characterName: previous?.characterName ?? normalizedCharacterName,
      aliases: normalizeCharacterAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  const result = [...aliasMap.values()].sort((a, b) =>
    a.characterName.localeCompare(b.characterName, 'ja'),
  )

  if (!isDevelopment) {
    cachedCharacterAliases = result
  }

  return result
}

export const getCharacterAliasesMap = () =>
  new Map(
    getCharacterAliases()
      .map(row => {
        const key = normalizeCharacterAliasKey(row.characterName)
        if (!key) return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
