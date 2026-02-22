import type { CommissionRow } from '#lib/admin/db'
import { parseCommissionFileName } from '#lib/commissions/index'
import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

export interface AdminCommissionSearchMetadata {
  searchText: string
  searchSuggestionText: string
}

const buildSearchParts = (
  characterName: string,
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
) => {
  const { date, year, creator } = parseCommissionFileName(commission.fileName)
  const month = date.slice(4, 6)
  const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
  const normalizedCreatorName = creator ? normalizeCreatorName(creator) : null
  const creatorAliases = normalizedCreatorName
    ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
    : []
  const keywordTerms = (commission.keyword ?? '')
    .split(/[,\n，、;；]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)
  const keywordSearchText = keywordTerms.join(' ')

  const suggestionEntries = [
    { source: 'Character', term: characterName },
    ...(year && month ? [{ source: 'Date', term: `${year}/${month}` }] : []),
    ...(creator ? [{ source: 'Creator', term: creator }] : []),
    ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
    ...keywordTerms.map(keyword => ({ source: 'Keyword' as const, term: keyword })),
  ]

  const uniqueSuggestions = new Map<string, { source: string; term: string }>()
  for (const entry of suggestionEntries) {
    const normalizedTerm = normalizeSuggestionKey(entry.term)
    if (!normalizedTerm || uniqueSuggestions.has(normalizedTerm)) continue
    uniqueSuggestions.set(normalizedTerm, entry)
  }

  const searchText = [
    characterName,
    creator ?? '',
    ...creatorAliases,
    ...searchableDateTerms,
    commission.fileName,
    commission.design ?? '',
    commission.description ?? '',
    keywordSearchText,
  ]
    .join(' ')
    .toLowerCase()

  return { searchText, uniqueSuggestions }
}

export const buildAdminCommissionSearchText = (
  characterName: string,
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
) => buildSearchParts(characterName, commission, creatorAliasesMap).searchText

export const buildAdminCommissionSearchMetadata = (
  characterName: string,
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
): AdminCommissionSearchMetadata => {
  const { searchText, uniqueSuggestions } = buildSearchParts(
    characterName,
    commission,
    creatorAliasesMap,
  )

  return {
    searchText,
    searchSuggestionText: [...uniqueSuggestions.values()]
      .map(entry => `${entry.source}\t${entry.term}`)
      .join('\n'),
  }
}
