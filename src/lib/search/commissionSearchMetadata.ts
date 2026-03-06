import { normalizeCharacterAliasKey } from '#lib/characterAliases/shared'
import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { normalizeKeywordAliasKey, splitKeywordTerms } from '#lib/keywordAliases/shared'
import { parseCommissionFileName } from '#lib/commissions/index'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'

type SuggestionSource = 'Character' | 'Creator' | 'Keyword' | 'Date'
type CreatorMode = 'normalized' | 'raw'
type CreatorSearchTextMode = CreatorMode | 'both'

type BuildCommissionSearchMetadataInput = {
  characterName: string
  fileName: string
  design?: string | null
  description?: string | null
  keyword?: string | null
  characterAliasesMap?: Map<string, string[]>
  creatorAliasesMap?: Map<string, string[]>
  keywordAliasesMap?: Map<string, string[]>
  creatorSuggestionMode?: CreatorMode
  creatorSearchTextMode?: CreatorSearchTextMode
}

type CommissionSearchMetadata = {
  searchText: string
  searchSuggestionText: string
}

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

const resolveCreatorSuggestionTerm = (
  rawCreatorName: string | null,
  normalizedCreatorName: string | null,
  mode: CreatorMode,
) => {
  if (mode === 'raw') return rawCreatorName
  return normalizedCreatorName
}

const resolveCreatorSearchTerms = (
  rawCreatorName: string | null,
  normalizedCreatorName: string | null,
  mode: CreatorSearchTextMode,
) => {
  if (mode === 'raw') {
    return rawCreatorName ? [rawCreatorName] : []
  }

  if (mode === 'both') {
    const terms = [normalizedCreatorName, rawCreatorName].filter((value): value is string =>
      Boolean(value),
    )
    return Array.from(new Set(terms))
  }

  return normalizedCreatorName ? [normalizedCreatorName] : []
}

export const buildCommissionSearchDomKey = (sectionId: string, fileName: string) =>
  `${sectionId}::${fileName}`

export const buildCommissionSearchMetadata = ({
  characterName,
  fileName,
  design,
  description,
  keyword,
  characterAliasesMap,
  creatorAliasesMap,
  keywordAliasesMap,
  creatorSuggestionMode = 'normalized',
  creatorSearchTextMode = 'normalized',
}: BuildCommissionSearchMetadataInput): CommissionSearchMetadata => {
  const { date, year, creator } = parseCommissionFileName(fileName)
  const month = date.slice(4, 6)
  const characterAliasKey = normalizeCharacterAliasKey(characterName)
  const characterAliases =
    characterAliasKey && characterAliasesMap
      ? (characterAliasesMap.get(characterAliasKey) ?? [])
      : []
  const rawCreatorName = creator?.trim() || null
  const normalizedCreatorName = rawCreatorName ? normalizeCreatorName(rawCreatorName) : null
  const creatorAliases =
    normalizedCreatorName && creatorAliasesMap
      ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
      : []
  const keywordTerms = splitKeywordTerms(keyword)
  const keywordAliasTerms = Array.from(
    new Set(
      keywordTerms.flatMap(term => {
        const key = normalizeKeywordAliasKey(term)
        if (!key || !keywordAliasesMap) return []
        return keywordAliasesMap.get(key) ?? []
      }),
    ),
  )
  const keywordSearchText = keywordTerms.join(' ')
  const keywordAliasesSearchText = keywordAliasTerms.join(' ')
  const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
  const creatorSuggestionTerm = resolveCreatorSuggestionTerm(
    rawCreatorName,
    normalizedCreatorName,
    creatorSuggestionMode,
  )
  const creatorSearchTerms = resolveCreatorSearchTerms(
    rawCreatorName,
    normalizedCreatorName,
    creatorSearchTextMode,
  )

  const suggestionEntries: Array<{ source: SuggestionSource; term: string }> = [
    { source: 'Character', term: characterName },
    ...characterAliases.map(alias => ({ source: 'Character' as const, term: alias })),
    ...(year && month ? [{ source: 'Date' as const, term: `${year}/${month}` }] : []),
    ...(creatorSuggestionTerm ? [{ source: 'Creator' as const, term: creatorSuggestionTerm }] : []),
    ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
    ...keywordTerms.map(term => ({ source: 'Keyword' as const, term })),
    ...keywordAliasTerms.map(term => ({ source: 'Keyword' as const, term })),
  ]

  const uniqueSuggestions = new Map<string, { source: SuggestionSource; term: string }>()
  for (const entry of suggestionEntries) {
    const normalizedTerm = normalizeSuggestionKey(entry.term)
    if (!normalizedTerm || uniqueSuggestions.has(normalizedTerm)) continue
    uniqueSuggestions.set(normalizedTerm, entry)
  }

  return {
    searchText: [
      characterName,
      ...characterAliases,
      ...creatorSearchTerms,
      ...creatorAliases,
      ...searchableDateTerms,
      design ?? '',
      description ?? '',
      keywordSearchText,
      keywordAliasesSearchText,
    ]
      .join(' ')
      .toLowerCase(),
    searchSuggestionText: [...uniqueSuggestions.values()]
      .map(entry => `${entry.source}\t${entry.term}`)
      .join('\n'),
  }
}
