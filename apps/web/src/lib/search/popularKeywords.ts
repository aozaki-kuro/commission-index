import { buildPopularKeywordPoolFromSuggestTexts as buildPopularKeywordPool } from '@commission-index/domain'

export { dedupeKeywords } from '@commission-index/domain'

export const DEFAULT_MAX_POPULAR_KEYWORDS = 36

export function buildPopularKeywordPoolFromSuggestTexts(suggestTexts: Iterable<string>, maxKeywords = DEFAULT_MAX_POPULAR_KEYWORDS) {
  return buildPopularKeywordPool(suggestTexts, maxKeywords)
}
