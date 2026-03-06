import { useCallback, useEffect, useMemo, useState } from 'react'
import CommissionSearch, {
  type SearchSuggestionAliasGroup,
} from '#features/home/search/CommissionSearch'
import { useHomeLocaleMessages } from '#features/home/i18n/HomeLocaleContext'
import {
  buildPopularKeywordPoolFromSuggestTexts,
  dedupeKeywords,
} from '#lib/search/popularKeywords'

const MAX_FEATURED_KEYWORDS = 6
const MAX_VISIBLE_POPULAR_KEYWORDS = 6

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0 || 0x6d2b79f5

  return () => {
    state += 0x6d2b79f5
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const shuffleKeywords = (keywords: string[], seed: number) => {
  const shuffled = [...keywords]
  const random = createSeededRandom(seed)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

const getPopularKeywordBatch = (keywords: string[], page: number, batchSize: number) => {
  if (keywords.length <= batchSize) return keywords

  const seed = (keywords.length * 2654435761 + (page + 1) * 1013904223) >>> 0
  return shuffleKeywords(keywords, seed).slice(0, batchSize)
}

const normalizeKeywordVariantKey = (value: string) => value.trim().toLowerCase()

const buildAliasKeyLookup = (aliasGroups: SearchSuggestionAliasGroup[]) => {
  const keyToGroup = new Map<string, string>()

  for (const group of aliasGroups) {
    const normalizedTerms = Array.from(
      [group.term, ...group.aliases]
        .map(term => normalizeKeywordVariantKey(term))
        .filter((term): term is string => Boolean(term)),
    )

    const uniqueTerms = Array.from(new Set(normalizedTerms))
    if (uniqueTerms.length < 2) continue

    const existingGroup = uniqueTerms.map(term => keyToGroup.get(term)).find(Boolean)
    const groupKey = existingGroup ?? uniqueTerms[0]

    for (const term of uniqueTerms) {
      keyToGroup.set(term, groupKey)
    }
  }

  return keyToGroup
}

const collapseAliasKeywordVariants = (
  keywords: string[],
  aliasGroups: SearchSuggestionAliasGroup[],
  seed: number,
) => {
  if (keywords.length === 0 || aliasGroups.length === 0) return keywords

  const aliasKeyLookup = buildAliasKeyLookup(aliasGroups)
  if (aliasKeyLookup.size === 0) return keywords

  const candidatesByGroup = new Map<string, string[]>()
  const seenCandidateKeysByGroup = new Map<string, Set<string>>()

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeKeywordVariantKey(keyword)
    if (!normalizedKeyword) continue
    const groupKey = aliasKeyLookup.get(normalizedKeyword)
    if (!groupKey) continue

    let seenKeys = seenCandidateKeysByGroup.get(groupKey)
    if (!seenKeys) {
      seenKeys = new Set<string>()
      seenCandidateKeysByGroup.set(groupKey, seenKeys)
    }
    if (seenKeys.has(normalizedKeyword)) continue
    seenKeys.add(normalizedKeyword)

    const candidates = candidatesByGroup.get(groupKey) ?? []
    candidates.push(keyword.trim())
    candidatesByGroup.set(groupKey, candidates)
  }

  const selectedTermByGroup = new Map<string, string>()
  const random = createSeededRandom(seed ^ candidatesByGroup.size)
  for (const [groupKey, candidates] of candidatesByGroup) {
    if (candidates.length === 0) continue
    if (candidates.length === 1) {
      selectedTermByGroup.set(groupKey, candidates[0])
      continue
    }

    const selectedIndex = Math.floor(random() * candidates.length)
    selectedTermByGroup.set(groupKey, candidates[selectedIndex])
  }

  const collapsedKeywords: string[] = []
  const emittedAliasGroups = new Set<string>()
  const emittedKeywordKeys = new Set<string>()

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeKeywordVariantKey(keyword)
    if (!normalizedKeyword) continue

    const groupKey = aliasKeyLookup.get(normalizedKeyword)
    if (!groupKey) {
      if (emittedKeywordKeys.has(normalizedKeyword)) continue
      emittedKeywordKeys.add(normalizedKeyword)
      collapsedKeywords.push(keyword.trim())
      continue
    }
    if (emittedAliasGroups.has(groupKey)) continue

    emittedAliasGroups.add(groupKey)
    const selectedTerm = selectedTermByGroup.get(groupKey) ?? keyword.trim()
    const selectedTermKey = normalizeKeywordVariantKey(selectedTerm)
    if (!selectedTermKey || emittedKeywordKeys.has(selectedTermKey)) continue

    emittedKeywordKeys.add(selectedTermKey)
    collapsedKeywords.push(selectedTerm)
  }

  return collapsedKeywords
}

