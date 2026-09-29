import type { Props } from '@data/types'
import { getCharacterSectionId } from '@lib/characters/nav'
import {
  collectUniqueCommissions,
  flattenCommissions,
} from '@lib/commissions'
import { parseAndFormatDate } from '@lib/date/format'

export interface HomeUpdateEntry {
  key: string
  character: string
  href: string
  dateLabel: string
}

export interface HomeUpdateSummary {
  totalCommissions: number
  entries: HomeUpdateEntry[]
}

export const isMilestoneCommissionCount = (num: number): boolean => num > 0 && num % 50 === 0

export function buildHomeUpdateSummary(commissionData: Props, activeCharacters: string[]): HomeUpdateSummary {
  const activeCharacterSet = new Set(activeCharacters)

  const totalCommissions = collectUniqueCommissions(flattenCommissions(commissionData)).length

  const latestEntries = flattenCommissions(commissionData, ({ Character }) =>
    activeCharacterSet.has(Character))
  const uniqueEntries = collectUniqueCommissions(latestEntries)

  const entries = uniqueEntries.slice(0, 3).map((commission) => {
    const compactDate = commission.commissionDate?.replaceAll('-', '') ?? ''
    return {
      key: String(commission.id),
      character: commission.character,
      href: `#${getCharacterSectionId(commission.character)}-commission-${commission.id}`,
      dateLabel: compactDate ? parseAndFormatDate(compactDate, 'yyyy/MM/dd') : '',
    }
  })

  return {
    totalCommissions,
    entries,
  }
}
