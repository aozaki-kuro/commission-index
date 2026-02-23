import Listing from '#components/home/commission/Listing'
import CommissionImageNoticeGate from '#components/home/commission/CommissionImageNoticeGate'
import { getCreatorAliasesMap } from '#data/creatorAliases'
import type { CharacterCommissions } from '#data/types'

interface CommissionProps {
  activeChars: { DisplayName: string }[]
  staleChars: { DisplayName: string }[]
  commissionMap: Map<string, CharacterCommissions>
}

const Commission = async ({ activeChars, staleChars, commissionMap }: CommissionProps) => {
  const creatorAliasesMap = process.env.NODE_ENV === 'production' ? null : getCreatorAliasesMap()

  return (
    <div id="--------Commissions--------">
      {/* Display Active Commissions */}
      {activeChars.map(chara => (
        <Listing
          Character={chara.DisplayName}
          status="active"
          commissionMap={commissionMap}
          creatorAliasesMap={creatorAliasesMap}
          key={chara.DisplayName}
        />
      ))}

      {/* Divider between Active and Stale Commissions */}
      <div id="--------Stale Divder--------" data-stale-divider="true">
        <div className="pt-0" />
        <hr />
        <div className="pb-8" />
      </div>

      {/* Display Stale Commissions */}
      {staleChars.map(chara => (
        <Listing
          Character={chara.DisplayName}
          status="stale"
          commissionMap={commissionMap}
          creatorAliasesMap={creatorAliasesMap}
          key={chara.DisplayName}
        />
      ))}
      <CommissionImageNoticeGate />
    </div>
  )
}

export default Commission
