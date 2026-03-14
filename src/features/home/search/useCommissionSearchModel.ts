import {
  LOAD_STALE_COMMAND_VALUE,
  type SuggestionViewModel,
} from '#features/home/search/CommissionSearchSuggestionDropdown'
import { requestActiveCharactersLoad } from '#features/home/commission/activeCharactersEvent'
import { requestStaleCharactersLoad } from '#features/home/commission/staleCharactersEvent'
import {
  buildRelatedSuggestionTermsMap,
  buildSearchIndex,
  createEmptySearchIndex,
  getDisplayMetrics,
  type CommissionSearchEntrySource,
  type SearchIndex,
  type SearchSuggestionAliasGroup,
} from '#features/home/search/commissionSearchIndex'
import { useCommissionSearchDomSync } from '#features/home/search/useCommissionSearchDomSync'
import { useSearchPanelLoadedState } from '#features/home/search/useSearchPanelLoadedState'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import {
  filterSuggestions,
  getMatchedEntryIds,
  hydrateSearchIndexFuse,
  normalizeQuery,
  parseSuggestionInputState,
  resolveSuggestionContextMatchedIds,
} from '#lib/search/index'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

type SearchControls = {
  sourceCharacter: string
  sourceCreator: string
  sourceKeyword: string
  sourceDate: string
  formatMatchCount: (count: number) => string
  formatSearchResultsStatus: (matchedCount: number, totalCount: number) => string
  formatSearchClearedStatus: (totalCount: number) => string
  formatHiddenStaleResultsNotice: (hiddenCount: number) => string
}

interface UseCommissionSearchModelOptions {
  activeCommandValue: string
  controls: SearchControls
  deferIndexInit: boolean
  disableDomFiltering: boolean
  externalEntries?: CommissionSearchEntrySource[]
  initialQuery?: string
  isSuggestionPanelDismissed: boolean
  mode: 'character' | 'timeline'
  onMatchedIdsChange?: (matchedIds: Set<number>) => void
  onQueryChange?: (query: string) => void
  suggestionAliasGroups: SearchSuggestionAliasGroup[]
  suppressInitialSuggestionPanelAnimation: boolean
}

const MIN_TRACK_QUERY_LENGTH = 2
const EMPTY_RELATED_SUGGESTION_TERMS_MAP = new Map<string, string[]>()
const SEARCH_QUERY_LOCATION_CHANGE_EVENT = 'home:search-query-location-change'

const getUrlQuerySnapshot = () => {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

export const dispatchSearchQueryLocationChange = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SEARCH_QUERY_LOCATION_CHANGE_EVENT))
}

export const subscribeToUrlQuerySnapshot = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(SEARCH_QUERY_LOCATION_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(SEARCH_QUERY_LOCATION_CHANGE_EVENT, onStoreChange)
  }
}

export const getDomSnapshotKeyForMode = ({
  activeBatchCount,
  activeLoaded,
  mode,
  staleBatchCount,
  staleLoaded,
  staleVisible,
  timelineLoaded,
}: {
  activeBatchCount: number
  activeLoaded: boolean
  mode: 'character' | 'timeline'
  staleBatchCount: number
  staleLoaded: boolean
  staleVisible: boolean
  timelineLoaded: boolean
}) =>
  mode === 'character'
    ? `character:active-${activeLoaded ? 'loaded' : 'pending'}-${activeBatchCount}:stale-${
        staleLoaded ? 'loaded' : staleVisible ? 'visible' : 'hidden'
      }-${staleBatchCount}`
    : `timeline:${timelineLoaded ? 'timeline-loaded' : 'timeline-pending'}`

export const resolveEffectiveDomSnapshotKey = ({
  domSnapshotKey,
  skipDomContext,
}: {
  domSnapshotKey: string
  skipDomContext: boolean
}) => (skipDomContext ? 'skip-dom-context' : domSnapshotKey)

