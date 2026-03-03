import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getCharacterStatus } from '#data/commissionStatus'
import { getCommissionData } from '#data/commissionData'
import { getCreatorAliases } from '#data/creatorAliases'
import { buildCommissionTimeline } from '#lib/commissions/timeline'
import type { SitePayload } from '#lib/sitePayload'
import { buildCommissionDataMap } from '#lib/sitePayload'
import { writeFileIfChanged } from './writeFileIfChanged'

const outputPath = path.join(process.cwd(), 'public', 'data', 'site-payload.json')

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

export const generateSitePayloadFile = async () => {
  const payload = buildSitePayload()

  await mkdir(path.dirname(outputPath), { recursive: true })
  const result = await writeFileIfChanged(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    console.log(`Site payload unchanged -> ${relativeOutputPath}`)
  } else {
    console.log(`Generated site payload -> ${relativeOutputPath}`)
  }
}

if (import.meta.main) {
  await generateSitePayloadFile()
}
