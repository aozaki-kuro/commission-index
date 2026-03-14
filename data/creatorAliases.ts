import process from 'node:process'
import { normalizeCreatorName, parseAliasesJson } from '#lib/creatorAliases/shared'
import { queryAll } from './sqlite'

interface CreatorAliasRow {
  creatorName: string
  aliases: string[]
}

interface RawCreatorAliasRow {
  creatorName: string
  aliasesJson: string
}

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedHasCreatorAliasesTable: boolean | null = null
let cachedCreatorAliases: CreatorAliasRow[] | null = null

function hasCreatorAliasesTable(): boolean {
  if (!isDevelopment && cachedHasCreatorAliasesTable !== null) {
    return cachedHasCreatorAliasesTable
  }

  const rows = queryAll<{ name?: string }>(
    'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ? LIMIT 1',
    ['creator_aliases'],
  )
  const exists = rows[0]?.name === 'creator_aliases'

  if (!isDevelopment) {
    cachedHasCreatorAliasesTable = exists
  }

  return exists
}

export function getCreatorAliases(): CreatorAliasRow[] {
  if (!isDevelopment && cachedCreatorAliases) {
    return cachedCreatorAliases
  }

  if (!hasCreatorAliasesTable())
    return []

  const rows = queryAll<RawCreatorAliasRow>(
    `
      SELECT
        creator_name as creatorName,
        aliases as aliasesJson
      FROM creator_aliases
      ORDER BY creator_name ASC
    `,
  )

  const aliasMap = new Map<string, string[]>()
  rows.forEach((row) => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName)
      return

    const aliases = parseAliasesJson(row.aliasesJson)
    aliasMap.set(
      creatorName,
      [...new Set([...(aliasMap.get(creatorName) ?? []), ...aliases])],
    )
  })

  const result = Array.from(aliasMap.entries(), ([creatorName, aliases]) => ({ creatorName, aliases }))

  if (!isDevelopment) {
    cachedCreatorAliases = result
  }

  return result
}

export function getCreatorAliasesMap() {
  return new Map(getCreatorAliases().map(row => [row.creatorName, row.aliases] as const))
}

export const normalizeCreatorSearchName = (value: string) => normalizeCreatorName(value)
