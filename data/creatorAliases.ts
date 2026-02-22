import { queryAll } from './sqlite'

type CreatorAliasRow = {
  creatorName: string
  aliases: string[]
}

type RawCreatorAliasRow = {
  creatorName: string
  aliasesJson: string
}

const normalizeCreatorName = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withoutPartSuffix = trimmed.replace(/\s+\(part\s+\d+\)$/i, '').trim()
  return withoutPartSuffix || null
}

const parseAliasesJson = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return Array.from(
        new Set(
          parsed.filter((item): item is string => typeof item === 'string').map(v => v.trim()),
        ),
      ).filter(Boolean)
    }
  } catch {
    // Ignore malformed rows and fall back to an empty alias list.
  }

  return []
}

const hasCreatorAliasesTable = (): boolean => {
  const rows = queryAll<{ name?: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    ['creator_aliases'],
  )
  return rows[0]?.name === 'creator_aliases'
}

export const getCreatorAliases = (): CreatorAliasRow[] => {
  if (!hasCreatorAliasesTable()) return []

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
  rows.forEach(row => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName) return

    const aliases = parseAliasesJson(row.aliasesJson)
    aliasMap.set(
      creatorName,
      Array.from(new Set([...(aliasMap.get(creatorName) ?? []), ...aliases])),
    )
  })

  return [...aliasMap.entries()].map(([creatorName, aliases]) => ({ creatorName, aliases }))
}

export const getCreatorAliasesMap = () =>
  new Map(getCreatorAliases().map(row => [row.creatorName, row.aliases] as const))

export const normalizeCreatorSearchName = (value: string) => normalizeCreatorName(value)