export const useCommissionSearchModel = ({
  activeCommandValue,
  controls,
  deferIndexInit,
  disableDomFiltering,
  externalEntries,
  initialQuery,
  isSuggestionPanelDismissed,
  mode,
  onMatchedIdsChange,
  onQueryChange,
  suggestionAliasGroups,
  suppressInitialSuggestionPanelAnimation,
}: UseCommissionSearchModelOptions) => {
  const suggestionSourceLabels = useMemo(
    () =>
      ({
        Character: controls.sourceCharacter,
        Creator: controls.sourceCreator,
        Keyword: controls.sourceKeyword,
        Date: controls.sourceDate,
      }) as const,
    [controls.sourceCharacter, controls.sourceCreator, controls.sourceDate, controls.sourceKeyword],
  )
  const initialUrlQuery = useSyncExternalStore(
    subscribeToUrlQuerySnapshot,
    getUrlQuerySnapshot,
    () => '',
  )
  const [inputQuery, setInputQuery] = useState<string | null>(initialQuery ?? null)
  const query = inputQuery ?? initialUrlQuery
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = normalizeQuery(query)
  const hasQuery = !!normalizedQuery
  const normalizedDeferredQuery = normalizeQuery(deferredQuery)
  const hasDeferredQuery = !!normalizedDeferredQuery
  const { suggestionQuery, suggestionContextQuery, suggestionOperator, suggestionIsExclusion } =
    useMemo(() => {
      const parsed = parseSuggestionInputState(deferredQuery)

      return {
        suggestionQuery: normalizeQuery(parsed.suggestionQuery),
        suggestionContextQuery: parsed.suggestionContextQuery,
        suggestionOperator: parsed.suggestionOperator,
        suggestionIsExclusion: parsed.suggestionIsExclusion,
      }
    }, [deferredQuery])

  const [isIndexReady, setIsIndexReady] = useState(
    () => !deferIndexInit || !!initialQuery || !!initialUrlQuery,
  )
  const [shouldWarmFuse, setShouldWarmFuse] = useState(() => !!initialQuery || !!initialUrlQuery)
  const {
    activeBatchCount,
    activeLoaded,
    staleBatchCount,
    staleLoaded,
    staleVisible,
    timelineLoaded,
  } = useSearchPanelLoadedState()
  const shouldBuildIndex = isIndexReady || !deferIndexInit || !!query || !!initialUrlQuery
  const shouldSkipDomContext = disableDomFiltering && Boolean(externalEntries)
  const domSnapshotKey = getDomSnapshotKeyForMode({
    activeBatchCount,
    activeLoaded,
    mode,
    staleBatchCount,
    staleLoaded,
    staleVisible,
    timelineLoaded,
  })
  const effectiveDomSnapshotKey = resolveEffectiveDomSnapshotKey({
    domSnapshotKey,
    skipDomContext: shouldSkipDomContext,
  })
  const didRequestActiveAllRef = useRef(false)
  const didRequestStaleAllRef = useRef(false)

  useEffect(() => {
    const shouldRequest = !disableDomFiltering && mode === 'character' && hasQuery && !activeLoaded
    if (!shouldRequest) {
      didRequestActiveAllRef.current = false
      return
    }

    if (didRequestActiveAllRef.current) return
    didRequestActiveAllRef.current = true
    requestActiveCharactersLoad(window, { strategy: 'all' })
  }, [activeLoaded, disableDomFiltering, hasQuery, mode])

  useEffect(() => {
    const shouldRequest =
      !disableDomFiltering && mode === 'character' && hasQuery && staleVisible && !staleLoaded
    if (!shouldRequest) {
      didRequestStaleAllRef.current = false
      return
    }

    if (didRequestStaleAllRef.current) return
    didRequestStaleAllRef.current = true

    // While searching, stale expansion should eagerly load all deferred stale batches
    // so filtering can be applied across the full stale set without requiring extra scroll.
    requestStaleCharactersLoad(window, { preserveScroll: true, strategy: 'all' })
  }, [disableDomFiltering, hasQuery, mode, staleLoaded, staleVisible])

  const index = useMemo(() => {
    if (!shouldBuildIndex) return createEmptySearchIndex()
    return buildSearchIndex(mode, externalEntries, {
      domSnapshotKey: effectiveDomSnapshotKey,
      skipDomContext: shouldSkipDomContext,
    })
  }, [effectiveDomSnapshotKey, externalEntries, mode, shouldBuildIndex, shouldSkipDomContext])
  const [hydratedIndex, setHydratedIndex] = useState<SearchIndex | null>(null)
  const resolvedIndex = useMemo(() => {
    if (!hydratedIndex || hydratedIndex.entries !== index.entries) {
      return index
    }

    if (index.fuse) {
      return index
    }

    return {
      ...index,
      fuse: hydratedIndex.fuse,
    }
  }, [hydratedIndex, index])
  const shouldHydrateFuse = shouldWarmFuse || hasQuery

  useEffect(() => {
    let active = true
    if (!shouldHydrateFuse || !index.entries.length || resolvedIndex.fuse) {
      return () => {
        active = false
      }
    }

    void hydrateSearchIndexFuse(index).then(nextIndex => {
      if (!active) return
      setHydratedIndex(nextIndex)
    })

    return () => {
      active = false
    }
  }, [index, resolvedIndex.fuse, shouldHydrateFuse])

  const matchedIds = useMemo(
    () => getMatchedEntryIds(deferredQuery, resolvedIndex),
    [deferredQuery, resolvedIndex],
  )
  const { visibleEntriesCount, visibleMatchedCount, hiddenStaleMatchedCount } = useMemo(
    () =>
      getDisplayMetrics({
        searchIndex: resolvedIndex,
        matchedIds,
        disableDomFiltering,
        hasDeferredQuery,
        mode,
        staleLoaded,
      }),
    [disableDomFiltering, hasDeferredQuery, matchedIds, mode, resolvedIndex, staleLoaded],
  )

  const suggestionContextMatchedIds = useMemo(() => {
    return resolveSuggestionContextMatchedIds({
      rawQuery: deferredQuery,
      suggestionQuery,
      suggestionContextQuery,
      matchedIds,
      index: resolvedIndex,
      suggestionOperator,
    })
  }, [
    deferredQuery,
    matchedIds,
    resolvedIndex,
    suggestionContextQuery,
    suggestionOperator,
    suggestionQuery,
  ])

  const filteredSuggestions = useMemo(() => {
    return filterSuggestions({
      entries: resolvedIndex.entries,
      suggestions: resolvedIndex.suggestions,
      suggestionQuery,
      suggestionContextQuery,
      suggestionContextMatchedIds,
      isExclusionSuggestion: suggestionIsExclusion,
    })
  }, [
    resolvedIndex.entries,
    resolvedIndex.suggestions,
    suggestionContextMatchedIds,
    suggestionContextQuery,
    suggestionIsExclusion,
    suggestionQuery,
  ])

  const hasSuggestionResults = filteredSuggestions.length > 0
  const relatedSuggestionTermsMap = useMemo(
    () =>
      hasSuggestionResults
        ? buildRelatedSuggestionTermsMap(resolvedIndex.entries, suggestionAliasGroups)
        : EMPTY_RELATED_SUGGESTION_TERMS_MAP,
    [hasSuggestionResults, resolvedIndex.entries, suggestionAliasGroups],
  )

  const suggestionViewModels = useMemo<SuggestionViewModel[]>(() => {
    return filteredSuggestions.map(suggestion => ({
      term: suggestion.term,
      matchCountLabel: controls.formatMatchCount(suggestion.matchedCount),
      sourcesLabel: suggestion.sources.map(source => suggestionSourceLabels[source]).join(' / '),
      relatedTerms: relatedSuggestionTermsMap.get(suggestion.term.trim().toLowerCase()) ?? [],
    }))
  }, [controls, filteredSuggestions, relatedSuggestionTermsMap, suggestionSourceLabels])

  const shouldShowHiddenStaleNotice = hiddenStaleMatchedCount > 0
  const shouldShowSuggestionPanel =
    !isSuggestionPanelDismissed &&
    hasQuery &&
    (suggestionViewModels.length > 0 || shouldShowHiddenStaleNotice)

  const visibleStatusMessage = useMemo(
    () =>
      hasDeferredQuery
        ? controls.formatSearchResultsStatus(visibleMatchedCount, visibleEntriesCount)
        : controls.formatSearchClearedStatus(visibleEntriesCount),
    [controls, hasDeferredQuery, visibleEntriesCount, visibleMatchedCount],
  )
  const hiddenStaleNoticeMessage = useMemo(
    () => controls.formatHiddenStaleResultsNotice(hiddenStaleMatchedCount),
    [controls, hiddenStaleMatchedCount],
  )

  const resolvedActiveCommandValue = useMemo(() => {
    if (shouldShowHiddenStaleNotice && activeCommandValue === LOAD_STALE_COMMAND_VALUE) {
      return LOAD_STALE_COMMAND_VALUE
    }

    if (suggestionViewModels.some(item => item.term === activeCommandValue)) {
      return activeCommandValue
    }

    if (suggestionViewModels.length > 0) {
      return suggestionViewModels[0].term
    }

    return shouldShowHiddenStaleNotice ? LOAD_STALE_COMMAND_VALUE : ''
  }, [activeCommandValue, shouldShowHiddenStaleNotice, suggestionViewModels])

  const shouldSuppressHandoffPanelAnimation =
    suppressInitialSuggestionPanelAnimation && !!initialQuery && query === initialQuery
  const shouldAnimateSuggestionPanel = !shouldSuppressHandoffPanelAnimation
  const statusMessage = useMemo(
    () =>
      shouldShowHiddenStaleNotice
        ? `${visibleStatusMessage} ${hiddenStaleNoticeMessage}`
        : visibleStatusMessage,
    [hiddenStaleNoticeMessage, shouldShowHiddenStaleNotice, visibleStatusMessage],
  )
  const { liveRef } = useCommissionSearchDomSync({
    disableDomFiltering,
    hasDeferredQuery,
    matchedIds,
    resolvedIndex,
    statusMessage,
    visibleEntriesCount,
  })

  useEffect(() => {
    onQueryChange?.(query)
  }, [onQueryChange, query])

  useEffect(() => {
    onMatchedIdsChange?.(matchedIds)
  }, [matchedIds, onMatchedIdsChange])

  const hasTrackedSearchUsageRef = useRef(false)
  useEffect(() => {
    if (normalizedDeferredQuery.length < MIN_TRACK_QUERY_LENGTH || hasTrackedSearchUsageRef.current)
      return
    if (resolvedIndex.entries.length > 0 && !resolvedIndex.fuse) return
    hasTrackedSearchUsageRef.current = true

    trackRybbitEvent(ANALYTICS_EVENTS.searchUsed, {
      result_count: matchedIds.size,
      source: inputQuery === null ? 'url_query' : 'input',
    })
  }, [
    inputQuery,
    matchedIds.size,
    normalizedDeferredQuery.length,
    resolvedIndex.entries.length,
    resolvedIndex.fuse,
  ])

  const ensureIndexReady = useCallback(() => {
    if (deferIndexInit) setIsIndexReady(true)
  }, [deferIndexInit])

  const ensureSearchRuntimeReady = useCallback(() => {
    if (deferIndexInit) setIsIndexReady(true)
    setShouldWarmFuse(true)
  }, [deferIndexInit])

  return {
    deferredQuery,
    ensureIndexReady,
    ensureSearchRuntimeReady,
    hasDeferredQuery,
    hasQuery,
    hiddenStaleNoticeMessage,
    initialUrlQuery,
    inputQuery,
    liveRef,
    matchedIds,
    query,
    resolvedActiveCommandValue,
    resolvedIndex,
    setInputQuery,
    shouldAnimateSuggestionPanel,
    shouldShowHiddenStaleNotice,
    shouldShowSuggestionPanel,
    statusMessage,
    suggestionIsExclusion,
    suggestionOperator,
    suggestionViewModels,
    visibleEntriesCount,
    visibleStatusMessage,
  }
}
