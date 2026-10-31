import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { compareCommissionsByDate } from './commissionPresentation'

export interface LinkClickCount {
  url: string
  count: number
}

export interface PopularCommissionRow {
  row: AdminCommissionSearchRow
  clicks: number
  votes: number
}

// D1 stores links as a JSON array string ('[]' when empty); legacy/null rows arrive as ''.
export function parseCommissionLinks(links: string): string[] {
  try {
    const parsed = JSON.parse(links) as unknown
    return Array.isArray(parsed)
      ? parsed.map(link => String(link).trim()).filter(Boolean)
      : []
  }
  catch {
    return []
  }
}

// Clicks are recorded under whatever href the site rendered at the time, so a link edited from twitter.com to x.com
// (or re-cased) must still match. The query string stays: Hedao `pid` and Nijie `id` identify the work.
export function normalizeLinkUrl(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^twitter\.com\//, 'x.com/')
    .replace(/#.*$/, '')
    .replace(/\/(?=\?|$)/, '')
}

/** Works with clicks or votes, by clicks, then votes, then newest. A link shared by several works counts for each. */
export function rankPopularCommissions(
  rows: readonly AdminCommissionSearchRow[],
  clicks: readonly LinkClickCount[],
  votes: Readonly<Record<string, number>>,
  limit = 10,
): PopularCommissionRow[] {
  const clicksByUrl = new Map<string, number>()
  for (const { url, count } of clicks) {
    const key = normalizeLinkUrl(url)
    clicksByUrl.set(key, (clicksByUrl.get(key) ?? 0) + count)
  }

  return rows
    .flatMap((row) => {
      const linkKeys = new Set(parseCommissionLinks(row.links).map(normalizeLinkUrl))
      const rowClicks = [...linkKeys].reduce((sum, key) => sum + (clicksByUrl.get(key) ?? 0), 0)
      const rowVotes = votes[row.publicId] ?? 0
      return rowClicks > 0 || rowVotes > 0
        ? [
            { row, clicks: rowClicks, votes: rowVotes },
          ]
        : []
    })
    .sort((left, right) =>
      right.clicks - left.clicks
      || right.votes - left.votes
      || compareCommissionsByDate(left.row, right.row))
    .slice(0, limit)
}
