import { normalizeCreatorName } from '#lib/creatorAliases/shared'
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
  creatorAliasesMap?: Map<string, string[]>
  creatorSuggestionMode?: CreatorMode
  creatorSearchTextMode?: CreatorSearchTextMode
}

type CommissionSearchMetadata = {
  searchText: string
  searchSuggestionText: string
}

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

const splitKeywordTerms = (keyword: string | null | undefined) =>
  (keyword ?? '')
    .split(/[,\n，、;；]/)
    .map(item => item.trim())
    .filter(Boolean)

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
  creatorAliasesMap,
  creatorSuggestionMode = 'normalized',
  creatorSearchTextMode = 'normalized',
}: BuildCommissionSearchMetadataInput): CommissionSearchMetadata => {
  const { date, year, creator } = parseCommissionFileName(fileName)
  const month = date.slice(4, 6)
  const rawCreatorName = creator?.trim() || null
  const normalizedCreatorName = rawCreatorName ? normalizeCreatorName(rawCreatorName) : null
  const creatorAliases =
    normalizedCreatorName && creatorAliasesMap
      ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
      : []
  const keywordTerms = splitKeywordTerms(keyword)
  const keywordSearchText = keywordTerms.join(' ')
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
    ...(year && month ? [{ source: 'Date' as const, term: `${year}/${month}` }] : []),
    ...(creatorSuggestionTerm ? [{ source: 'Creator' as const, term: creatorSuggestionTerm }] : []),
    ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
    ...keywordTerms.map(term => ({ source: 'Keyword' as const, term })),
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
      ...creatorSearchTerms,
      ...creatorAliases,
      ...searchableDateTerms,
      design ?? '',
      description ?? '',
      keywordSearchText,
    ]
      .join(' ')
      .toLowerCase(),
    searchSuggestionText: [...uniqueSuggestions.values()]
      .map(entry => `${entry.source}\t${entry.term}`)
      .join('\n'),
  }
}
