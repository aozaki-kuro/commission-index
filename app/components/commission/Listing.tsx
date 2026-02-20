import Title from '#components/Title'
import { imageImports } from '#data/imageImports'
import { getCharacterSectionId } from '#lib/characters'
import { parseCommissionFileName } from '#lib/commissions'
import type { CharacterCommissions } from '#data/types'
import Image from 'next/image'
import IllustratorInfo from './IllustratorInfo'

type ListingProps = {
  Character: string
  status: 'active' | 'stale'
  commissionMap: Map<string, CharacterCommissions>
}

const isDevelopment = process.env.NODE_ENV === 'development'
const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

/**
 * Listing 组件显示特定角色的所有委托作品，包括图片、信息和链接。
 * @param Character - 角色名称。
 */
const Listing = ({ Character, status, commissionMap }: ListingProps) => {
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
          const month = date.slice(4, 6)
          const day = date.slice(6, 8)
          const searchableDateTerms = [
            date,
            `${year}/${month}/${day}`,
            `${year}-${month}-${day}`,
            `${year} ${month} ${day}`,
            `${year}/${month}`,
            `${year}-${month}`,
          ]
          const altText = `Copyright ©️ ${year} ${creator || 'Anonymous'} & Crystallize`
          const mappedImage = imageImports[commission.fileName as keyof typeof imageImports]
          const devWebpFallbackSrc = `/images/webp/${encodeURIComponent(commission.fileName)}.webp`
          const fallbackImageSrc = `/images/${encodeURIComponent(commission.fileName)}.jpg`
          const resolvedImageSrc =
            mappedImage ?? (isDevelopment ? devWebpFallbackSrc : fallbackImageSrc)
          const elementId = `${sectionId}-${date}`
          const keywordTerms = (commission.Keyword ?? '')
            .split(/[,\n，、;；]/)
            .map(keyword => keyword.trim())
            .filter(Boolean)
          const keywordSearchText = keywordTerms.join(' ')
          const suggestionEntries = [
            { source: 'Character', term: Character },
            ...(creator ? [{ source: 'Creator', term: creator }] : []),
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
              {mappedImage ? (
                <Image
                  src={mappedImage}
                  alt={altText}
                  placeholder="blur"
                  className="pointer-events-none select-none"
                  loading="lazy"
                />
              ) : (
                <Image
                  src={resolvedImageSrc}
                  alt={altText}
                  className="pointer-events-none select-none"
                  loading="lazy"
                  width={1200}
                  height={900}
                  style={{ width: '100%', height: 'auto' }}
                />
              )}
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
