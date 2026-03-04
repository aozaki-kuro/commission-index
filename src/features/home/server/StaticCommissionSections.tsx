import type { CharacterCommissions } from '#data/types'
import type { TimelineYearGroup } from '#lib/commissions/timeline'
import Listing from '#features/home/commission/Listing'
import TimelineView from '#features/home/commission/TimelineView'

type CharacterDisplay = {
  DisplayName: string
}

interface StaticCommissionSectionsProps {
  activeChars: CharacterDisplay[]
  staleChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
  timelineGroups: TimelineYearGroup[]
  creatorAliasesMap: Map<string, string[]>
}

const StaticCommissionSections = ({
  activeChars,
  staleChars,
  commissionMap,
  timelineGroups,
  creatorAliasesMap,
}: StaticCommissionSectionsProps) => {
  return (
    <div id="--------Commissions--------">
      <div data-commission-view-panel="character" data-commission-view-active="true">
        {activeChars.map((chara, index) => (
          <Listing
            Character={chara.DisplayName}
            status="active"
            commissionMap={commissionMap}
            creatorAliasesMap={creatorAliasesMap}
            prioritizeFirstImage={index === 0}
            key={chara.DisplayName}
          />
        ))}

        <div id="--------Stale Divder--------" data-stale-divider="true">
          <div className="pt-0" />
          <hr />
          <div className="pb-8" />
        </div>

        {staleChars.map(chara => (
          <Listing
            Character={chara.DisplayName}
            status="stale"
            commissionMap={commissionMap}
            creatorAliasesMap={creatorAliasesMap}
            key={chara.DisplayName}
          />
        ))}
      </div>

      <div
        data-commission-view-panel="timeline"
        data-commission-view-active="false"
        className="hidden"
      >
        <TimelineView groups={timelineGroups} creatorAliasesMap={creatorAliasesMap} />
      </div>
    </div>
  )
}

export default StaticCommissionSections
