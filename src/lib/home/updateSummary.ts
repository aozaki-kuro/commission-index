import type { Props } from '#data/types'
import {
  collectUniqueCommissions,
  flattenCommissions,
  parseCommissionFileName,
} from '#lib/commissions'
import { parseAndFormatDate } from '#lib/date/format'
import { getBaseFileName, kebabCase } from '#lib/utils/strings'

export type HomeUpdateEntry = {
  key: string
  character: string
  href: string
  dateLabel: string
}

export type HomeUpdateSummary = {
  totalCommissions: number
  entries: HomeUpdateEntry[]
}

export const isMilestoneCommissionCount = (num: number): boolean => num > 0 && num % 50 === 0

export const buildHomeUpdateSummary = (
  commissionData: Props,
  activeCharacters: string[],
): HomeUpdateSummary => {
  const activeCharacterSet = new Set(activeCharacters)

  const totalCommissions = new Set(
    commissionData.flatMap(({ Commissions }) =>
      Commissions.map(({ fileName }) => getBaseFileName(fileName)),
    ),
  ).size

  const latestEntries = flattenCommissions(commissionData, ({ Character }) =>
    activeCharacterSet.has(Character),
  )
  const uniqueEntries = collectUniqueCommissions(latestEntries)

  const entries = uniqueEntries.slice(0, 3).map(({ fileName, character }) => {
    const { date } = parseCommissionFileName(fileName)
    return {
      key: fileName,
      character,
      href: `#${kebabCase(character)}-${date}`,
      dateLabel: parseAndFormatDate(date, 'yyyy/MM/dd'),
    }
  })

  return {
    totalCommissions,
    entries,
  }
}
