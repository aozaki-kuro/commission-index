import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { compareCommissionsByDate } from './commissionPresentation'
import { parseCommissionLinks } from './popularCommissions'

export interface RankedInterestRow {
  row: AdminCommissionSearchRow
  votes: number
}

/** Unpublished (no source links) works with at least one vote, most votes first, ties newest first. */
export function rankUnpublishedInterest(
  rows: readonly AdminCommissionSearchRow[],
  counts: Readonly<Record<string, number>>,
  limit = 10,
): RankedInterestRow[] {
  return rows
    .flatMap((row) => {
      const votes = counts[row.publicId] ?? 0
      return votes > 0 && parseCommissionLinks(row.links).length === 0
        ? [
            { row, votes },
          ]
        : []
    })
    .sort((left, right) => right.votes - left.votes || compareCommissionsByDate(left.row, right.row))
    .slice(0, limit)
}
