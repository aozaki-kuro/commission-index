'use client'

import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import dynamic from 'next/dynamic'
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'
import {
  applySuggestionToQuery,
  collectSuggestions,
  createSearchIndex,
  filterSuggestions,
  getMatchedEntryIds,
  normalizeQuery,
  normalizeQuotedTokenBoundary,
  parseSuggestionInputState,
  resolveSuggestionContextMatchedIds,
  type FilteredSuggestion,
  parseSuggestionRows,
  type SearchEntryLike,
  type SearchIndexLike,
  type Suggestion,
  type SuggestionEntryLike,
} from '#lib/search/index'

const CommissionSearchHelpModal = dynamic(
  () => import('#components/home/search/CommissionSearchHelpModal'),
)

type Entry = SearchEntryLike &
  SuggestionEntryLike & {
    element?: HTMLElement
    sectionId?: string
  }

type Section = {
  id: string
  element: HTMLElement
  status: 'active' | 'stale' | undefined
}

type SearchIndex = SearchIndexLike<Entry> & {
  entryById: Map<number, Entry>
  sections: Section[]
  staleDivider: HTMLElement | null
  suggestions: Suggestion[]
}

export interface CommissionSearchEntrySource {
  id: number
  searchText: string
  searchSuggest?: string
}

const suggestionSourceLabels = {
  Character: 'character',
  Creator: 'creator',
  Keyword: 'keyword',
  Date: 'date',
} satisfies Record<Suggestion['sources'][number], string>

const formatSuggestionMatchCount = (count: number) =>
  `${count} ${count === 1 ? 'match' : 'matches'}`
const formatSuggestionSources = (sources: Suggestion['sources']) =>
  sources.map(source => suggestionSourceLabels[source]).join(' / ')
const normalizeSuggestionTermKey = (term: string) => term.trim().toLowerCase()
const MIN_TRACK_QUERY_LENGTH = 2

const buildSearchUrl = (rawQuery: string) => {
  const url = new URL(window.location.href)
  if (normalizeQuery(rawQuery)) url.searchParams.set('q', rawQuery)
  else url.searchParams.delete('q')
  return url.toString()
}

const clearSearchQueryParamInAddress = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('q')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

const areSetsEqual = <T,>(left: Set<T>, right: Set<T>) => {
  if (left === right) return true
  if (left.size !== right.size) return false

  for (const value of left) {
    if (!right.has(value)) return false
  }

  return true
}

const buildSearchLiveStatusMessage = (
  hasDeferredQuery: boolean,
  matchedCount: number,
  entriesCount: number,
) =>
  hasDeferredQuery
    ? `Search results: ${matchedCount} of ${entriesCount} commissions shown.`
    : `Search cleared. Showing all ${entriesCount} commissions.`

const setTextContentIfChanged = (element: HTMLElement | null, message: string) => {
  if (!element || element.textContent === message) return
  element.textContent = message
}

