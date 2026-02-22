import Title from '#components/shared/Title'
import { getCharacterSectionId } from '#lib/characters/nav'
import { parseCommissionFileName } from '#lib/commissions/index'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'
import { normalizeCreatorSearchName } from '#data/creatorAliases'
import type { CharacterCommissions } from '#data/types'
import type { StaticImageData } from 'next/image'
import IllustratorInfo from './IllustratorInfo'
import ProtectedCommissionImage from './ProtectedCommissionImage'

type ListingProps = {
  Character: string
  status: 'active' | 'stale'
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]>
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

/**
 * Listing 组件显示特定角色的所有委托作品，包括图片、信息和链接。
 * @param Character - 角色名称。
 */
const Listing = async ({ Character, status, commissionMap, creatorAliasesMap }: ListingProps) => {
  const imageImports = await getImageImports()
  const sectionId = getCharacterSectionId(Character)
  const characterData = commissionMap.get(Character)
  const commissions = characterData?.Commissions ?? []

  return (
    <div
      id={sectionId}
      data-character-section="true"
      data-character-status={status}
      data-total-commissions={commissions.length}
    >
      {/* 显示角色标题 */}
      <Title Content={Character} />
      {/* 如果没有数据，显示占位文本，否则显示委托作品列表 */}
      {commissions.length === 0 ? (
        <p className="my-4">To be announced ...</p>
      ) : (
        commissions.map(commission => {
          const { date, year, creator } = parseCommissionFileName(commission.fileName)
          const normalizedCreatorName = creator ? normalizeCreatorSearchName(creator) : null
          const creatorAliases = normalizedCreatorName
            ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
            : []
          const month = date.slice(4, 6)
          const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
          const altText = `©️ ${year} ${creator || 'Anonymous'} & Crystallize`
          const mappedImage = imageImports[commission.fileName]
          const fallbackImageSrc = `/images/webp/${encodeURIComponent(commission.fileName)}.webp`
          const elementId = `${sectionId}-${date}`
          const keywordTerms = (commission.Keyword ?? '')
            .split(/[,\n，、;；]/)
            .map(keyword => keyword.trim())
            .filter(Boolean)
          const keywordSearchText = keywordTerms.join(' ')
          const suggestionEntries = [
            { source: 'Character', term: Character },
            { source: 'Date', term: `${year}/${month}` },
            ...(creator ? [{ source: 'Creator', term: creator }] : []),
            ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
            ...keywordTerms.map(keyword => ({ source: 'Keyword', term: keyword })),
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
            Character,
            creator,
            ...creatorAliases,
            ...searchableDateTerms,
            commission.Design ?? '',
            commission.Description ?? '',
            keywordSearchText,
          ]
            .join(' ')
            .toLowerCase()

          return (
            <div
              key={commission.fileName}
              id={elementId}
              className="pt-4"
              data-commission-entry="true"
              data-character-section-id={sectionId}
              data-search-text={searchText}
              data-search-suggest={searchSuggestionText}
            >
              {/* 如果有图片资源，显示图片 */}
              <ProtectedCommissionImage
                altText={altText}
                mappedImage={mappedImage}
                resolvedImageSrc={fallbackImageSrc}
              />
              {/* 显示委托作品的详细信息 */}
              <div className="mt-6 mb-2 md:mt-8 md:mb-4">
                <IllustratorInfo commission={commission} kebabName={sectionId} />
              </div>
            </div>
          )
        })
      )}
      <div className="pb-6" />
    </div>
  )
}

export default Listing
