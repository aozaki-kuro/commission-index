import type { CharacterCommissions, Commission } from './content'
import type { CharacterNavItem } from './navigation'

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

export function getTimelineYearTitleId(yearKey: string) {
  return `title-${getTimelineYearSectionId(yearKey)}`
}

export function buildTimelineYearNavItem(yearKey: string): CharacterNavItem {
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

type DatedCommission = Commission & { commissionDate: string }

function sortCommissionsByDate(a: DatedCommission, b: DatedCommission): number {
  const dateOrder = b.commissionDate.localeCompare(a.commissionDate)
  return dateOrder || b.id - a.id
}

export function buildCommissionTimeline(commissionMap: Map<string, CharacterCommissions>): {
  groups: TimelineYearGroup[]
  navItems: CharacterNavItem[]
} {
  const sortedEntries = [...commissionMap.values()]
    .flatMap(({ Character, Commissions }) =>
      Commissions.map(commission => ({ character: Character, commission })),
    )
    .filter((entry): entry is typeof entry & { commission: DatedCommission } => entry.commission.commissionDate !== null)
    .sort((a, b) => sortCommissionsByDate(a.commission, b.commission))

  const groupsByYear = new Map<string, TimelineYearGroup>()

  for (const entry of sortedEntries) {
    const yearKey = entry.commission.commissionDate.slice(0, 4)
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
