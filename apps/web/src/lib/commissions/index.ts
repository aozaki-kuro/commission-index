import type { CharacterCommissions, Commission, Props } from '@data/types'

export type CommissionWithCharacter = Commission & { character: string }

/**
 * Filter out hidden commissions to speed up builds.
 */
export function filterHiddenCommissions(data: Props): Props {
  return data.map(characterData => ({
    ...characterData,
    Commissions: characterData.Commissions.filter(c => !c.Hidden),
  }))
}

/**
 * Merge legacy series while keeping independent works separate.
 */
export function mergePartsAndPreviews<T extends Commission>(commissions: T[]): Map<string, T> {
  const commissionMap = new Map<string, T>()

  commissions.forEach((commission) => {
    const seriesKey = commission.seriesKey || `commission:${commission.id}`
    const existing = commissionMap.get(seriesKey)
    if (!existing) {
      commissionMap.set(seriesKey, commission)
      return
    }

    if (commission.seriesOrder != null && existing.seriesOrder != null) {
      if (commission.seriesOrder.localeCompare(existing.seriesOrder) > 0) {
        commissionMap.set(seriesKey, commission)
      }
      return
    }

    if (sortCommissionsByDate(commission, existing) < 0) {
      commissionMap.set(seriesKey, commission)
    }
  })

  return commissionMap
}

/**
 * Sort commissions by date (desc).
 */
export function sortCommissionsByDate<T extends Commission>(a: T, b: T): number {
  const dateOrder = (b.commissionDate ?? '').localeCompare(a.commissionDate ?? '')
  return dateOrder || b.id - a.id
}

/**
 * Flatten commission data to include character names for downstream processing.
 */
export function flattenCommissions(data: Props, predicate?: (character: CharacterCommissions) => boolean): CommissionWithCharacter[] {
  return data
    .filter(entry => (predicate ? predicate(entry) : true))
    .flatMap(({ Character, Commissions }) =>
      Commissions.map(commission => ({ ...commission, character: Character })),
    )
}

/**
 * Deduplicate legacy series and sort by explicit date, then stable identity.
 */
export function collectUniqueCommissions(commissions: CommissionWithCharacter[]): CommissionWithCharacter[] {
  return [...mergePartsAndPreviews(commissions).values()].toSorted(sortCommissionsByDate)
}
