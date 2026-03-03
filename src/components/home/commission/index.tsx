import {
  CommissionViewPanel,
  CommissionViewTabs,
} from '#components/home/commission/CommissionViewMode'
import Listing from '#components/home/commission/Listing'
import { Skeleton } from '#components/ui/skeleton'
import type { CharacterCommissions } from '#data/types'
import type { TimelineYearGroup } from '#lib/commissions/timeline'
import { Suspense, lazy } from 'react'

const CommissionImageNoticeGate = lazy(
  () => import('#components/home/commission/CommissionImageNoticeGate'),
)
const TimelineView = lazy(() => import('#components/home/commission/TimelineView'))

interface CommissionProps {
  activeChars: { DisplayName: string }[]
  staleChars: { DisplayName: string }[]
  commissionMap: Map<string, CharacterCommissions>
  timelineGroups: TimelineYearGroup[]
  creatorAliasesMap: Map<string, string[]>
}

const Commission = ({
  activeChars,
  staleChars,
  commissionMap,
  timelineGroups,
  creatorAliasesMap,
}: CommissionProps) => {
  return (
    <div id="--------Commissions--------">
      <CommissionViewTabs />
      <CommissionViewPanel panel="character" deferInactiveMount>
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
      <CommissionViewPanel panel="timeline" deferInactiveMount>
        <Suspense
          fallback={
            <div className="space-y-6">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="aspect-1280/525 w-full" />
            </div>
          }
        >
          <TimelineView groups={timelineGroups} creatorAliasesMap={creatorAliasesMap} />
        </Suspense>
      </CommissionViewPanel>
      <Suspense fallback={null}>
        <CommissionImageNoticeGate />
      </Suspense>
    </div>
  )
}

export default Commission
