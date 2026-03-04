import Title from '#components/shared/Title'
import { getCharacterSectionId } from '#lib/characters/nav'
import type { CharacterCommissions } from '#data/types'
import CommissionEntries from './CommissionEntries'

type ListingProps = {
  Character: string
  status: 'active' | 'stale'
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]> | null
  prioritizeFirstImage?: boolean
}

/**
 * Listing 组件显示特定角色的所有委托作品，包括图片、信息和链接。
 * @param Character - 角色名称。
 */
const Listing = ({
  Character,
  status,
  commissionMap,
  creatorAliasesMap,
  prioritizeFirstImage = false,
}: ListingProps) => {
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
        <CommissionEntries
          entries={commissions.map(commission => ({
            character: Character,
            commission,
            sectionId,
            entryKey: `${Character}:${commission.fileName}`,
            entryAnchorPrefix: sectionId,
          }))}
          creatorAliasesMap={creatorAliasesMap}
          prioritizeFirstImage={prioritizeFirstImage}
        />
      )}
      <div className="pb-6" />
    </div>
  )
}

export default Listing
