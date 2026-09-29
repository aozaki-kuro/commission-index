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
  const legacySeries = new Map<string, T[]>()

  for (const commission of commissions) {
    if (!commission.seriesKey) {
      commissionMap.set(`commission:${commission.publicId}`, commission)
      continue
    }

    const series = legacySeries.get(commission.seriesKey) ?? []
    series.push(commission)
    legacySeries.set(commission.seriesKey, series)
  }

  for (const [seriesKey, series] of legacySeries) {
    const parts = series.filter(commission => commission.partNumber != null)
    const previews = series.filter(commission => commission.legacySeriesKind === 'preview')

    if (parts.length > 0) {
      for (const commission of series.filter(commission => !isLegacyPreview(commission))) {
        commissionMap.set(`commission:${commission.publicId}`, commission)
      }
      continue
    }

    if (previews.length === 0) {
      for (const commission of series) {
        commissionMap.set(`commission:${commission.publicId}`, commission)
      }
      continue
    }

    commissionMap.set(`legacy:${seriesKey}`, selectLegacySeriesWinner(series))
  }

  return commissionMap
}

function isLegacyPreview(commission: Commission) {
  return commission.legacySeriesKind === 'preview'
}

function selectLegacySeriesWinner<T extends Commission>(series: T[]) {
  return series.reduce((winner, commission) => {
    if (commission.seriesOrder != null && winner.seriesOrder != null) {
      return commission.seriesOrder.localeCompare(winner.seriesOrder) > 0 ? commission : winner
    }
    return sortCommissionsByDate(commission, winner) < 0 ? commission : winner
  })
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
