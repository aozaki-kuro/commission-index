import type { SuggestionViewModel } from '@features/home/search/commissionSearchDropdownRenderer'
import type {
  CommissionSearchEntrySource,
  SearchIndex,
  SearchSuggestionAliasGroup,
} from '@features/home/search/commissionSearchIndex'
import type { PanelLoadedState } from '@features/home/search/commissionSearchPanelState'
import type { CommissionViewMode } from '@features/home/search/commissionViewMode'
import type { SuggestionTokenOperator } from '@lib/search/index'
import {
  buildRelatedSuggestionTermsMap,
  buildSearchIndex,
  createEmptySearchIndex,
  getDisplayMetrics,
} from '@features/home/search/commissionSearchIndex'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'
import {
  filterSuggestions,
  getMatchedEntryIds,
  hydrateSearchIndexFuse,
  normalizeQuery,
  parseSuggestionInputState,
  resolveSuggestionContextMatchedIds,
} from '@lib/search/index'

// ==================== URL query snapshot ====================

const SEARCH_QUERY_LOCATION_CHANGE_EVENT = 'home:search-query-location-change'

export function getUrlQuerySnapshot() {
  if (typeof window === 'undefined')
    return ''
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

export function dispatchSearchQueryLocationChange() {
  if (typeof window === 'undefined')
    return
  window.dispatchEvent(new Event(SEARCH_QUERY_LOCATION_CHANGE_EVENT))
}

export function subscribeToUrlQuerySnapshot(onStoreChange: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(SEARCH_QUERY_LOCATION_CHANGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(SEARCH_QUERY_LOCATION_CHANGE_EVENT, onStoreChange)
  }
}

// ==================== DOM snapshot key ====================

export function getDomSnapshotKeyForMode({
  mode,
  archivedVisible,
}: {
  mode: 'character' | 'timeline'
  archivedVisible: boolean
}) {
  return mode === 'character'
    ? `character:archived-${archivedVisible ? 'visible' : 'hidden'}`
    : 'timeline'
}

// ==================== Module-level mutable state ====================

const MIN_TRACK_QUERY_LENGTH = 2
const EMPTY_RELATED_SUGGESTION_TERMS_MAP = new Map<string, string[]>()

let cachedIndexKey = ''
let cachedIndex: SearchIndex | null = null
let cachedIndexExternalEntries: CommissionSearchEntrySource[] | undefined
let cachedHydratedIndex: SearchIndex | null = null
let pendingHydration: { index: SearchIndex, promise: Promise<SearchIndex> } | null = null

let didAutoShowArchived = false
let hasTrackedSearchUsage = false

// Output memoization — skip full pipeline when inputs are unchanged
let cachedOutputKey = ''
let cachedOutput: SearchModelOutput | null = null
let cachedOutputExternalEntries: CommissionSearchEntrySource[] | undefined
let cachedOutputAliasGroups: SearchSuggestionAliasGroup[] | undefined
let cachedOutputControls: SearchControls | undefined

// Called when Fuse.js hydration completes — allows the controller to schedule a recompute
// so that CJK and other non-ASCII queries that fall through strict matching can use Fuse results.
let fuseHydrationCallback: (() => void) | null = null

export function setFuseHydrationCallback(fn: (() => void) | null) {
  fuseHydrationCallback = fn
}

/** Mark auto-show archived as done so it doesn't re-trigger */
export function markAutoShowArchivedDone() {
  didAutoShowArchived = true
}

/** Reset all module-level mutable state. Call in tests or on re-init. */
export function resetModelState() {
  cachedIndexKey = ''
  cachedIndex = null
  cachedIndexExternalEntries = undefined
  cachedHydratedIndex = null
  pendingHydration = null
  didAutoShowArchived = false
  hasTrackedSearchUsage = false
  cachedOutputKey = ''
  cachedOutput = null
  cachedOutputExternalEntries = undefined
  cachedOutputAliasGroups = undefined
  cachedOutputControls = undefined
}

// ==================== Input / Output types ====================

export interface SearchControls {
  sourceCharacter: string
  sourceCreator: string
  sourceKeyword: string
  sourceDate: string
  formatMatchCount: (count: number) => string
  formatSearchResultsStatus: (matchedCount: number, totalCount: number) => string
  formatSearchClearedStatus: (totalCount: number) => string
  formatHiddenArchivedResultsNotice: (hiddenCount: number) => string
}

export interface SearchModelInput {
  query: string
  mode: CommissionViewMode
  panelState: PanelLoadedState
  externalEntries?: CommissionSearchEntrySource[]
  isIndexReady: boolean
  shouldWarmFuse: boolean
  isSuggestionPanelDismissed: boolean
  controls: SearchControls
  suggestionAliasGroups: SearchSuggestionAliasGroup[]
  /** What last set the query; reported once per mount as `search_used.source`. */
  querySource: SearchQuerySource
}

export type SearchQuerySource = 'input' | 'keyword' | 'url_query'

export interface SearchModelOutput {
  resolvedIndex: SearchIndex
  matchedIds: Set<number>
  hasQuery: boolean
  suggestionViewModels: SuggestionViewModel[]
  suggestionOperator: SuggestionTokenOperator
  suggestionIsExclusion: boolean
  shouldShowSuggestionPanel: boolean
  shouldShowHiddenArchivedNotice: boolean
  /** True when auto-expand archived should be considered by the caller */
  shouldAutoShowArchived: boolean
  visibleStatusMessage: string
  hiddenArchivedNoticeMessage: string
  visibleEntriesCount: number
  visibleMatchedCount: number
  hiddenArchivedMatchedCount: number
}

// ==================== Core computation ====================

/**
 * Derives the search output from the controller's state; the controller batches calls via rAF.
 * Side effects: analytics, archived auto-expand bookkeeping.
 */
export function computeSearchModel(input: SearchModelInput): SearchModelOutput {
  const {
    query,
    mode,
    panelState,
    externalEntries,
    isIndexReady,
    shouldWarmFuse,
    isSuggestionPanelDismissed,
    controls,
    suggestionAliasGroups,
    querySource,
  } = input

  const { archivedVisible } = panelState

  // Fast-path: if all inputs that affect output are unchanged, return cached result.
  // This avoids re-running index build, Fuse matching, suggestion filtering, and view model
  // construction on every rAF when only the panel state listener or external subscription fired.
  // cachedHydratedIndex !== null is included so the memoized result is invalidated once
  // Fuse.js finishes loading — otherwise a keyword-click recompute (which runs before Fuse is
  // ready) would be permanently cached and a subsequent retry would return the stale empty result.
  const outputKey = `${query}\0${mode}\0${isIndexReady}\0${shouldWarmFuse}\0${isSuggestionPanelDismissed}\0${archivedVisible}\0${externalEntries?.length ?? -1}\0${cachedHydratedIndex !== null}`
  if (
    cachedOutput
    && cachedOutputKey === outputKey
    && cachedOutputExternalEntries === externalEntries
    && cachedOutputAliasGroups === suggestionAliasGroups
    && cachedOutputControls === controls
  ) {
    return cachedOutput
  }

  const suggestionSourceLabels = {
    Character: controls.sourceCharacter,
    Creator: controls.sourceCreator,
    Keyword: controls.sourceKeyword,
    Date: controls.sourceDate,
  } as const

  const normalizedQuery = normalizeQuery(query)
  const hasQuery = !!normalizedQuery

  // Parse suggestion input state
  const parsed = parseSuggestionInputState(query)
  const suggestionQuery = normalizeQuery(parsed.suggestionQuery)
  const suggestionContextQuery = parsed.suggestionContextQuery
  const suggestionOperator = parsed.suggestionOperator
  const suggestionIsExclusion = parsed.suggestionIsExclusion

  // ---- Index building with memoization ----
  const domSnapshotKey = getDomSnapshotKeyForMode({ mode, archivedVisible })

  // Build index key from all inputs that affect index construction
  const indexKey = `${domSnapshotKey}:${mode}:${isIndexReady}`

  let index: SearchIndex
  if (!isIndexReady) {
    index = createEmptySearchIndex()
  }
  else if (
    cachedIndexKey === indexKey
    && cachedIndexExternalEntries === externalEntries
    && cachedIndex
  ) {
    index = cachedIndex
  }
  else {
    index = buildSearchIndex(mode, externalEntries)
    cachedIndexKey = indexKey
    cachedIndex = index
    cachedIndexExternalEntries = externalEntries
  }

  // ---- Fuse.js hydration (async, cached) ----
  let resolvedIndex: SearchIndex
  if (cachedHydratedIndex && cachedHydratedIndex.entries === index.entries) {
    // Hydrated index matches current entries — merge fuse if index lost it
    resolvedIndex = index.fuse
      ? index
      : { ...index, fuse: cachedHydratedIndex.fuse }
  }
  else {
    resolvedIndex = index
  }

  const shouldHydrateFuse = shouldWarmFuse || hasQuery
  if (shouldHydrateFuse && index.entries.length > 0 && !resolvedIndex.fuse) {
    // Only start hydration if we haven't already started for this index
    if (!pendingHydration || pendingHydration.index !== index) {
      const promise = hydrateSearchIndexFuse(index).then((nextIndex) => {
        // Only apply if still current
        if (pendingHydration?.index === index) {
          cachedHydratedIndex = nextIndex
          pendingHydration = null
          // Notify the controller so it can schedule a recompute — needed when a search term
          // was applied (e.g. popular keyword click) before Fuse finished loading.
          fuseHydrationCallback?.()
        }
        return nextIndex
      })
      pendingHydration = { index, promise }
    }
  }

  // ---- Matched IDs ----
  const matchedIds = getMatchedEntryIds(query, resolvedIndex)

  // ---- Display metrics ----
  const { visibleEntriesCount, visibleMatchedCount, hiddenArchivedMatchedCount }
    = getDisplayMetrics({
      searchIndex: resolvedIndex,
      matchedIds,
      hasQuery,
      mode,
      archivedVisible,
    })

  // ---- Auto-show archived (performed by the caller, not here) ----
  // The controller requests the reveal when `shouldAutoShowArchived` is set; this only resets the
  // once-per-query guard.
  if (!hasQuery || visibleMatchedCount > 0) {
    didAutoShowArchived = false
  }

  // ---- Suggestion filtering and view models ----
  const suggestionContextMatchedIds = resolveSuggestionContextMatchedIds({
    rawQuery: query,
    suggestionQuery,
    suggestionContextQuery,
    matchedIds,
    index: resolvedIndex,
    suggestionOperator,
  })

  const filteredSuggestions = filterSuggestions({
    entries: resolvedIndex.entries,
    suggestions: resolvedIndex.suggestions,
    suggestionQuery,
    suggestionContextQuery,
    suggestionContextMatchedIds,
    isExclusionSuggestion: suggestionIsExclusion,
  })

  // ---- Auto-show archived: only when query looks "complete" ----
  // - Ends with a space (user finished typing a keyword and moved on)
  // - Or exactly matches a suggestion term (e.g. "AZKi" matches perfectly)
  const queryLooksComplete
    = query.endsWith(' ')
      || filteredSuggestions.some(s => s.term.toLowerCase() === normalizedQuery.toLowerCase())

  const shouldAutoShowArchived
    = !didAutoShowArchived
      && mode === 'character'
      && !archivedVisible
      && hasQuery
      && visibleMatchedCount === 0
      && hiddenArchivedMatchedCount > 0
      && queryLooksComplete

  const hasSuggestionResults = filteredSuggestions.length > 0
  const relatedSuggestionTermsMap = hasSuggestionResults
    ? buildRelatedSuggestionTermsMap(resolvedIndex.entries, suggestionAliasGroups)
    : EMPTY_RELATED_SUGGESTION_TERMS_MAP

  const suggestionViewModels: SuggestionViewModel[] = filteredSuggestions.map(suggestion => ({
    term: suggestion.term,
    matchCountLabel: controls.formatMatchCount(suggestion.matchedCount),
    sourcesLabel: suggestion.sources.map(source => suggestionSourceLabels[source]).join(' / '),
    relatedTerms: relatedSuggestionTermsMap.get(suggestion.term.trim().toLowerCase()) ?? [],
  }))

  // ---- Visibility flags ----
  const shouldShowHiddenArchivedNotice = hiddenArchivedMatchedCount > 0
  const shouldShowSuggestionPanel
    = !isSuggestionPanelDismissed
      && hasQuery
      && (suggestionViewModels.length > 0 || shouldShowHiddenArchivedNotice)

  // ---- Status messages ----
  const visibleStatusMessage = hasQuery
    ? controls.formatSearchResultsStatus(visibleMatchedCount, visibleEntriesCount)
    : controls.formatSearchClearedStatus(visibleEntriesCount)
  const hiddenArchivedNoticeMessage = controls.formatHiddenArchivedResultsNotice(
    hiddenArchivedMatchedCount,
  )

  // ---- Analytics (side effect, dedup) ----
  if (
    normalizedQuery.length >= MIN_TRACK_QUERY_LENGTH
    && !hasTrackedSearchUsage
    && (resolvedIndex.entries.length === 0 || resolvedIndex.fuse)
  ) {
    hasTrackedSearchUsage = true
    trackRybbitEvent(ANALYTICS_EVENTS.searchUsed, { source: querySource })
  }

  const output: SearchModelOutput = {
    resolvedIndex,
    matchedIds,
    hasQuery,
    suggestionViewModels,
    suggestionOperator,
    suggestionIsExclusion,
    shouldShowSuggestionPanel,
    shouldShowHiddenArchivedNotice,
    shouldAutoShowArchived,
    visibleStatusMessage,
    hiddenArchivedNoticeMessage,
    visibleEntriesCount,
    visibleMatchedCount,
    hiddenArchivedMatchedCount,
  }
  cachedOutputKey = outputKey
  cachedOutput = output
  cachedOutputExternalEntries = externalEntries
  cachedOutputAliasGroups = suggestionAliasGroups
  cachedOutputControls = controls
  return output
}
