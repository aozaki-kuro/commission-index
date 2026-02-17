'use client'

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import Fuse from 'fuse.js'
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { jumpToCommissionSearch } from '#lib/jumpToCommissionSearch'
import {
  collectSuggestions,
  extractSuggestionContextQuery,
  extractSuggestionQuery,
  filterSuggestions,
  formatSuggestionToken,
  getMatchedEntryIds,
  getSuggestionTerms,
  normalizeQuery,
  replaceLastTokenWithSuggestion,
  type Suggestion,
} from '#lib/search'

type Entry = {
  id: number
  element: HTMLElement
  sectionId?: string
  searchText: string
  suggestText: string
  suggestionTerms: string[]
}

type Section = {
  id: string
  element: HTMLElement
  status: 'active' | 'stale' | undefined
}

const searchSyntaxRows = [
  {
    syntax: 'space',
    description: 'All terms must match',
    example: 'blue hair',
  },
  {
    syntax: '|',
    description: 'Either side can match',
    example: 'blue | silver',
  },
  {
    syntax: '!',
    description: 'Exclude a term',
    example: '!sketch',
  },
]

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

const CommissionSearch = () => {
  const initialUrlQuery = useSyncExternalStore(
    () => () => {},
    getUrlQuerySnapshot,
    () => '',
  )
  const [inputQuery, setInputQuery] = useState<string | null>(null)
  const query = inputQuery ?? initialUrlQuery
  const normalizedQuery = normalizeQuery(query)
  const hasQuery = !!normalizedQuery
  const suggestionQuery = normalizeQuery(extractSuggestionQuery(query))
  const suggestionContextQuery = extractSuggestionContextQuery(query)

  const inputRef = useRef<HTMLInputElement>(null)
  const liveRef = useRef<HTMLParagraphElement>(null)
  const didAutoJumpRef = useRef(false)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'success'>('idle')

  const index = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        entries: [] as Entry[],
        sections: [] as Section[],
        staleDivider: null as HTMLElement | null,
        allIds: new Set<number>(),
        suggestions: [] as Suggestion[],
        fuse: null as Fuse<Entry> | null,
      }
    }

    const entries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
    ).map((element, id) => ({
      suggestText: element.dataset.searchSuggest ?? '',
      suggestionTerms: getSuggestionTerms(element.dataset.searchSuggest ?? ''),
      id,
      element,
      sectionId: element.dataset.characterSectionId,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }))
    const suggestions: Suggestion[] = collectSuggestions(entries)

    return {
      entries,
      sections: Array.from(
        document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
      ).map(element => ({
        id: element.id,
        element,
        status: element.dataset.characterStatus as 'active' | 'stale' | undefined,
      })),
      staleDivider: document.querySelector<HTMLElement>('[data-stale-divider="true"]'),
      allIds: new Set(entries.map(entry => entry.id)),
      suggestions,
      fuse: new Fuse(entries, {
        keys: ['searchText'],
        threshold: 0.33,
        ignoreLocation: true,
        includeScore: false,
        minMatchCharLength: 1,
        useExtendedSearch: true,
      }),
    }
  }, [])

  const matchedIds = useMemo(() => getMatchedEntryIds(query, index), [index, query])

  const suggestionContextMatchedIds = useMemo(
    () => getMatchedEntryIds(suggestionContextQuery, index),
    [index, suggestionContextQuery],
  )

  const filteredSuggestions = useMemo(() => {
    return filterSuggestions({
      entries: index.entries,
      suggestions: index.suggestions,
      suggestionQuery,
      suggestionContextMatchedIds,
    })
  }, [index.entries, index.suggestions, suggestionContextMatchedIds, suggestionQuery])

  useEffect(() => {
    const { entries, sections, staleDivider } = index
    if (!entries.length) return

    const visibleBySection = new Map<string, number>()
    let matchedCount = 0

    for (const entry of entries) {
      const visible = matchedIds.has(entry.id)
      entry.element.classList.toggle('hidden', !visible)
      if (!visible) continue

      matchedCount += 1
      if (entry.sectionId) {
        visibleBySection.set(entry.sectionId, (visibleBySection.get(entry.sectionId) ?? 0) + 1)
      }
    }

    let visibleActiveSections = 0
    let visibleStaleSections = 0

    for (const section of sections) {
      const shown = visibleBySection.get(section.id) ?? 0
      section.element.classList.toggle('hidden', hasQuery && shown === 0)

      if (shown > 0) {
        if (section.status === 'active') visibleActiveSections += 1
        if (section.status === 'stale') visibleStaleSections += 1
      }
    }

    if (staleDivider) {
      const shouldShowDivider = !hasQuery || (visibleActiveSections > 0 && visibleStaleSections > 0)
      staleDivider.classList.toggle('hidden', !shouldShowDivider)
    }

    if (liveRef.current) {
      liveRef.current.textContent = hasQuery
        ? `Search results: ${matchedCount} of ${entries.length} commissions shown.`
        : `Search cleared. Showing all ${entries.length} commissions.`
    }
  }, [hasQuery, index, matchedIds])

  useEffect(() => {
    if (didAutoJumpRef.current || !initialUrlQuery) return

    didAutoJumpRef.current = true
    requestAnimationFrame(() => {
      jumpToCommissionSearch({ focusMode: 'none' })
    })
  }, [initialUrlQuery])

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
    const suggestionToken = formatSuggestionToken(suggestion)
    if (!suggestionToken) return
    setInputQuery(replaceLastTokenWithSuggestion(query, suggestionToken))
    setCopyState('idle')
    requestAnimationFrame(() => {
      inputRef.current?.focus()
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
            onChange={e => {
              setInputQuery(e.target.value)
              setCopyState('idle')
            }}
            placeholder="Search"
            autoComplete="off"
            aria-label="Search commissions"
            className="peer w-full origin-[left_center] transform-[scale(0.8)] bg-transparent pr-24 font-mono text-[16px] tracking-[0.01em] outline-none placeholder:text-gray-400"
          />

          <ComboboxOptions
            modal={false}
            className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 max-h-72 overflow-y-auto rounded-lg border border-gray-300/80 bg-white/95 py-1 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm empty:hidden dark:border-gray-700 dark:bg-black/90"
          >
            {filteredSuggestions.map(suggestion => (
              <ComboboxOption
                key={suggestion.term}
                value={suggestion.term}
                className="cursor-pointer px-3 py-2 font-mono text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 dark:text-gray-300 dark:data-focus:bg-gray-800 dark:data-focus:text-gray-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>{suggestion.term}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {suggestion.sources.join(' / ')}
                  </span>
                </div>
              </ComboboxOption>
            ))}
          </ComboboxOptions>

          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
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

      <Transition appear show={isHelpOpen} as={Fragment}>
        <Dialog as="div" className="relative z-20" onClose={setIsHelpOpen}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px] dark:bg-black/55" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md rounded-2xl border border-gray-300/80 bg-white/95 p-5 text-sm text-gray-700 shadow-[0_16px_50px_rgba(0,0,0,0.16)] backdrop-blur-sm md:text-base dark:border-gray-700 dark:bg-black/90 dark:text-gray-300">
                <DialogTitle className="text-base font-bold text-gray-900 md:text-lg dark:text-gray-100">
                  Search Help
                </DialogTitle>

                <div className="mt-3 space-y-3 text-gray-700 dark:text-gray-300">
                  <p className="text-xs md:text-sm">
                    Type one or more keywords to filter commissions.
                  </p>

                  <div className="overflow-hidden rounded-lg border border-gray-200/90 dark:border-gray-700/90">
                    <div className="max-w-full overflow-x-auto">
                      <table className="w-full min-w-[18rem] border-separate border-spacing-0 text-left text-xs leading-relaxed md:text-sm">
                        <thead className="bg-gray-100/80 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Syntax</th>
                            <th className="px-3 py-2 font-semibold">Meaning</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/80">
                          {searchSyntaxRows.map(row => (
                            <tr key={row.syntax} className="align-top">
                              <td className="w-20 px-3 py-2.5">
                                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 md:text-xs dark:bg-gray-800 dark:text-gray-200">
                                  {row.syntax}
                                </code>
                              </td>
                              <td className="px-3 py-2.5 text-[11px] sm:text-xs md:text-sm">
                                <p>{row.description}.</p>
                                <p className="mt-0.5 break-words text-gray-500 dark:text-gray-400">
                                  Example:{' '}
                                  <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
                                    {row.example}
                                  </code>
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-[11px] break-words text-gray-500 sm:text-xs md:text-sm dark:text-gray-400">
                    Combined example:{' '}
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
                      blue hair | silver !sketch
                    </code>
                  </p>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen(false)}
                    className="rounded-md border border-gray-300/80 bg-gray-100/85 px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus-visible:outline-gray-300"
                  >
                    Close
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </section>
  )
}

export default CommissionSearch
