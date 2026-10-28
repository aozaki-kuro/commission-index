import type { CreatorAliasEntry } from '@commission-index/domain'
import process from 'node:process'
import { normalizeCreatorName, parseAliasesJson } from '@commission-index/domain'
import { getGeneratedFactSourceContent } from './generatedFactSource'

const isDevelopment = process.env.NODE_ENV === 'development'
let cachedCreatorAliases: CreatorAliasEntry[] | null = null

function loadCreatorAliases(): CreatorAliasEntry[] {
  const aliasMap = new Map<string, string[]>()
  getGeneratedFactSourceContent().creatorAliases.forEach((row) => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName)
      return

    const aliases = parseAliasesJson(JSON.stringify(row.aliases))
    aliasMap.set(
      creatorName,
      [
        ...new Set([
          ...(aliasMap.get(creatorName) ?? []),
          ...aliases,
        ]),
      ],
    )
  })

  return Array.from(aliasMap.entries(), ([creatorName, aliases]) => ({ creatorName, aliases }))
}

export function getCreatorAliases(): CreatorAliasEntry[] {
  if (!isDevelopment && cachedCreatorAliases) {
    return cachedCreatorAliases
  }

  const result = loadCreatorAliases()

  if (!isDevelopment) {
    cachedCreatorAliases = result
  }

  return result
}

export function getCreatorAliasesMap() {
  return new Map(getCreatorAliases().map(row => [row.creatorName, row.aliases] as const))
}

export const normalizeCreatorSearchName = (value: string) => normalizeCreatorName(value)
