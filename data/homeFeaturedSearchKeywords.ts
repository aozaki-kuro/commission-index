import { queryAll } from '#data/sqlite'
import { dedupeKeywords } from '#lib/search/popularKeywords'

const DEFAULT_FEATURED_LIMIT = 6

type SQLiteTableRow = {
  name: string
}

type FeaturedKeywordRow = {
  keyword: string
}

const hasHomeFeaturedKeywordsTable = (): boolean => {
  const rows = queryAll<SQLiteTableRow>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'home_featured_search_keywords' LIMIT 1",
  )
  return rows.some(row => row.name === 'home_featured_search_keywords')
}

export const getHomeFeaturedSearchKeywords = (limit = DEFAULT_FEATURED_LIMIT) => {
  if (limit <= 0) return []
  if (!hasHomeFeaturedKeywordsTable()) return []

  const rows = queryAll<FeaturedKeywordRow>(
    `
      SELECT keyword
      FROM home_featured_search_keywords
      ORDER BY sort_order ASC
      LIMIT ?
    `,
    [limit],
  )

  return dedupeKeywords(
    rows.map(row => row.keyword),
    limit,
  )
}
