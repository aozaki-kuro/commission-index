import type { SitePayload } from '@lib/sitePayload'
import { buildCommissionTimeline } from '@commission-index/domain'
import { buildCommissionData } from '@data/commissionData'
import { getCharacterRecords } from '@data/commissionRecords'
import { buildCharacterStatus } from '@data/commissionStatus'
import { getCreatorAliases } from '@data/creatorAliases'
import { buildCommissionDataMap } from '@lib/sitePayload'

export function buildSitePayload(): SitePayload {
  const records = getCharacterRecords()
  const commissionData = buildCommissionData(records)
  const characterStatus = buildCharacterStatus(records)
  const { groups: timelineGroups, navItems: monthNavItems } = buildCommissionTimeline(
    buildCommissionDataMap(commissionData),
  )

  return {
    commissionData,
    characterStatus,
    creatorAliases: getCreatorAliases(),
    timelineGroups,
    monthNavItems,
    activeCharacterNames: characterStatus.active.map(item => item.DisplayName),
  }
}
