import type { KeywordAliasEntry } from '@commission-index/domain'
import process from 'node:process'
import {
  normalizeKeywordAliases,
  normalizeKeywordAliasKey,
  parseKeywordAliasesJson,
} from '@commission-index/domain'
import { getGeneratedFactSourceContent } from './generatedFactSource'

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedKeywordAliases: KeywordAliasEntry[] | null = null

function loadKeywordAliases(): KeywordAliasEntry[] {
  const aliasMap = new Map<string, { baseKeyword: string, aliases: string[] }>()
  getGeneratedFactSourceContent().keywordAliases.forEach((row) => {
    const normalizedBaseKeyword = row.baseKeyword.trim()
    if (!normalizedBaseKeyword)
      return

    const key = normalizeKeywordAliasKey(normalizedBaseKeyword)
    if (!key)
      return

    const aliases = parseKeywordAliasesJson(JSON.stringify(row.aliases))
    const previous = aliasMap.get(key)
    aliasMap.set(key, {
      baseKeyword: previous?.baseKeyword ?? normalizedBaseKeyword,
      aliases: normalizeKeywordAliases([
        ...(previous?.aliases ?? []),
        ...aliases,
      ]),
    })
  })

  return [
    ...aliasMap.values(),
  ].toSorted((a, b) =>
    a.baseKeyword.localeCompare(b.baseKeyword, 'ja'))
}

export function getKeywordAliases(): KeywordAliasEntry[] {
  if (!isDevelopment && cachedKeywordAliases) {
    return cachedKeywordAliases
  }

  const result = loadKeywordAliases()

  if (!isDevelopment) {
    cachedKeywordAliases = result
  }

  return result
}

export function getKeywordAliasesMap() {
  return new Map(
    getKeywordAliases()
      .map((row) => {
        const key = normalizeKeywordAliasKey(row.baseKeyword)
        if (!key)
          return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
}