const getUrlQuerySnapshot = () => {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

const getTrackableQueryLength = (query: string) => {
  const normalized = normalizeQuery(query)
  if (!normalized) return 0
  return normalized.replace(/["|!]/g, '').trim().length
}

const parsedSuggestionRowsCache = new Map<string, ReturnType<typeof parseSuggestionRows>>()

const getParsedSuggestionRows = (searchSuggest = '') => {
  const cached = parsedSuggestionRowsCache.get(searchSuggest)
  if (cached) return cached

  const parsed = parseSuggestionRows(searchSuggest)
  parsedSuggestionRowsCache.set(searchSuggest, parsed)
  return parsed
}

const createEmptySearchIndex = (): SearchIndex => ({
  entries: [],
  entryById: new Map(),
  sections: [],
  staleDivider: null,
  allIds: new Set<number>(),
  suggestions: [],
  fuse: null,
})

const finalizeSearchIndex = (
  entries: Entry[],
  {
    sections = [],
    staleDivider = null,
  }: {
    sections?: Section[]
    staleDivider?: HTMLElement | null
  } = {},
): SearchIndex => ({
  ...createSearchIndex(entries),
  entryById: new Map(entries.map(entry => [entry.id, entry])),
  sections,
  staleDivider,
  suggestions: collectSuggestions(entries),
})

const getActiveCommissionViewRoot = (viewMode: 'character' | 'timeline'): ParentNode | Document => {
  if (typeof window === 'undefined') return document

  const activeSelector = `[data-commission-view-panel="${viewMode}"][data-commission-view-active="true"]`
  const panelSelector = `[data-commission-view-panel="${viewMode}"]`

  return (
    document.querySelector<HTMLElement>(activeSelector) ??
    document.querySelector<HTMLElement>(panelSelector) ??
    document
  )
}

const getDomSearchContext = (viewMode: 'character' | 'timeline') => {
  if (typeof window === 'undefined') {
    return {
      domEntries: [] as Array<{ element: HTMLElement; sectionId?: string }>,
      sections: [] as Section[],
      staleDivider: null as HTMLElement | null,
    }
  }

  const root = getActiveCommissionViewRoot(viewMode)
  const domEntries = Array.from(
    root.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
  ).map(element => ({
    element,
    sectionId: element.dataset.characterSectionId,
  }))

  const sections = Array.from(
    root.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
  ).map(element => ({
    id: element.id,
    element,
    status: element.dataset.characterStatus as 'active' | 'stale' | undefined,
  }))

  const staleDivider = root.querySelector<HTMLElement>('[data-stale-divider="true"]')

  return { domEntries, sections, staleDivider }
}

const buildSearchIndex = (
  viewMode: 'character' | 'timeline',
  externalEntries?: CommissionSearchEntrySource[],
): SearchIndex => {
  if (typeof window === 'undefined') return createEmptySearchIndex()

  const { domEntries, sections, staleDivider } = getDomSearchContext(viewMode)

  if (externalEntries) {
    const entries = externalEntries.map(entry => ({
      id: entry.id,
      searchText: entry.searchText.toLowerCase(),
      suggestionRows: getParsedSuggestionRows(entry.searchSuggest ?? ''),
      element: domEntries[entry.id]?.element,
      sectionId: domEntries[entry.id]?.sectionId,
    }))

    return finalizeSearchIndex(entries, { sections, staleDivider })
  }

  const entries = domEntries.map(({ element, sectionId }, id) => {
    const suggestText = element.dataset.searchSuggest ?? ''
    const suggestionRows = getParsedSuggestionRows(suggestText)
    return {
      suggestionRows,
      id,
      element,
      sectionId,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }
  })

  return finalizeSearchIndex(entries, { sections, staleDivider })
}

const buildRelatedCreatorTermsMap = (entries: SuggestionEntryLike[]) => {
  const related = new Map<string, Set<string>>()

  for (const entry of entries) {
    const creatorTerms: Array<{ key: string; term: string }> = []
    for (const row of entry.suggestionRows.values()) {
      if (row.source !== 'Creator') continue
      const term = row.term.trim()
      const key = normalizeSuggestionTermKey(term)
      if (!key) continue
      creatorTerms.push({ key, term })
    }

    if (creatorTerms.length < 2) continue

    for (const creator of creatorTerms) {
      const bucket = related.get(creator.key) ?? new Set<string>()
      for (const other of creatorTerms) {
        if (other.key === creator.key) continue
        bucket.add(other.term)
      }
      related.set(creator.key, bucket)
    }
  }

  return new Map(
    [...related.entries()].map(([key, terms]) => [
      key,
      [...terms].sort((a, b) => a.localeCompare(b, 'ja')),
    ]),
  )
}

const toggleHiddenClass = (element: HTMLElement, shouldHide: boolean) => {
  const isHidden = element.classList.contains('hidden')
  if (isHidden === shouldHide) return false
  element.classList.toggle('hidden', shouldHide)
  return true
}

const syncEntryVisibilityForIndexChange = ({
  entryById,
  matchedIds,
  hasDeferredQuery,
  visibleSectionIds,
}: {
  entryById: SearchIndex['entryById']
  matchedIds: Set<number>
  hasDeferredQuery: boolean
  visibleSectionIds: Set<string> | null
}) => {
  let didLayoutChange = false

  for (const entry of entryById.values()) {
    const isMatched = !hasDeferredQuery || matchedIds.has(entry.id)

    if (isMatched && visibleSectionIds && entry.sectionId) {
      visibleSectionIds.add(entry.sectionId)
    }

    if (!entry.element) continue
    if (toggleHiddenClass(entry.element, !isMatched)) {
      didLayoutChange = true
    }
  }

  return didLayoutChange
}

const syncEntryVisibilityForMatchedDiff = ({
  entryById,
  matchedIds,
  previousMatchedIds,
  indexChanged,
  visibleSectionIds,
}: {
  entryById: SearchIndex['entryById']
  matchedIds: Set<number>
  previousMatchedIds: Set<number>
  indexChanged: boolean
  visibleSectionIds: Set<string> | null
}) => {
  let didLayoutChange = false

  for (const id of previousMatchedIds) {
    if (matchedIds.has(id)) continue

    const previousEntry = entryById.get(id)
    if (!previousEntry?.element) continue
    if (toggleHiddenClass(previousEntry.element, true)) {
      didLayoutChange = true
    }
  }

  for (const id of matchedIds) {
    const entry = entryById.get(id)
    if (!entry) continue

    if (visibleSectionIds && entry.sectionId) {
      visibleSectionIds.add(entry.sectionId)
    }

    const shouldEnsureVisible = indexChanged || !previousMatchedIds.has(id)
    if (!shouldEnsureVisible || !entry.element) continue

    if (toggleHiddenClass(entry.element, false)) {
      didLayoutChange = true
    }
  }

  return didLayoutChange
}

const syncSectionVisibility = ({
  sections,
  hasDeferredQuery,
  visibleSectionIds,
  sectionVisibilityById,
}: {
  sections: SearchIndex['sections']
  hasDeferredQuery: boolean
  visibleSectionIds: Set<string> | null
  sectionVisibilityById: Map<string, boolean>
}) => {
  let didLayoutChange = false
  let visibleActiveSections = 0
  let visibleStaleSections = 0

  for (const section of sections) {
    const visible = !hasDeferredQuery || Boolean(visibleSectionIds?.has(section.id))

    if (sectionVisibilityById.get(section.id) !== visible) {
      sectionVisibilityById.set(section.id, visible)
      if (toggleHiddenClass(section.element, !visible)) {
        didLayoutChange = true
      }
    }

    if (!visible || !hasDeferredQuery) continue
    if (section.status === 'active') visibleActiveSections += 1
    if (section.status === 'stale') visibleStaleSections += 1
  }

  return { didLayoutChange, visibleActiveSections, visibleStaleSections }
}

const syncStaleDividerVisibility = ({
  staleDivider,
  hasDeferredQuery,
  visibleActiveSections,
  visibleStaleSections,
  previousVisible,
}: {
  staleDivider: HTMLElement | null
  hasDeferredQuery: boolean
  visibleActiveSections: number
  visibleStaleSections: number
  previousVisible: boolean
}) => {
  if (!staleDivider) {
    return { didLayoutChange: false, nextVisible: previousVisible }
  }

  const shouldShowDivider =
    !hasDeferredQuery || (visibleActiveSections > 0 && visibleStaleSections > 0)

  if (shouldShowDivider === previousVisible) {
    return { didLayoutChange: false, nextVisible: previousVisible }
  }

  const didLayoutChange = toggleHiddenClass(staleDivider, !shouldShowDivider)
  return { didLayoutChange, nextVisible: shouldShowDivider }
}

interface CommissionSearchProps {
  disableDomFiltering?: boolean
  onQueryChange?: (query: string) => void
  onMatchedIdsChange?: (matchedIds: Set<number>) => void
  externalEntries?: CommissionSearchEntrySource[]
  initialQuery?: string
  autoFocusOnMount?: boolean
  deferIndexInit?: boolean
  openHelpOnMount?: boolean
}

const CommissionSearch = ({
  disableDomFiltering = false,
  onQueryChange,
  onMatchedIdsChange,
  externalEntries,
  initialQuery,
  autoFocusOnMount = false,
  deferIndexInit = false,
  openHelpOnMount = false,
}: CommissionSearchProps = {}) => {
  const { mode } = useCommissionViewMode()
  const initialUrlQuery = useSyncExternalStore(
    () => () => {},
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

  const inputRef = useRef<HTMLInputElement>(null)
  const liveRef = useRef<HTMLParagraphElement>(null)
  const didAutoJumpRef = useRef(false)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousMatchedIdsRef = useRef<Set<number>>(new Set())
  const previousFilterIndexRef = useRef<SearchIndex | null>(null)
  const sectionVisibilityRef = useRef(new Map<string, boolean>())
  const staleDividerVisibilityRef = useRef(true)
  const hasTrackedSearchUsageRef = useRef(false)
  const [isHelpOpen, setIsHelpOpen] = useState(openHelpOnMount)
  const [copyState, setCopyState] = useState<'idle' | 'success'>('idle')
  const [isIndexReady, setIsIndexReady] = useState(
    () => !deferIndexInit || !!initialQuery || !!initialUrlQuery,
  )
  const shouldBuildIndex = isIndexReady || !deferIndexInit || !!query || !!initialUrlQuery
  const activeExternalEntries = mode === 'character' ? externalEntries : undefined

  const index = useMemo(() => {
    if (!shouldBuildIndex) return createEmptySearchIndex()
    return buildSearchIndex(mode, activeExternalEntries)
  }, [activeExternalEntries, mode, shouldBuildIndex])

  const matchedIds = useMemo(() => getMatchedEntryIds(deferredQuery, index), [deferredQuery, index])

  const suggestionContextMatchedIds = useMemo(() => {
    return resolveSuggestionContextMatchedIds({
      rawQuery: deferredQuery,
      suggestionQuery,
      suggestionContextQuery,
      matchedIds,
      index,
      suggestionOperator,
    })
  }, [
    deferredQuery,
    index,
    matchedIds,
    suggestionContextQuery,
    suggestionOperator,
    suggestionQuery,
  ])

  const filteredSuggestions = useMemo<FilteredSuggestion[]>(() => {
    return filterSuggestions({
      entries: index.entries,
      suggestions: index.suggestions,
      suggestionQuery,
      suggestionContextQuery,
      suggestionContextMatchedIds,
      isExclusionSuggestion: suggestionIsExclusion,
    })
  }, [
    index.entries,
    index.suggestions,
    suggestionContextQuery,
    suggestionContextMatchedIds,
    suggestionIsExclusion,
    suggestionQuery,
  ])

  const relatedCreatorTermsMap = useMemo(
    () => buildRelatedCreatorTermsMap(index.entries),
    [index.entries],
  )

  useEffect(() => {
    onQueryChange?.(query)
  }, [onQueryChange, query])

  useEffect(() => {
    onMatchedIdsChange?.(matchedIds)
  }, [matchedIds, onMatchedIdsChange])

  useEffect(() => {
    const trackableQueryLength = getTrackableQueryLength(deferredQuery)
    if (trackableQueryLength < MIN_TRACK_QUERY_LENGTH || hasTrackedSearchUsageRef.current) return
    hasTrackedSearchUsageRef.current = true

    trackRybbitEvent(ANALYTICS_EVENTS.searchUsed, {
      query_length: normalizedDeferredQuery.length,
      trackable_query_length: trackableQueryLength,
      result_count: matchedIds.size,
      source: inputQuery === null ? 'url_query' : 'input',
    })
  }, [deferredQuery, inputQuery, matchedIds.size, normalizedDeferredQuery.length])

  useEffect(() => {
    const entriesCount = index.entries.length
    const statusMessage = buildSearchLiveStatusMessage(
      hasDeferredQuery,
      matchedIds.size,
      entriesCount,
    )

    if (disableDomFiltering) {
      if (liveRef.current && entriesCount > 0) {
        setTextContentIfChanged(liveRef.current, statusMessage)
      }
      return
    }

    const { entryById, sections, staleDivider } = index
    const previousMatchedIds = previousMatchedIdsRef.current
    const matchedIdsChanged = !areSetsEqual(previousMatchedIds, matchedIds)
    const indexChanged = previousFilterIndexRef.current !== index
    const visibleSectionIds = hasDeferredQuery ? new Set<string>() : null
    let didLayoutChange = false

    if (!matchedIdsChanged && !indexChanged) {
      setTextContentIfChanged(liveRef.current, statusMessage)
      return
    }

    if (indexChanged) {
      didLayoutChange =
        syncEntryVisibilityForIndexChange({
          entryById,
          matchedIds,
          hasDeferredQuery,
          visibleSectionIds,
        }) || didLayoutChange
    } else if (matchedIdsChanged) {
      didLayoutChange =
        syncEntryVisibilityForMatchedDiff({
          entryById,
          matchedIds,
          previousMatchedIds,
          indexChanged,
          visibleSectionIds,
        }) || didLayoutChange
    }

    previousMatchedIdsRef.current = matchedIds
    previousFilterIndexRef.current = index

    if (entriesCount === 0) {
      return
    }

    const sectionSyncResult = syncSectionVisibility({
      sections,
      hasDeferredQuery,
      visibleSectionIds,
      sectionVisibilityById: sectionVisibilityRef.current,
    })
    didLayoutChange = sectionSyncResult.didLayoutChange || didLayoutChange

    const dividerSyncResult = syncStaleDividerVisibility({
      staleDivider,
      hasDeferredQuery,
      visibleActiveSections: sectionSyncResult.visibleActiveSections,
      visibleStaleSections: sectionSyncResult.visibleStaleSections,
      previousVisible: staleDividerVisibilityRef.current,
    })
    staleDividerVisibilityRef.current = dividerSyncResult.nextVisible
    didLayoutChange = dividerSyncResult.didLayoutChange || didLayoutChange

    setTextContentIfChanged(liveRef.current, statusMessage)

    if (didLayoutChange) {
      dispatchSidebarSearchState()
    }
  }, [disableDomFiltering, hasDeferredQuery, index, matchedIds])

  useEffect(() => {
    if (didAutoJumpRef.current || !initialUrlQuery) return

    didAutoJumpRef.current = true
    requestAnimationFrame(() => {
      jumpToCommissionSearch({ focusMode: 'none' })
    })
  }, [initialUrlQuery])

  useEffect(() => {
    if (!autoFocusOnMount) return

    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return

      input.focus()
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })
  }, [autoFocusOnMount])

  useEffect(
    () => () => {
      if (!copyResetTimerRef.current) return
      clearTimeout(copyResetTimerRef.current)
    },
    [],
  )

  const setCopyFeedback = () => {
    setCopyState('success')

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current)
    }

    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle')
      copyResetTimerRef.current = null
    }, 1200)
  }

  const copySearchUrl = async () => {
    if (!hasQuery) return

    try {
      await navigator.clipboard.writeText(buildSearchUrl(query))
      setCopyFeedback()
      if (liveRef.current) liveRef.current.textContent = 'Search URL copied.'
    } catch {
      setCopyState('idle')
      if (liveRef.current) liveRef.current.textContent = 'Failed to copy search URL.'
    }
  }

  const clearSearch = () => {
    setInputQuery('')
    setCopyState('idle')
    clearSearchQueryParamInAddress()
    inputRef.current?.focus()
  }

  const applySuggestion = (suggestion: string | null) => {
    if (!suggestion) return

    const nextQueryWithSeparator = applySuggestionToQuery(query, suggestion)

    setInputQuery(nextQueryWithSeparator)
    setCopyState('idle')

    const cursor = nextQueryWithSeparator.length
    if (inputRef.current) {
      inputRef.current.value = nextQueryWithSeparator
      inputRef.current.setSelectionRange(cursor, cursor)
    }

    requestAnimationFrame(() => {
      if (!inputRef.current) return
      inputRef.current.focus()
      const rafCursor = nextQueryWithSeparator.length
      inputRef.current.setSelectionRange(rafCursor, rafCursor)
    })
  }

  return (
    <section id="commission-search" className="mt-8 mb-6 flex h-12 items-center justify-end">
      <div className="relative h-11 w-full overflow-visible border-b border-gray-300/80 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-300">
        <svg
          viewBox="0 0 24 24"
          className="absolute top-1/2 left-2.5 h-3.5 w-3.5 shrink-0 -translate-y-1/2 opacity-70"
          fill="none"
          stroke="currentColor"
        >
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
          <circle cx="11" cy="11" r="6" strokeWidth="2" />
        </svg>

        <Combobox
          as="div"
          value={null}
          onChange={applySuggestion}
          className="absolute inset-y-0 right-2 left-8 flex items-center gap-2"
        >
          <label htmlFor="commission-search-input" className="sr-only">
            Search commissions
          </label>

          <ComboboxInput
            ref={inputRef}
            id="commission-search-input"
            type="search"
            value={query}
            onFocus={() => {
              if (deferIndexInit) setIsIndexReady(true)
            }}
            onChange={e => {
              if (deferIndexInit) setIsIndexReady(true)
              setInputQuery(normalizeQuotedTokenBoundary(e.target.value))
              setCopyState('idle')
            }}
            placeholder="Search"
            autoComplete="off"
            aria-label="Search commissions"
            className="peer w-full origin-[left_center] transform-[scale(0.8)] bg-transparent pr-24 font-mono text-[16px] tracking-[0.01em] outline-none placeholder:text-gray-400"
          />

          <ComboboxOptions
            modal={false}
            className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-300/80 bg-white/95 py-1 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm empty:hidden dark:border-gray-700 dark:bg-black/90"
          >
            {filteredSuggestions.map(suggestion => {
              const relatedCreatorTerms = suggestion.sources.includes('Creator')
                ? (relatedCreatorTermsMap.get(normalizeSuggestionTermKey(suggestion.term)) ?? [])
                : []

              return (
                <ComboboxOption
                  key={suggestion.term}
                  value={suggestion.term}
                  className="cursor-pointer px-3 py-1.5 font-mono text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 dark:text-gray-300 dark:data-focus:bg-gray-800 dark:data-focus:text-gray-100"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {suggestionIsExclusion ? (
                          <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            NOT
                          </span>
                        ) : suggestionOperator === 'or' ? (
                          <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            OR
                          </span>
                        ) : suggestionOperator === 'and' ? (
                          <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            AND
                          </span>
                        ) : null}
                        <span className="flex min-w-0 items-baseline gap-1 truncate">
                          <span className="truncate">{suggestion.term}</span>
                          {relatedCreatorTerms.length > 0 ? (
                            <span className="truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                              ({relatedCreatorTerms.join(' / ')})
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-gray-300/90 bg-gray-100/85 px-1.5 py-0.5 text-[10px] leading-none text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {formatSuggestionMatchCount(suggestion.matchedCount)}
                      </span>
                    </div>
                    <span className="truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                      in {formatSuggestionSources(suggestion.sources)}
                    </span>
                  </div>
                </ComboboxOption>
              )
            })}
          </ComboboxOptions>

          <button
            type="button"
            onClick={() => {
              if (deferIndexInit) setIsIndexReady(true)
              setIsHelpOpen(true)
            }}
            className={`absolute inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-[right,color] duration-200 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300 ${
              hasQuery ? 'right-16' : 'right-0'
            }`}
            aria-label="Search help"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.6 9.2a2.6 2.6 0 1 1 4.8 1.4c-.6.8-1.4 1.2-2 1.8-.4.4-.6.9-.6 1.6"
              />
              <circle cx="12" cy="17.3" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <button
            type="button"
            onClick={copySearchUrl}
            className={`absolute right-8 inline-flex h-7 w-7 items-center justify-center rounded-full transition-[opacity,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:focus-visible:outline-gray-300 ${
              copyState === 'success'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            } ${hasQuery ? '' : 'pointer-events-none opacity-0'}`}
            aria-label={copyState === 'success' ? 'Search URL copied' : 'Copy search URL'}
          >
            {copyState === 'success' ? (
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor">
                <path
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.6 12.3L10 16.7l8.4-9.4"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor">
                <circle cx="18" cy="5.5" r="2.3" strokeWidth="2" />
                <circle cx="6" cy="12" r="2.3" strokeWidth="2" />
                <circle cx="18" cy="18.5" r="2.3" strokeWidth="2" />
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.2 11l7.6-4.1M8.2 13l7.6 4.1"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={clearSearch}
            className={`absolute right-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-[opacity,color] hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300 ${
              hasQuery ? '' : 'pointer-events-none opacity-0'
            }`}
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <path strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12" />
              <path strokeWidth="2.2" strokeLinecap="round" d="M18 6L6 18" />
            </svg>
          </button>
        </Combobox>
      </div>

      <p ref={liveRef} aria-live="polite" className="sr-only" />

      {isHelpOpen ? (
        <CommissionSearchHelpModal isOpen={isHelpOpen} onClose={setIsHelpOpen} />
      ) : null}
    </section>
  )
}

export default CommissionSearch
