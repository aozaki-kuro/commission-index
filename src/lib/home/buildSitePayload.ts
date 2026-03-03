import { getCharacterStatus } from '#data/commissionStatus'
import { getCommissionData } from '#data/commissionData'
import { getCreatorAliases } from '#data/creatorAliases'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { buildCommissionDataMap, type SitePayload } from '#lib/sitePayload'

export const buildSitePayload = (): SitePayload => {
  const commissionData = getCommissionData()
  const characterStatus = getCharacterStatus()
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
