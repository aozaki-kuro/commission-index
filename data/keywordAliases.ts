import { queryAll } from './sqlite'
import {
  normalizeKeywordAliasKey,
  normalizeKeywordAliases,
  parseKeywordAliasesJson,
} from '#lib/keywordAliases/shared'

type KeywordAliasRow = {
  baseKeyword: string
  aliases: string[]
}

type RawKeywordAliasRow = {
  baseKeyword: string
  aliasesJson: string
}

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedHasKeywordAliasesTable: boolean | null = null
let cachedKeywordAliases: KeywordAliasRow[] | null = null

const hasKeywordAliasesTable = (): boolean => {
  if (!isDevelopment && cachedHasKeywordAliasesTable !== null) {
    return cachedHasKeywordAliasesTable
  }

  const rows = queryAll<{ name?: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    ['keyword_aliases'],
  )
  const exists = rows[0]?.name === 'keyword_aliases'

  if (!isDevelopment) {
    cachedHasKeywordAliasesTable = exists
  }

  return exists
}

export const getKeywordAliases = (): KeywordAliasRow[] => {
  if (!isDevelopment && cachedKeywordAliases) {
    return cachedKeywordAliases
  }

  if (!hasKeywordAliasesTable()) return []

  const rows = queryAll<RawKeywordAliasRow>(
    `
      SELECT
        base_keyword as baseKeyword,
        aliases as aliasesJson
      FROM keyword_aliases
      ORDER BY base_keyword ASC
    `,
  )

  const aliasMap = new Map<string, { baseKeyword: string; aliases: string[] }>()
  rows.forEach(row => {
    const normalizedBaseKeyword = row.baseKeyword.trim()
    if (!normalizedBaseKeyword) return

    const key = normalizeKeywordAliasKey(normalizedBaseKeyword)
    if (!key) return

    const aliases = parseKeywordAliasesJson(row.aliasesJson)
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      baseKeyword: previous?.baseKeyword ?? normalizedBaseKeyword,
      aliases: normalizeKeywordAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  const result = [...aliasMap.values()].sort((a, b) =>
    a.baseKeyword.localeCompare(b.baseKeyword, 'ja'),
  )

  if (!isDevelopment) {
    cachedKeywordAliases = result
  }

  return result
}

export const getKeywordAliasesMap = () =>
  new Map(
    getKeywordAliases()
      .map(row => {
        const key = normalizeKeywordAliasKey(row.baseKeyword)
        if (!key) return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