const buildPopularKeywordPoolFromDom = () => {
  if (typeof document === 'undefined') return []
  const suggestTexts = Array.from(
    document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
  )
    .map(element => element.dataset.searchSuggest ?? '')
    .filter((suggestText): suggestText is string => Boolean(suggestText))

  return buildPopularKeywordPoolFromSuggestTexts(suggestTexts)
}

interface CommissionSearchDeferredProps {
  featuredKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

export default function CommissionSearchDeferred({
  featuredKeywords = [],
  suggestionAliasGroups = [],
}: CommissionSearchDeferredProps = {}) {
  const { controls } = useHomeLocaleMessages()
  const [popularKeywordPage, setPopularKeywordPage] = useState(0)
  const [hasDismissedFeaturedKeywords, setHasDismissedFeaturedKeywords] = useState(false)
  const [popularKeywordPool, setPopularKeywordPool] = useState<string[]>([])

  const dedupedFeaturedKeywordBatch = useMemo(
    () => dedupeKeywords(featuredKeywords, MAX_FEATURED_KEYWORDS),
    [featuredKeywords],
  )
  const featuredKeywordBatch = useMemo(
    () =>
      collapseAliasKeywordVariants(
        dedupedFeaturedKeywordBatch,
        suggestionAliasGroups,
        popularKeywordPage ^ 0x9e3779b9,
      ),
    [dedupedFeaturedKeywordBatch, popularKeywordPage, suggestionAliasGroups],
  )

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setPopularKeywordPool(buildPopularKeywordPoolFromDom())
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  const dedupedPopularKeywordPool = useMemo(
    () =>
      collapseAliasKeywordVariants(popularKeywordPool, suggestionAliasGroups, popularKeywordPage),
    [popularKeywordPage, popularKeywordPool, suggestionAliasGroups],
  )
  const shouldUseFeaturedKeywords = !hasDismissedFeaturedKeywords && featuredKeywordBatch.length > 0
  const popularKeywords = useMemo(
    () =>
      shouldUseFeaturedKeywords
        ? featuredKeywordBatch.slice(0, MAX_VISIBLE_POPULAR_KEYWORDS)
        : getPopularKeywordBatch(
            dedupedPopularKeywordPool,
            popularKeywordPage,
            MAX_VISIBLE_POPULAR_KEYWORDS,
          ),
    [
      dedupedPopularKeywordPool,
      featuredKeywordBatch,
      popularKeywordPage,
      shouldUseFeaturedKeywords,
    ],
  )

  const rotatePopularKeywords = useCallback(() => {
    setHasDismissedFeaturedKeywords(true)
    setPopularKeywordPage(previous => previous + 1)
  }, [])

  return (
    <CommissionSearch
      deferIndexInit
      popularKeywords={popularKeywords}
      refreshPopularSearchLabel={controls.refreshPopularSearchLabel}
      onRotatePopularKeywords={popularKeywords.length > 0 ? rotatePopularKeywords : undefined}
      suggestionAliasGroups={suggestionAliasGroups}
    />
  )
}
