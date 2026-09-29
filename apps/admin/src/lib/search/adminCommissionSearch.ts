import type {
  AdminCommissionSearchRow,
  CreatorAliasRow,
} from '@commission-index/domain'
import {
  buildCommissionSearchMetadata,
  buildDateSearchTokensFromCompactDate,
  normalizeCreatorName,
} from '@commission-index/domain'

const WHITESPACE_PATTERN = /\s+/g

export interface AdminCommissionSearchEntry {
  characterId: number
  id: number
  searchText: string
}

export function normalizeAdminSearchQuery(value: string) {
  return value.trim().toLowerCase().replace(WHITESPACE_PATTERN, ' ')
}

function buildCreatorAliasesMap(rows: CreatorAliasRow[]) {
  const aliasesMap = new Map<string, string[]>()
  for (const row of rows) {
    aliasesMap.set(row.creatorName, row.aliases)
    aliasesMap.set(row.creatorName.toLocaleLowerCase(), row.aliases)
  }
  return aliasesMap
}

function getCommissionSearchDetails(row: AdminCommissionSearchRow, creatorAliasesMap: Map<string, string[]>) {
  const creatorKey = row.creatorName ? normalizeCreatorName(row.creatorName) : null
  const creatorAliases = creatorKey ? creatorAliasesMap.get(creatorKey.toLocaleLowerCase()) ?? [] : []
  const dateTerms = row.commissionDate
    ? [
        row.commissionDate,
        row.commissionDate.replaceAll('-', ''),
        ...buildDateSearchTokensFromCompactDate(row.commissionDate.replaceAll('-', '')),
      ]
    : []

  return [...dateTerms, row.creatorName ?? '', ...creatorAliases].join(' ').toLowerCase()
}

export function buildAdminCommissionSearchEntries(
  rows: AdminCommissionSearchRow[],
  creatorAliases: CreatorAliasRow[],
): AdminCommissionSearchEntry[] {
  const creatorAliasesMap = buildCreatorAliasesMap(creatorAliases)

  return rows.map(row => ({
    characterId: row.characterId,
    id: row.id,
    searchText: [
      buildCommissionSearchMetadata({
        characterName: row.characterName,
        creatorAliasesMap,
        creatorSearchTextMode: 'raw',
        creatorSuggestionMode: 'raw',
        description: row.description,
        design: row.design,
        commissionDate: row.commissionDate,
        creatorName: row.creatorName,
        fileName: row.fileName,
        keyword: row.keyword,
      }).searchText,
      getCommissionSearchDetails(row, creatorAliasesMap),
    ].join(' '),
  }))
}

export function buildCommissionToCharacterMap(rows: AdminCommissionSearchRow[]) {
  const next = new Map<number, number>()
  for (const row of rows) {
    next.set(row.id, row.characterId)
  }
  return next
}

export function collectMatchedCharacterIds(
  matchedCommissionIds: ReadonlySet<number>,
  commissionToCharacterIdMap: ReadonlyMap<number, number>,
) {
  const next = new Set<number>()
  for (const commissionId of matchedCommissionIds) {
    const characterId = commissionToCharacterIdMap.get(commissionId)
    if (characterId !== undefined) {
      next.add(characterId)
    }
  }
  return next
}
