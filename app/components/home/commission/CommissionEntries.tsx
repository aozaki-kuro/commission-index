import type { Commission } from '#data/types'
import { parseCommissionFileName } from '#lib/commissions'
import {
  buildCommissionSearchDomKey,
  buildCommissionSearchMetadata,
} from '#lib/search/commissionSearchMetadata'
import { getBaseFileName } from '#lib/utils/strings'
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
  embedSearchMetadata?: boolean
}

const renderCommissionEntries = ({
  entries,
  creatorAliasesMap,
  showCharacterLabel = false,
  embedSearchMetadata,
}: CommissionEntriesProps) => {
  const shouldEmbedSearchMetadata = embedSearchMetadata ?? process.env.NODE_ENV !== 'production'

  return entries.map(({ character, commission, sectionId, entryKey, entryAnchorPrefix }) => {
    const { date, year, creator } = parseCommissionFileName(commission.fileName)
    const copyrightCreator = creator ? getBaseFileName(creator).trim() || creator : 'Anonymous'
    const altText = `© ${year} ${copyrightCreator} & Crystallize`
    const imageSrc = `/images/webp/${encodeURIComponent(commission.fileName)}.webp`
    const elementId = `${entryAnchorPrefix}-${date}`
    const searchKey = buildCommissionSearchDomKey(entryAnchorPrefix, commission.fileName)

    const searchAttributes = shouldEmbedSearchMetadata
      ? (() => {
          const metadata = buildCommissionSearchMetadata({
            characterName: character,
            fileName: commission.fileName,
            design: commission.Design,
            description: commission.Description,
            keyword: commission.Keyword,
            creatorAliasesMap: creatorAliasesMap ?? undefined,
            creatorSuggestionMode: 'normalized',
            creatorSearchTextMode: 'normalized',
          })

          return {
            'data-search-text': metadata.searchText,
            'data-search-suggest': metadata.searchSuggestionText,
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
        data-commission-search-key={searchKey}
        {...(searchAttributes ?? {})}
      >
        <ProtectedCommissionImage altText={altText} resolvedImageSrc={imageSrc} />
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
