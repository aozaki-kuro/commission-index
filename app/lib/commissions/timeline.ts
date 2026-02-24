import type { CharacterCommissions, Commission } from '#data/types'
import type { CharacterNavItem } from '#lib/characters/nav'
import { sortCommissionsByDate } from '#lib/commissions'

export interface TimelineCommissionEntry {
  character: string
  commission: Commission
}

export interface TimelineYearGroup {
  yearKey: string
  sectionId: string
  titleId: string
  navItem: CharacterNavItem
  entries: TimelineCommissionEntry[]
}

export const getTimelineYearSectionId = (yearKey: string) => `timeline-year-${yearKey}`

export const getTimelineYearTitleId = (yearKey: string) =>
  `title-${getTimelineYearSectionId(yearKey)}`

export const buildTimelineYearNavItem = (yearKey: string): CharacterNavItem => {
  const sectionId = getTimelineYearSectionId(yearKey)
  const titleId = getTimelineYearTitleId(yearKey)

  return {
    displayName: yearKey,
    sectionId,
    titleId,
    sectionHash: `#${sectionId}`,
    titleHash: `#${titleId}`,
  }
}

export const buildCommissionTimeline = (
  commissionMap: Map<string, CharacterCommissions>,
): {
  groups: TimelineYearGroup[]
  navItems: CharacterNavItem[]
} => {
  const sortedEntries = [...commissionMap.values()]
    .flatMap(({ Character, Commissions }) =>
      Commissions.map(commission => ({ character: Character, commission })),
    )
    .sort((a, b) => sortCommissionsByDate(a.commission, b.commission))

  const groupsByYear = new Map<string, TimelineYearGroup>()

  for (const entry of sortedEntries) {
    const yearKey = entry.commission.fileName.slice(0, 4)
    const existing = groupsByYear.get(yearKey)

    if (existing) {
      existing.entries.push(entry)
      continue
    }

    const navItem = buildTimelineYearNavItem(yearKey)
    groupsByYear.set(yearKey, {
      yearKey,
      sectionId: navItem.sectionId,
      titleId: navItem.titleId,
      navItem,
      entries: [entry],
    })
  }

  const groups = [...groupsByYear.values()]
  return {
    groups,
    navItems: groups.map(group => group.navItem),
  }
}
