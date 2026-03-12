import { queryAll } from '#data/sqlite'
import { dedupeKeywords } from '#lib/search/popularKeywords'

const DEFAULT_FEATURED_LIMIT = 6
const isDevelopment = process.env.NODE_ENV === 'development'
let cachedHasHomeFeaturedKeywordsTable: boolean | null = null
const cachedFeaturedKeywordsByLimit = new Map<number, string[]>()

type SQLiteTableRow = {
  name: string
}

type FeaturedKeywordRow = {
  keyword: string
}

const hasHomeFeaturedKeywordsTable = (): boolean => {
  if (!isDevelopment && cachedHasHomeFeaturedKeywordsTable !== null) {
    return cachedHasHomeFeaturedKeywordsTable
  }

  const rows = queryAll<SQLiteTableRow>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'home_featured_search_keywords' LIMIT 1",
  )
  const exists = rows.some(row => row.name === 'home_featured_search_keywords')

  if (!isDevelopment) {
    cachedHasHomeFeaturedKeywordsTable = exists
  }

  return exists
}

export const getHomeFeaturedSearchKeywords = (limit = DEFAULT_FEATURED_LIMIT) => {
  if (limit <= 0) return []
  if (!isDevelopment) {
    const cached = cachedFeaturedKeywordsByLimit.get(limit)
    if (cached) return cached
  }
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

  const keywords = dedupeKeywords(
    rows.map(row => row.keyword),
    limit,
  )

  if (!isDevelopment) {
    cachedFeaturedKeywordsByLimit.set(limit, keywords)
  }

  return keywords
}
