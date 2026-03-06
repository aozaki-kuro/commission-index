import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import type { CommissionSearchEntrySource } from '#features/home/search/CommissionSearch'
import { useHomeLocaleMessages } from '#features/home/i18n/HomeLocaleContext'
import SearchShell from '#features/home/search/SearchShell'
import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { parseSuggestionRows } from '#lib/search/index'

const loadCommissionSearchModule = () => import('#features/home/search/CommissionSearch')
const CommissionSearch = lazy(loadCommissionSearchModule)

const HOME_SEARCH_INDEX_URL = '/search/home-search-entries.json'
const POPULAR_KEYWORD_BATCH_SIZE = 6
const MAX_POPULAR_KEYWORDS = 36

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
  popularKeywordPool: string[]
  popularKeywordPage: number
  onPrewarm: () => void
  onActivate: (focusOnMount?: boolean, openHelpOnMount?: boolean) => void
  onQueryChange: (value: string) => void
  onRotatePopularKeywords: () => void
  onSelectPopularKeyword: (keyword: string) => void
}

const getPopularKeywordBatch = (keywords: string[], page: number) => {
  if (keywords.length <= POPULAR_KEYWORD_BATCH_SIZE) return keywords

  const start = (page * POPULAR_KEYWORD_BATCH_SIZE) % keywords.length
  return Array.from({ length: POPULAR_KEYWORD_BATCH_SIZE }, (_, offset) => {
    const index = (start + offset) % keywords.length
    return keywords[index]
  })
}

const buildPopularKeywordPoolFromSuggestTexts = (suggestTexts: Iterable<string>) => {
  const termStats = new Map<string, { term: string; count: number }>()

  for (const suggestText of suggestTexts) {
    const parsedRows = parseSuggestionRows(suggestText)
    let hasPrimaryCreatorInEntry = false

    for (const { source, term } of parsedRows.values()) {
      if (source === 'Date') continue
      if (source === 'Creator' && hasPrimaryCreatorInEntry) continue

      const trimmedTerm = term.trim()
      if (!trimmedTerm) continue

      const normalizedTerm =
        source === 'Creator' ? (normalizeCreatorName(trimmedTerm) ?? trimmedTerm) : trimmedTerm
      if (!normalizedTerm) continue

      const normalizedKey = normalizedTerm.toLowerCase()
      const previous = termStats.get(normalizedKey)
      if (previous) {
        previous.count += 1
      } else {
        termStats.set(normalizedKey, {
          term: normalizedTerm,
          count: 1,
        })
      }

      if (source === 'Creator') {
        hasPrimaryCreatorInEntry = true
      }
    }
  }

  return [...termStats.values()]
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count
      return a.term.localeCompare(b.term)
    })
    .slice(0, MAX_POPULAR_KEYWORDS)
    .map(item => item.term)
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
  popularKeywordPool,
  popularKeywordPage,
  onPrewarm,
  onActivate,
  onQueryChange,
  onRotatePopularKeywords,
  onSelectPopularKeyword,
}: CommissionSearchShellProps) => (
  <CommissionSearchShellBody
    query={query}
    isLoadingEntries={isLoadingEntries}
    showLoadingPanel={showLoadingPanel}
    reservePopularKeywordsSpace={reservePopularKeywordsSpace}
    popularKeywordPool={popularKeywordPool}
    popularKeywordPage={popularKeywordPage}
    onPrewarm={onPrewarm}
    onActivate={onActivate}
    onQueryChange={onQueryChange}
    onRotatePopularKeywords={onRotatePopularKeywords}
    onSelectPopularKeyword={onSelectPopularKeyword}
  />
)

const CommissionSearchShellBody = ({
  query,
  isLoadingEntries,
  showLoadingPanel,
  reservePopularKeywordsSpace,
  popularKeywordPool,
  popularKeywordPage,
  onPrewarm,
  onActivate,
  onQueryChange,
  onRotatePopularKeywords,
  onSelectPopularKeyword,
}: CommissionSearchShellProps) => {
  const { controls } = useHomeLocaleMessages()
  const popularKeywords = useMemo(
    () => getPopularKeywordBatch(popularKeywordPool, popularKeywordPage),
    [popularKeywordPage, popularKeywordPool],
  )

  return (
    <SearchShell
      query={query}
      onQueryChange={onQueryChange}
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

export default function CommissionSearchDeferred() {
  const [didHydrate, setDidHydrate] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [shouldFocusOnMount, setShouldFocusOnMount] = useState(false)
  const [shouldOpenHelpOnMount, setShouldOpenHelpOnMount] = useState(false)
  const [shellQuery, setShellQuery] = useState('')
  const [popularKeywordPage, setPopularKeywordPage] = useState(0)
  const [externalEntries, setExternalEntries] = useState<CommissionSearchEntrySource[] | null>(null)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)

  const shouldLoadExternalEntries = Boolean(import.meta.env?.PROD)
  const shouldPrewarmModule = !import.meta.env?.TEST

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
    setDidHydrate(true)
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
  const shouldReservePopularKeywordsSpace =
    shellQuery.trim().length === 0 &&
    (!didHydrate ||
      (popularKeywordPool.length === 0 &&
        shouldLoadExternalEntries &&
        !externalEntries &&
        !cachedHomeSearchEntries))
  const rotatePopularKeywords = useCallback(() => {
    setPopularKeywordPage(previous => previous + 1)
  }, [])
  const selectPopularKeyword = useCallback(
    (keyword: string) => {
      setShellQuery(keyword)
      enableSearch(true)
    },
    [enableSearch],
  )

  const shell = (
    <CommissionSearchShell
      query={shellQuery}
      isLoadingEntries={isEnabled && isLoadingEntries}
      showLoadingPanel={isEnabled}
      reservePopularKeywordsSpace={shouldReservePopularKeywordsSpace}
      popularKeywordPool={popularKeywordPool}
      popularKeywordPage={popularKeywordPage}
      onPrewarm={prewarmSearch}
      onActivate={enableSearch}
      onQueryChange={setShellQuery}
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
          suppressInitialSuggestionPanelAnimation
        />
      </Suspense>
    )
  }

  return shell
}
