import { CharacterCommissions, Commission, Props } from '#data/types'
import { getBaseFileName } from '#lib/utils/strings'

export type CommissionWithCharacter = Commission & { character: string }

/**
 * Filter out hidden commissions to speed up builds.
 */
export const filterHiddenCommissions = (data: Props): Props =>
  data.map(characterData => ({
    ...characterData,
    Commissions: characterData.Commissions.filter(c => !c.Hidden),
  }))

/**
 * Merge parts/previews, keeping the latest version.
 */
export function mergePartsAndPreviews<T extends Commission>(commissions: T[]): Map<string, T> {
  const commissionMap = new Map<string, T>()

  commissions.forEach(commission => {
    const baseFileName = getBaseFileName(commission.fileName)
    const existing = commissionMap.get(baseFileName)

    if (!existing || commission.fileName > existing.fileName) {
      commissionMap.set(baseFileName, commission)
    }
  })

  return commissionMap
}

/**
 * Sort commissions by date (desc).
 */
export function sortCommissionsByDate<T extends Commission>(a: T, b: T): number {
  return b.fileName.localeCompare(a.fileName)
}

/**
 * Extract metadata from a commission file name.
 */
export function parseCommissionFileName(fileName: string) {
  const date = fileName.slice(0, 8)
  const year = date.slice(0, 4)
  const creator = fileName.slice(9)
  return { date, year, creator }
}

/**
 * Flatten commission data to include character names for downstream processing.
 */
export const flattenCommissions = (
  data: Props,
  predicate?: (character: CharacterCommissions) => boolean,
): CommissionWithCharacter[] =>
  data
    .filter(entry => (predicate ? predicate(entry) : true))
    .flatMap(({ Character, Commissions }) =>
      Commissions.map(commission => ({ ...commission, character: Character })),
    )

/**
 * Deduplicate and sort commissions by latest file name.
 */
export const collectUniqueCommissions = (
  commissions: CommissionWithCharacter[],
): CommissionWithCharacter[] =>
  Array.from(mergePartsAndPreviews(commissions).values()).sort(sortCommissionsByDate)
