import type { SitePayload } from '#lib/sitePayload'
import process from 'node:process'
import { buildCommissionData } from '#data/commissionData'
import { characterRecords, getCharacterRecords } from '#data/commissionRecords'
import { buildCharacterStatus } from '#data/commissionStatus'
import { getCreatorAliases } from '#data/creatorAliases'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import { buildCommissionDataMap } from '#lib/sitePayload'

const isDevelopment = process.env.NODE_ENV === 'development'

export function buildSitePayload(): SitePayload {
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
