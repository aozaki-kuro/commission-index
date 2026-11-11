import type { CreatorAliasEntry } from '@commission-index/domain'
import { normalizeCreatorName, parseAliasesJson } from '@commission-index/domain'
import { cachedOutsideDev } from './cachedOutsideDev'
import { getGeneratedFactSourceContent } from './generatedFactSource'

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

export const getCreatorAliases: () => CreatorAliasEntry[] = cachedOutsideDev(loadCreatorAliases)

export const normalizeCreatorSearchName = (value: string) => normalizeCreatorName(value)
