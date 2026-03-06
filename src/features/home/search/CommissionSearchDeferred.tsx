import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CommissionSearchEntrySource,
  SearchSuggestionAliasGroup,
} from '#features/home/search/CommissionSearch'
import { useHomeLocaleMessages } from '#features/home/i18n/HomeLocaleContext'
import SearchShell from '#features/home/search/SearchShell'
import { applySuggestionToQuery } from '#lib/search/index'
import {
  buildPopularKeywordPoolFromSuggestTexts,
  dedupeKeywords,
} from '#lib/search/popularKeywords'

const loadCommissionSearchModule = () => import('#features/home/search/CommissionSearch')
const CommissionSearch = lazy(loadCommissionSearchModule)

const HOME_SEARCH_INDEX_URL = '/search/home-search-entries.json'
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'
const DESKTOP_POPULAR_KEYWORD_BATCH_SIZE = 6
const MOBILE_POPULAR_KEYWORD_BATCH_SIZE = 4
const MAX_FEATURED_KEYWORDS = 6
const POPULAR_KEYWORDS_HANDOFF_DELAY_MS = 220

let cachedHomeSearchEntries: CommissionSearchEntrySource[] | null = null
let homeSearchEntriesPromise: Promise<CommissionSearchEntrySource[]> | null = null
let commissionSearchModulePromise: Promise<unknown> | null = null

const prewarmCommissionSearchModule = () => {
  if (!commissionSearchModulePromise) {
    commissionSearchModulePromise = loadCommissionSearchModule()
  }
  return commissionSearchModulePromise
}

const hasSearchQueryParam = () => {
  if (typeof window === 'undefined') return false
  return !!new URLSearchParams(window.location.search).get('q')
}

type CommissionSearchShellProps = {
  query: string
  isLoadingEntries: boolean
  showLoadingPanel: boolean
  reservePopularKeywordsSpace: boolean
  popularKeywords: string[]
  onPrewarm: () => void
  onActivate: (focusOnMount?: boolean, openHelpOnMount?: boolean) => void
  onQueryChange: (value: string) => void
  onRotatePopularKeywords: () => void
  onSelectPopularKeyword: (keyword: string) => void
}

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

const getPopularKeywordBatchSize = (isDesktop: boolean) =>
  isDesktop ? DESKTOP_POPULAR_KEYWORD_BATCH_SIZE : MOBILE_POPULAR_KEYWORD_BATCH_SIZE

const getRandomSeed = () => {
  if (typeof window === 'undefined') return 0

  if (typeof window.crypto?.getRandomValues === 'function') {
    const randomBuffer = new Uint32Array(1)
    window.crypto.getRandomValues(randomBuffer)
    return randomBuffer[0]
  }

  return Math.floor(Math.random() * 4294967296)
}

const buildPopularKeywordPoolFromEntries = (entries: CommissionSearchEntrySource[]) =>
  buildPopularKeywordPoolFromSuggestTexts(
    entries
      .map(entry => entry.searchSuggest ?? '')
      .filter((suggestText): suggestText is string => Boolean(suggestText)),
  )

const buildPopularKeywordPoolFromDom = () => {
  if (typeof document === 'undefined') return []
  const suggestTexts = Array.from(
    document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
  )
    .map(element => element.dataset.searchSuggest ?? '')
    .filter((suggestText): suggestText is string => Boolean(suggestText))

  return buildPopularKeywordPoolFromSuggestTexts(suggestTexts)
}

