'use client'

import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import dynamic from 'next/dynamic'
import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
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

type RybbitAnalytics = {
  event?: (name: string, properties?: Record<string, string | number | boolean>) => void
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

const getUrlQuerySnapshot = () => {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('q') ?? ''
}

const trackSearchUsed = (properties: Record<string, string | number | boolean>) => {
  if (typeof window === 'undefined') return
  const tracker = (window as Window & { rybbit?: RybbitAnalytics }).rybbit
  if (!tracker?.event) return
  tracker.event('search_used', properties)
}

const getTrackableQueryLength = (query: string) => {
  const normalized = normalizeQuery(query)
  if (!normalized) return 0
  return normalized.replace(/["|!]/g, '').trim().length
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

const buildSearchIndex = (externalEntries?: CommissionSearchEntrySource[]): SearchIndex => {
  if (typeof window === 'undefined') return createEmptySearchIndex()

  if (externalEntries) {
    const entries = externalEntries.map(entry => ({
      id: entry.id,
      searchText: entry.searchText.toLowerCase(),
      suggestionRows: parseSuggestionRows(entry.searchSuggest ?? ''),
    }))

    return finalizeSearchIndex(entries)
  }

  const entries = Array.from(
    document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
  ).map((element, id) => {
    const suggestText = element.dataset.searchSuggest ?? ''
    const suggestionRows = parseSuggestionRows(suggestText)
    return {
      suggestionRows,
      id,
      element,
      sectionId: element.dataset.characterSectionId,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }
  })

  return finalizeSearchIndex(entries, {
    sections: Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
    ).map(element => ({
      id: element.id,
      element,
      status: element.dataset.characterStatus as 'active' | 'stale' | undefined,
    })),
    staleDivider: document.querySelector<HTMLElement>('[data-stale-divider="true"]'),
  })
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

interface CommissionSearchProps {
  disableDomFiltering?: boolean
  onQueryChange?: (query: string) => void
  onMatchedIdsChange?: (matchedIds: Set<number>) => void
  externalEntries?: CommissionSearchEntrySource[]
  initialQuery?: string
  autoFocusOnMount?: boolean
  deferIndexInit?: boolean
}

const CommissionSearch = ({
  disableDomFiltering = false,
  onQueryChange,
  onMatchedIdsChange,
  externalEntries,
  initialQuery,
  autoFocusOnMount = false,
  deferIndexInit = false,
}: CommissionSearchProps = {}) => {
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
  const sectionVisibilityRef = useRef(new Map<string, boolean>())
  const staleDividerVisibilityRef = useRef(true)
  const hasTrackedSearchUsageRef = useRef(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'success'>('idle')
  const [isIndexReady, setIsIndexReady] = useState(
    () => !deferIndexInit || !!initialQuery || !!initialUrlQuery,
  )
  const shouldBuildIndex = isIndexReady || !deferIndexInit || !!query || !!initialUrlQuery

  const index = useMemo(() => {
    if (!shouldBuildIndex) return createEmptySearchIndex()
    return buildSearchIndex(externalEntries)
  }, [externalEntries, shouldBuildIndex])

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

    trackSearchUsed({
      query_length: normalizedDeferredQuery.length,
      trackable_query_length: trackableQueryLength,
      result_count: matchedIds.size,
      source: inputQuery === null ? 'url_query' : 'input',
    })
  }, [deferredQuery, inputQuery, matchedIds.size, normalizedDeferredQuery.length])

  useEffect(() => {
    const entriesCount = index.entries.length

    if (disableDomFiltering) {
      if (liveRef.current && entriesCount > 0) {
        liveRef.current.textContent = hasDeferredQuery
          ? `Search results: ${matchedIds.size} of ${entriesCount} commissions shown.`
          : `Search cleared. Showing all ${entriesCount} commissions.`
      }
      return
    }

    const { entryById, sections, staleDivider } = index
    const previousMatchedIds = previousMatchedIdsRef.current
    const visibleBySection = new Map<string, number>()

    for (const id of previousMatchedIds) {
      if (matchedIds.has(id)) continue
      const previousEntry = entryById.get(id)
      previousEntry?.element?.classList.add('hidden')
    }
    for (const id of matchedIds) {
      const entry = entryById.get(id)
      if (!entry) continue
      if (!previousMatchedIds.has(id)) {
        entry.element?.classList.remove('hidden')
      }
      if (entry.sectionId) {
        visibleBySection.set(entry.sectionId, (visibleBySection.get(entry.sectionId) ?? 0) + 1)
      }
    }
    previousMatchedIdsRef.current = matchedIds

    if (entriesCount === 0) return

    let visibleActiveSections = 0
    let visibleStaleSections = 0

    for (const section of sections) {
      const shown = visibleBySection.get(section.id) ?? 0
      const visible = !hasDeferredQuery || shown > 0
      if (sectionVisibilityRef.current.get(section.id) !== visible) {
        sectionVisibilityRef.current.set(section.id, visible)
        section.element.classList.toggle('hidden', !visible)
      }

      if (shown > 0) {
        if (section.status === 'active') visibleActiveSections += 1
        if (section.status === 'stale') visibleStaleSections += 1
      }
    }

    if (staleDivider) {
      const shouldShowDivider =
        !hasDeferredQuery || (visibleActiveSections > 0 && visibleStaleSections > 0)
      if (staleDividerVisibilityRef.current !== shouldShowDivider) {
        staleDividerVisibilityRef.current = shouldShowDivider
        staleDivider.classList.toggle('hidden', !shouldShowDivider)
      }
    }

    if (liveRef.current) {
      liveRef.current.textContent = hasDeferredQuery
        ? `Search results: ${matchedIds.size} of ${entriesCount} commissions shown.`
        : `Search cleared. Showing all ${entriesCount} commissions.`
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
