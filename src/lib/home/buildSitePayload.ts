import { buildCommissionData } from '#data/commissionData'
import { buildCharacterStatus } from '#data/commissionStatus'
import { characterRecords, getCharacterRecords } from '#data/commissionRecords'
import { getCreatorAliases } from '#data/creatorAliases'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { buildCommissionDataMap, type SitePayload } from '#lib/sitePayload'

const isDevelopment = process.env.NODE_ENV === 'development'

export const buildSitePayload = (): SitePayload => {
  const records = isDevelopment ? getCharacterRecords() : characterRecords
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
