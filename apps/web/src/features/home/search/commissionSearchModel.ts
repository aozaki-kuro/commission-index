import type { SuggestionViewModel } from '@features/home/search/commissionSearchDropdownRenderer'
import type {
  CommissionSearchEntrySource,
  SearchIndex,
  SearchSuggestionAliasGroup,
} from '@features/home/search/commissionSearchIndex'
import type { PanelLoadedState } from '@features/home/search/commissionSearchPanelState'
import type { CommissionViewMode } from '@features/home/search/commissionViewMode'
import type { SuggestionTokenOperator } from '@lib/search/index'
import { requestActiveCharactersLoad } from '@features/home/commission/loader/activeCharactersEvent'
import { requestArchivedCharactersLoad } from '@features/home/commission/loader/archivedCharactersEvent'
import { requestTimelineViewLoad } from '@features/home/commission/loader/timelineViewEvent'
import { LOAD_ARCHIVED_COMMAND_VALUE } from '@features/home/search/commissionSearchConstants'
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

// ==================== URL query snapshot (re-exported for tests) ====================

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

// ==================== DOM snapshot key helpers (re-exported for tests) ====================

export function getDomSnapshotKeyForMode({
  activeBatchCount,
  activeLoaded,
  mode,
  archivedBatchCount,
  archivedLoaded,
  archivedVisible,
  timelineLoaded,
}: {
  activeBatchCount: number
  activeLoaded: boolean
  mode: 'character' | 'timeline'
  archivedBatchCount: number
  archivedLoaded: boolean
  archivedVisible: boolean
  timelineLoaded: boolean
}) {
  return mode === 'character'
    ? `character:active-${activeLoaded ? 'loaded' : 'pending'}-${activeBatchCount}:archived-${
      archivedLoaded ? 'loaded' : archivedVisible ? 'visible' : 'hidden'
    }-${archivedBatchCount}`
    : `timeline:${timelineLoaded ? 'timeline-loaded' : 'timeline-pending'}`
}

export function resolveEffectiveDomSnapshotKey({
  domSnapshotKey,
  skipDomContext,
}: {
  domSnapshotKey: string
  skipDomContext: boolean
}) {
  return skipDomContext ? 'skip-dom-context' : domSnapshotKey
}

// ==================== Deferred load request dedup ====================

function syncDeferredAllLoadRequest(
  didRequest: boolean,
  request: () => void,
  shouldRequest: boolean,
): boolean {
  if (!shouldRequest)
    return false

  if (didRequest)
    return true
  request()
  return true
}

// ==================== Module-level mutable state ====================

const MIN_TRACK_QUERY_LENGTH = 2
const EMPTY_RELATED_SUGGESTION_TERMS_MAP = new Map<string, string[]>()

let cachedIndexKey = ''
let cachedIndex: SearchIndex | null = null
let cachedIndexExternalEntries: CommissionSearchEntrySource[] | undefined
let cachedHydratedIndex: SearchIndex | null = null
let pendingHydration: { index: SearchIndex, promise: Promise<SearchIndex> } | null = null

let didRequestActiveAll = false
let didRequestArchivedAll = false
let didRequestTimelineAll = false
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
  didRequestActiveAll = false
  didRequestArchivedAll = false
  didRequestTimelineAll = false
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
  activeCommandValue: string
  controls: SearchControls
  suggestionAliasGroups: SearchSuggestionAliasGroup[]
  disableDomFiltering: boolean
  suppressInitialSuggestionPanelAnimation: boolean
  initialQuery?: string
}

export interface SearchModelOutput {
  resolvedIndex: SearchIndex
  matchedIds: Set<number>
  hasDeferredQuery: boolean
  hasQuery: boolean
  suggestionViewModels: SuggestionViewModel[]
  suggestionOperator: SuggestionTokenOperator
  suggestionIsExclusion: boolean
  shouldShowSuggestionPanel: boolean
  shouldAnimateSuggestionPanel: boolean
  shouldShowHiddenArchivedNotice: boolean
  /** True when auto-expand archived should be considered by the caller */
  shouldAutoShowArchived: boolean
  visibleStatusMessage: string
  hiddenArchivedNoticeMessage: string
  visibleEntriesCount: number
  visibleMatchedCount: number
  hiddenArchivedMatchedCount: number
  resolvedActiveCommandValue: string
}

