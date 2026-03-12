import { useCallback, useEffect, useMemo, useState } from 'react'
import CommissionSearch, {
  type CommissionSearchEntrySource,
  type SearchSuggestionAliasGroup,
} from '#features/home/search/CommissionSearch'
import { resolveHomeControls } from '#features/home/i18n/homeLocale'
import {
  buildPopularKeywordPoolFromSuggestTexts,
  dedupeKeywords,
} from '#lib/search/popularKeywords'

const MAX_FEATURED_KEYWORDS = 6
const MAX_VISIBLE_POPULAR_KEYWORDS = 6
const HOME_SEARCH_INDEX_URL = '/search/home-search-entries.json'
const COMMISSION_ENTRY_SELECTOR = '[data-commission-entry="true"]'

let cachedHomeSearchEntries: CommissionSearchEntrySource[] | null = null
let homeSearchEntriesPromise: Promise<CommissionSearchEntrySource[]> | null = null

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

const collectSearchEntryElementsFromNode = (root: ParentNode): HTMLElement[] => {
  const directEntries = Array.from(root.querySelectorAll<HTMLElement>(COMMISSION_ENTRY_SELECTOR))
  const nestedTemplateEntries = Array.from(
    root.querySelectorAll<HTMLTemplateElement>('template'),
  ).flatMap(template => collectSearchEntryElementsFromNode(template.content))

  return [...directEntries, ...nestedTemplateEntries]
}

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

const buildSearchEntriesFromDom = (): CommissionSearchEntrySource[] => {
  if (typeof document === 'undefined') return []

  const entriesByKey = new Map<string, Omit<CommissionSearchEntrySource, 'id'>>()
  collectSearchEntryElementsFromNode(document).forEach(element => {
    const domKey = element.dataset.commissionSearchKey
    const searchText = element.dataset.searchText
    if (!domKey || !searchText || entriesByKey.has(domKey)) return

    entriesByKey.set(domKey, {
      domKey,
      searchText,
      searchSuggest: element.dataset.searchSuggest,
    })
  })

  return Array.from(entriesByKey.values()).map((entry, id) => ({
    id,
    ...entry,
  }))
}

const buildPopularKeywordPoolFromEntries = (entries: CommissionSearchEntrySource[]) =>
  buildPopularKeywordPoolFromSuggestTexts(
    entries
      .map(entry => entry.searchSuggest ?? '')
      .filter((suggestText): suggestText is string => Boolean(suggestText)),
  )

interface CommissionSearchDeferredProps {
  locale?: string
  featuredKeywords?: string[]
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

export default function CommissionSearchDeferred({
  locale,
  featuredKeywords = [],
  suggestionAliasGroups = [],
}: CommissionSearchDeferredProps = {}) {
  const controls = resolveHomeControls(locale)
  const shouldLoadFetchedEntries = Boolean(import.meta.env?.PROD)
  const [popularKeywordPage, setPopularKeywordPage] = useState(0)
  const [hasDismissedFeaturedKeywords, setHasDismissedFeaturedKeywords] = useState(false)
  const [externalEntries, setExternalEntries] = useState<CommissionSearchEntrySource[] | null>(
    () => {
      if (shouldLoadFetchedEntries) return cachedHomeSearchEntries
      const entries = buildSearchEntriesFromDom()
      return entries.length > 0 ? entries : null
    },
  )
  const [popularKeywordPool, setPopularKeywordPool] = useState<string[]>(() =>
    externalEntries ? buildPopularKeywordPoolFromEntries(externalEntries) : [],
  )

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
    if (shouldLoadFetchedEntries) {
      if (cachedHomeSearchEntries) return

      let active = true
      if (!homeSearchEntriesPromise) {
        homeSearchEntriesPromise = fetch(HOME_SEARCH_INDEX_URL)
          .then(async response => {
            if (!response.ok) {
              throw new Error(`Failed to load search index: ${response.status}`)
            }
            return (await response.json()) as CommissionSearchEntrySource[]
          })
          .then(entries => {
            cachedHomeSearchEntries = entries
            return entries
          })
          .catch(error => {
            homeSearchEntriesPromise = null
            throw error
          })
      }

      void homeSearchEntriesPromise
        .then(entries => {
          if (!active) return
          setExternalEntries(entries)
          setPopularKeywordPool(buildPopularKeywordPoolFromEntries(entries))
        })
        .catch(error => {
          console.error(error)
        })

      return () => {
        active = false
      }
    }

    const rafId = window.requestAnimationFrame(() => {
      const entries = buildSearchEntriesFromDom()
      setExternalEntries(entries.length > 0 ? entries : null)
      setPopularKeywordPool(buildPopularKeywordPoolFromEntries(entries))
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [shouldLoadFetchedEntries])

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
      locale={locale}
      externalEntries={externalEntries ?? undefined}
      popularKeywords={popularKeywords}
      refreshPopularSearchLabel={controls.refreshPopularSearchLabel}
      onRotatePopularKeywords={popularKeywords.length > 0 ? rotatePopularKeywords : undefined}
      suggestionAliasGroups={suggestionAliasGroups}
    />
  )
}