const CommissionSearchShell = ({
  query,
  isLoadingEntries,
  showLoadingPanel,
  reservePopularKeywordsSpace,
  popularKeywords,
  onPrewarm,
  onActivate,
  onQueryChange,
  onRotatePopularKeywords,
  onSelectPopularKeyword,
}: CommissionSearchShellProps) => {
  const { controls } = useHomeLocaleMessages()

  return (
    <SearchShell
      query={query}
      onQueryChange={onQueryChange}
      sectionClassName="mt-4 mb-8 md:mt-4 md:mb-10 lg:mt-6 lg:mb-12"
      searchLabel={controls.searchCommissions}
      searchPlaceholder={controls.searchPlaceholder}
      searchHelpLabel={controls.searchHelp}
      refreshPopularSearchLabel={controls.refreshPopularSearchLabel}
      popularKeywords={popularKeywords}
      loadingLabel={isLoadingEntries ? '...' : null}
      showLoadingPanel={showLoadingPanel}
      reservePopularKeywordsSpace={reservePopularKeywordsSpace}
      onPrewarm={onPrewarm}
      onActivate={onActivate}
      onRotatePopularKeywords={onRotatePopularKeywords}
      onPopularKeywordSelect={onSelectPopularKeyword}
      onHelpPointerDown={event => {
        // Activate on pointer down to avoid a residual click toggling the mounted trigger.
        event.preventDefault()
        onActivate(false, true)
      }}
      onHelpClick={event => {
        // Keyboard activation still fires click without a preceding pointer event.
        if (event.detail !== 0) return
        onActivate(false, true)
      }}
    />
  )
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
  const [didHydrate, setDidHydrate] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [shouldFocusOnMount, setShouldFocusOnMount] = useState(false)
  const [shouldOpenHelpOnMount, setShouldOpenHelpOnMount] = useState(false)
  const [shellQuery, setShellQuery] = useState('')
  const [popularKeywordPage, setPopularKeywordPage] = useState(0)
  const [hasDismissedFeaturedKeywords, setHasDismissedFeaturedKeywords] = useState(false)
  const [suppressLoadingPanelForPopularKeyword, setSuppressLoadingPanelForPopularKeyword] =
    useState(false)
  const [hasCompletedPopularKeywordsHandoff, setHasCompletedPopularKeywordsHandoff] = useState(() =>
    Boolean(import.meta.env?.TEST),
  )
  const [popularKeywordBatchSize, setPopularKeywordBatchSize] = useState(
    getPopularKeywordBatchSize(false),
  )
  const [externalEntries, setExternalEntries] = useState<CommissionSearchEntrySource[] | null>(null)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)

  const shouldLoadExternalEntries = Boolean(import.meta.env?.PROD)
  const shouldPrewarmModule = !import.meta.env?.TEST
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

  const loadExternalEntries = useCallback(async () => {
    if (!shouldLoadExternalEntries) return externalEntries
    if (externalEntries) return externalEntries
    if (cachedHomeSearchEntries) {
      setExternalEntries(cachedHomeSearchEntries)
      return cachedHomeSearchEntries
    }

    setIsLoadingEntries(true)
    try {
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

      const entries = await homeSearchEntriesPromise
      setExternalEntries(entries)
      return entries
    } finally {
      setIsLoadingEntries(false)
    }
  }, [externalEntries, shouldLoadExternalEntries])

  const enableSearch = useCallback(
    (focusOnMount = false, openHelpOnMount = false) => {
      const shouldEnable = !isEnabled
      const shouldMarkFocusOnMount = focusOnMount && !shouldFocusOnMount
      const shouldMarkHelpOnMount = openHelpOnMount && !shouldOpenHelpOnMount
      const requiresSynchronousFocusPath = focusOnMount || openHelpOnMount

      if (requiresSynchronousFocusPath) {
        if (shouldEnable) setIsEnabled(true)
        if (shouldMarkFocusOnMount) setShouldFocusOnMount(true)
        if (shouldMarkHelpOnMount) setShouldOpenHelpOnMount(true)
      } else if (shouldEnable || shouldMarkFocusOnMount || shouldMarkHelpOnMount) {
        startTransition(() => {
          if (shouldEnable) setIsEnabled(true)
          if (shouldMarkFocusOnMount) setShouldFocusOnMount(true)
          if (shouldMarkHelpOnMount) setShouldOpenHelpOnMount(true)
        })
      }

      const shouldRequestEntries =
        shouldLoadExternalEntries &&
        !externalEntries &&
        !cachedHomeSearchEntries &&
        !homeSearchEntriesPromise

      if (shouldEnable && shouldPrewarmModule) {
        void prewarmCommissionSearchModule()
      }

      if (shouldEnable || shouldRequestEntries) {
        void loadExternalEntries()
      }
    },
    [
      externalEntries,
      isEnabled,
      loadExternalEntries,
      shouldFocusOnMount,
      shouldLoadExternalEntries,
      shouldOpenHelpOnMount,
      shouldPrewarmModule,
    ],
  )

  const prewarmSearch = useCallback(() => {
    if (shouldPrewarmModule) {
      void prewarmCommissionSearchModule()
    }

    const shouldRequestEntries =
      shouldLoadExternalEntries &&
      !externalEntries &&
      !cachedHomeSearchEntries &&
      !homeSearchEntriesPromise
    if (shouldRequestEntries) {
      void loadExternalEntries()
    }
  }, [externalEntries, loadExternalEntries, shouldLoadExternalEntries, shouldPrewarmModule])

  useEffect(() => {
    setPopularKeywordPage(getRandomSeed())
    setDidHydrate(true)
  }, [])

  useEffect(() => {
    if (hasCompletedPopularKeywordsHandoff || !didHydrate) return

    const timeoutId = window.setTimeout(() => {
      setHasCompletedPopularKeywordsHandoff(true)
    }, POPULAR_KEYWORDS_HANDOFF_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [didHydrate, hasCompletedPopularKeywordsHandoff])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const updateBatchSize = () => {
      setPopularKeywordBatchSize(getPopularKeywordBatchSize(mediaQuery.matches))
    }
    updateBatchSize()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateBatchSize)
      return () => {
        mediaQuery.removeEventListener('change', updateBatchSize)
      }
    }
    return undefined
  }, [])

  useEffect(() => {
    if (isEnabled || !hasSearchQueryParam()) return
    enableSearch(false)
  }, [enableSearch, isEnabled])

  useEffect(() => {
    if (isEnabled || (!shouldLoadExternalEntries && !shouldPrewarmModule)) return

    const win = window as Window & {
      requestIdleCallback?: (
        callback: (deadline?: unknown) => void,
        options?: { timeout: number },
      ) => number
      cancelIdleCallback?: (id: number) => void
    }

    const runPrewarm = () => {
      prewarmSearch()
    }

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(() => runPrewarm(), { timeout: 1200 })
      return () => {
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId)
        }
      }
    }

    const timeoutId = window.setTimeout(runPrewarm, 320)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isEnabled, prewarmSearch, shouldLoadExternalEntries, shouldPrewarmModule])

  const isSearchReady = !shouldLoadExternalEntries || !!externalEntries
  const popularKeywordPool = useMemo(() => {
    if (externalEntries && externalEntries.length > 0) {
      return buildPopularKeywordPoolFromEntries(externalEntries)
    }
    if (cachedHomeSearchEntries && cachedHomeSearchEntries.length > 0) {
      return buildPopularKeywordPoolFromEntries(cachedHomeSearchEntries)
    }
    return buildPopularKeywordPoolFromDom()
  }, [externalEntries])
  const dedupedPopularKeywordPool = useMemo(
    () =>
      collapseAliasKeywordVariants(popularKeywordPool, suggestionAliasGroups, popularKeywordPage),
    [popularKeywordPage, popularKeywordPool, suggestionAliasGroups],
  )
  const hasEmptyQuery = shellQuery.trim().length === 0
  const shouldUseFeaturedKeywords = !hasDismissedFeaturedKeywords && featuredKeywordBatch.length > 0
  const shouldWaitForExternalKeywordPool =
    shouldLoadExternalEntries && !externalEntries && !cachedHomeSearchEntries
  const shouldReservePopularKeywordsSpace =
    hasEmptyQuery &&
    (!didHydrate ||
      !hasCompletedPopularKeywordsHandoff ||
      (!shouldUseFeaturedKeywords && shouldWaitForExternalKeywordPool))
  const popularKeywords = useMemo(
    () =>
      shouldUseFeaturedKeywords
        ? featuredKeywordBatch.slice(0, popularKeywordBatchSize)
        : getPopularKeywordBatch(
            dedupedPopularKeywordPool,
            popularKeywordPage,
            popularKeywordBatchSize,
          ),
    [
      featuredKeywordBatch,
      popularKeywordBatchSize,
      popularKeywordPage,
      dedupedPopularKeywordPool,
      shouldUseFeaturedKeywords,
    ],
  )
  const visiblePopularKeywords = shouldReservePopularKeywordsSpace ? [] : popularKeywords
  const rotatePopularKeywords = useCallback(() => {
    setHasDismissedFeaturedKeywords(true)
    setPopularKeywordPage(previous => previous + 1)
  }, [])
  const selectPopularKeyword = useCallback(
    (keyword: string) => {
      const nextQuery = applySuggestionToQuery('', keyword)
      if (!nextQuery.trim()) return

      setSuppressLoadingPanelForPopularKeyword(true)
      setShellQuery(nextQuery)
      enableSearch(true)
    },
    [enableSearch],
  )

  const activateFromShell = useCallback(
    (focusOnMount = false, openHelpOnMount = false) => {
      setSuppressLoadingPanelForPopularKeyword(false)
      enableSearch(focusOnMount, openHelpOnMount)
    },
    [enableSearch],
  )

  const handleShellQueryChange = useCallback((value: string) => {
    setSuppressLoadingPanelForPopularKeyword(false)
    setShellQuery(value)
  }, [])

  const shell = (
    <CommissionSearchShell
      query={shellQuery}
      isLoadingEntries={isEnabled && isLoadingEntries}
      showLoadingPanel={isEnabled && !suppressLoadingPanelForPopularKeyword}
      reservePopularKeywordsSpace={shouldReservePopularKeywordsSpace}
      popularKeywords={visiblePopularKeywords}
      onPrewarm={prewarmSearch}
      onActivate={activateFromShell}
      onQueryChange={handleShellQueryChange}
      onRotatePopularKeywords={rotatePopularKeywords}
      onSelectPopularKeyword={selectPopularKeyword}
    />
  )

  if (isEnabled && isSearchReady) {
    return (
      <Suspense fallback={shell}>
        <CommissionSearch
          autoFocusOnMount={shouldFocusOnMount}
          deferIndexInit
          externalEntries={externalEntries ?? undefined}
          initialQuery={shellQuery || undefined}
          openHelpOnMount={shouldOpenHelpOnMount}
          popularKeywords={popularKeywords}
          refreshPopularSearchLabel={controls.refreshPopularSearchLabel}
          onRotatePopularKeywords={rotatePopularKeywords}
          suppressInitialSuggestionPanelAnimation
          suggestionAliasGroups={suggestionAliasGroups}
        />
      </Suspense>
    )
  }

  return shell
}