// ==================== Core computation ====================

/**
 * Pure-ish computation that replaces the React hook body.
 * Side effects: deferred load requests, analytics, archived auto-expand.
 * In vanilla mode `useDeferredValue` is unnecessary — the caller batches via rAF.
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
    activeCommandValue,
    controls,
    suggestionAliasGroups,
    disableDomFiltering,
    suppressInitialSuggestionPanelAnimation,
    initialQuery,
  } = input

  const {
    activeLoaded,
    activeBatchCount,
    archivedLoaded,
    archivedVisible,
    archivedBatchCount,
    timelineLoaded,
  } = panelState

  // Fast-path: if all inputs that affect output are unchanged, return cached result.
  // This avoids re-running index build, Fuse matching, suggestion filtering, and view model
  // construction on every rAF when only the panel state listener or external subscription fired.
  // cachedHydratedIndex !== null is included so the memoized result is invalidated once
  // Fuse.js finishes loading — otherwise a keyword-click recompute (which runs before Fuse is
  // ready) would be permanently cached and a subsequent retry would return the stale empty result.
  const outputKey = `${query}\0${mode}\0${isIndexReady}\0${shouldWarmFuse}\0${isSuggestionPanelDismissed}\0${activeCommandValue}\0${activeLoaded}\0${activeBatchCount}\0${archivedLoaded}\0${archivedVisible}\0${archivedBatchCount}\0${timelineLoaded}\0${externalEntries?.length ?? -1}\0${disableDomFiltering}\0${suppressInitialSuggestionPanelAnimation}\0${initialQuery === undefined ? 'unset' : `set:${initialQuery}`}\0${cachedHydratedIndex !== null}`
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

  // In vanilla mode, deferredQuery === query (caller batches via rAF)
  const deferredQuery = query
  const normalizedQuery = normalizeQuery(query)
  const hasQuery = !!normalizedQuery
  const normalizedDeferredQuery = normalizeQuery(deferredQuery)
  const hasDeferredQuery = !!normalizedDeferredQuery

  // Parse suggestion input state
  const parsed = parseSuggestionInputState(deferredQuery)
  const suggestionQuery = normalizeQuery(parsed.suggestionQuery)
  const suggestionContextQuery = parsed.suggestionContextQuery
  const suggestionOperator = parsed.suggestionOperator
  const suggestionIsExclusion = parsed.suggestionIsExclusion

  // ---- Index building with memoization ----
  const shouldSkipDomContext = disableDomFiltering && Boolean(externalEntries)
  const domSnapshotKey = getDomSnapshotKeyForMode({
    activeBatchCount,
    activeLoaded,
    mode,
    archivedBatchCount,
    archivedLoaded,
    archivedVisible,
    timelineLoaded,
  })
  const effectiveDomSnapshotKey = resolveEffectiveDomSnapshotKey({
    domSnapshotKey,
    skipDomContext: shouldSkipDomContext,
  })

  // Build index key from all inputs that affect index construction
  const indexKey = `${effectiveDomSnapshotKey}:${shouldSkipDomContext}:${mode}:${isIndexReady}`

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
    index = buildSearchIndex(mode, externalEntries, {
      domSnapshotKey: effectiveDomSnapshotKey,
      skipDomContext: shouldSkipDomContext,
    })
    cachedIndexKey = indexKey
    cachedIndex = index
    cachedIndexExternalEntries = externalEntries
  }

  // ---- Fuse.js hydration (async, cached) ----
  let resolvedIndex: SearchIndex
  if (cachedHydratedIndex && cachedHydratedIndex.entries === index.entries) {
    // Hydrated index matches current entries — merge fuse if index lost it
    resolvedIndex = index.fuse ? index : { ...index, fuse: cachedHydratedIndex.fuse }
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

  // ---- Deferred load requests (side effects) ----
  didRequestActiveAll = syncDeferredAllLoadRequest(
    didRequestActiveAll,
    () => requestActiveCharactersLoad(window, { strategy: 'all' }),
    !disableDomFiltering && mode === 'character' && hasDeferredQuery && !activeLoaded,
  )

  didRequestArchivedAll = syncDeferredAllLoadRequest(
    didRequestArchivedAll,
    () => requestArchivedCharactersLoad(window, { preserveScroll: true, strategy: 'all' }),
    !disableDomFiltering
    && mode === 'character'
    && hasDeferredQuery
    && archivedVisible
    && !archivedLoaded,
  )

  didRequestTimelineAll = syncDeferredAllLoadRequest(
    didRequestTimelineAll,
    () => requestTimelineViewLoad(window, { strategy: 'all' }),
    !disableDomFiltering && mode === 'timeline' && hasDeferredQuery && !timelineLoaded,
  )

  // ---- Matched IDs ----
  const matchedIds = getMatchedEntryIds(deferredQuery, resolvedIndex)

  // ---- Display metrics ----
  const { visibleEntriesCount, visibleMatchedCount, hiddenArchivedMatchedCount }
    = getDisplayMetrics({
      searchIndex: resolvedIndex,
      matchedIds,
      disableDomFiltering,
      hasDeferredQuery,
      mode,
      archivedLoaded,
    })

  // ---- Auto-show archived (deferred to caller — not triggered here) ----
  // The caller (controller) handles auto-show with a longer debounce so it only
  // fires after typing has truly stopped, not on every intermediate recompute.
  if (!hasDeferredQuery || visibleMatchedCount > 0) {
    didAutoShowArchived = false
  }

  // ---- Suggestion filtering and view models ----
  const suggestionContextMatchedIds = resolveSuggestionContextMatchedIds({
    rawQuery: deferredQuery,
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
      && !disableDomFiltering
      && mode === 'character'
      && activeLoaded
      && !archivedVisible
      && hasDeferredQuery
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

  const shouldSuppressHandoffPanelAnimation
    = suppressInitialSuggestionPanelAnimation && !!initialQuery && query === initialQuery
  const shouldAnimateSuggestionPanel = !shouldSuppressHandoffPanelAnimation

  // ---- Status messages ----
  const visibleStatusMessage = hasDeferredQuery
    ? controls.formatSearchResultsStatus(visibleMatchedCount, visibleEntriesCount)
    : controls.formatSearchClearedStatus(visibleEntriesCount)
  const hiddenArchivedNoticeMessage = controls.formatHiddenArchivedResultsNotice(
    hiddenArchivedMatchedCount,
  )

  // ---- Active command value resolution ----
  let resolvedActiveCommandValue: string
  if (shouldShowHiddenArchivedNotice && activeCommandValue === LOAD_ARCHIVED_COMMAND_VALUE) {
    resolvedActiveCommandValue = LOAD_ARCHIVED_COMMAND_VALUE
  }
  else if (suggestionViewModels.some(item => item.term === activeCommandValue)) {
    resolvedActiveCommandValue = activeCommandValue
  }
  else if (suggestionViewModels.length > 0) {
    resolvedActiveCommandValue = suggestionViewModels[0].term
  }
  else {
    resolvedActiveCommandValue = shouldShowHiddenArchivedNotice ? LOAD_ARCHIVED_COMMAND_VALUE : ''
  }

  // ---- Analytics (side effect, dedup) ----
  if (
    normalizedDeferredQuery.length >= MIN_TRACK_QUERY_LENGTH
    && !hasTrackedSearchUsage
    && (resolvedIndex.entries.length === 0 || resolvedIndex.fuse)
  ) {
    hasTrackedSearchUsage = true
    trackRybbitEvent(ANALYTICS_EVENTS.searchUsed, {
      source: initialQuery === undefined ? 'url_query' : 'input',
    })
  }

  const output: SearchModelOutput = {
    resolvedIndex,
    matchedIds,
    hasDeferredQuery,
    hasQuery,
    suggestionViewModels,
    suggestionOperator,
    suggestionIsExclusion,
    shouldShowSuggestionPanel,
    shouldAnimateSuggestionPanel,
    shouldShowHiddenArchivedNotice,
    shouldAutoShowArchived,
    visibleStatusMessage,
    hiddenArchivedNoticeMessage,
    visibleEntriesCount,
    visibleMatchedCount,
    hiddenArchivedMatchedCount,
    resolvedActiveCommandValue,
  }
  cachedOutputKey = outputKey
  cachedOutput = output
  cachedOutputExternalEntries = externalEntries
  cachedOutputAliasGroups = suggestionAliasGroups
  cachedOutputControls = controls
  return output
}
