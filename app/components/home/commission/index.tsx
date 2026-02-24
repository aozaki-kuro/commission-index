import {
  CommissionViewPanel,
  CommissionViewTabs,
} from '#components/home/commission/CommissionViewMode'
import Listing from '#components/home/commission/Listing'
import CommissionImageNoticeGate from '#components/home/commission/CommissionImageNoticeGate'
import TimelineView from '#components/home/commission/TimelineView'
import { getCreatorAliasesMap } from '#data/creatorAliases'
import type { CharacterCommissions } from '#data/types'
import type { TimelineYearGroup } from '#lib/commissions/timeline'

interface CommissionProps {
  activeChars: { DisplayName: string }[]
  staleChars: { DisplayName: string }[]
  commissionMap: Map<string, CharacterCommissions>
  timelineGroups: TimelineYearGroup[]
}

const Commission = async ({
  activeChars,
  staleChars,
  commissionMap,
  timelineGroups,
}: CommissionProps) => {
  const creatorAliasesMap = getCreatorAliasesMap()

  return (
    <div id="--------Commissions--------">
      <CommissionViewTabs />
      <CommissionViewPanel panel="character">
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
      </CommissionViewPanel>
      <CommissionViewPanel panel="timeline">
        <TimelineView groups={timelineGroups} creatorAliasesMap={creatorAliasesMap} />
      </CommissionViewPanel>
      <CommissionImageNoticeGate />
    </div>
  )
}

export default Commission
