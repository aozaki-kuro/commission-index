import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { compareCommissionsByDate } from './commissionPresentation'

export interface RankedInterestRow {
  row: AdminCommissionSearchRow
  votes: number
}

// D1 stores links as a JSON array string ('[]' when empty); legacy/null rows arrive as ''.
function hasSourceLinks(links: string) {
  try {
    const parsed = JSON.parse(links) as unknown
    return Array.isArray(parsed) && parsed.some(link => String(link).trim() !== '')
  }
  catch {
    return false
  }
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
      return votes > 0 && !hasSourceLinks(row.links)
        ? [
            { row, votes },
          ]
        : []
    })
    .sort((left, right) => right.votes - left.votes || compareCommissionsByDate(left.row, right.row))
    .slice(0, limit)
}
