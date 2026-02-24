import { normalizeCreatorSearchName } from '#data/creatorAliases'
import type { Commission } from '#data/types'
import { parseCommissionFileName } from '#lib/commissions'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'
import { getBaseFileName } from '#lib/utils/strings'
import type { StaticImageData } from 'next/image'
import IllustratorInfo from './IllustratorInfo'
import ProtectedCommissionImage from './ProtectedCommissionImage'

export interface CommissionRenderEntry {
  character: string
  commission: Commission
  sectionId: string
  entryKey: string
  entryAnchorPrefix: string
}

interface CommissionEntriesProps {
  entries: CommissionRenderEntry[]
  creatorAliasesMap: Map<string, string[]> | null
  showCharacterLabel?: boolean
}

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

type ImageImportMap = Record<string, StaticImageData>

const getImageImports = async (): Promise<ImageImportMap> => {
  if (process.env.NODE_ENV === 'development') {
    return {}
  }

  const { imageImports } = await import('#data/imageImports')
  return imageImports as ImageImportMap
}

const renderCommissionEntries = async ({
  entries,
  creatorAliasesMap,
  showCharacterLabel = false,
}: CommissionEntriesProps) => {
  const imageImports = await getImageImports()
  const shouldEmbedSearchMetadata = process.env.NODE_ENV !== 'production'

  return entries.map(({ character, commission, sectionId, entryKey, entryAnchorPrefix }) => {
    const { date, year, creator } = parseCommissionFileName(commission.fileName)
    const normalizedCreatorName =
      shouldEmbedSearchMetadata && creator ? normalizeCreatorSearchName(creator) : null
    const creatorAliases =
      shouldEmbedSearchMetadata && normalizedCreatorName && creatorAliasesMap
        ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
        : []
    const month = date.slice(4, 6)
    const copyrightCreator = creator ? getBaseFileName(creator).trim() || creator : 'Anonymous'
    const altText = `© ${year} ${copyrightCreator} & Crystallize`
    const mappedImage = imageImports[commission.fileName]
    const fallbackImageSrc = `/images/webp/${encodeURIComponent(commission.fileName)}.webp`
    const elementId = `${entryAnchorPrefix}-${date}`
    const keywordTerms = (commission.Keyword ?? '')
      .split(/[,\n，、;；]/)
      .map(keyword => keyword.trim())
      .filter(Boolean)
    const searchAttributes = shouldEmbedSearchMetadata
      ? (() => {
          const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
          const keywordSearchText = keywordTerms.join(' ')
          const suggestionEntries = [
            { source: 'Character', term: character },
            { source: 'Date', term: `${year}/${month}` },
            ...(normalizedCreatorName
              ? [{ source: 'Creator' as const, term: normalizedCreatorName }]
              : []),
            ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
            ...keywordTerms.map(keyword => ({ source: 'Keyword' as const, term: keyword })),
          ]
          const uniqueSuggestions = new Map<string, { source: string; term: string }>()
          for (const entry of suggestionEntries) {
            const normalizedTerm = normalizeSuggestionKey(entry.term)
            if (!normalizedTerm || uniqueSuggestions.has(normalizedTerm)) continue
            uniqueSuggestions.set(normalizedTerm, entry)
          }
          const searchSuggestionText = [...uniqueSuggestions.values()]
            .map(entry => `${entry.source}\t${entry.term}`)
            .join('\n')
          const searchText = [
            character,
            normalizedCreatorName,
            ...creatorAliases,
            ...searchableDateTerms,
            commission.Design ?? '',
            commission.Description ?? '',
            keywordSearchText,
          ]
            .join(' ')
            .toLowerCase()

          return {
            'data-search-text': searchText,
            'data-search-suggest': searchSuggestionText,
          }
        })()
      : null

    return (
      <div
        key={entryKey}
        id={elementId}
        className="pt-4"
        data-commission-entry="true"
        data-character-section-id={sectionId}
        {...(searchAttributes ?? {})}
      >
        <ProtectedCommissionImage
          altText={altText}
          mappedImage={mappedImage}
          resolvedImageSrc={fallbackImageSrc}
        />
        <div className="mt-6 mb-2 md:mt-8 md:mb-4">
          {showCharacterLabel ? (
            <div className="mb-2 font-mono text-xs text-gray-600 md:text-sm dark:text-gray-400">
              {character}
            </div>
          ) : null}
          <IllustratorInfo commission={commission} kebabName={entryAnchorPrefix} />
        </div>
      </div>
    )
  })
}

export default renderCommissionEntries
