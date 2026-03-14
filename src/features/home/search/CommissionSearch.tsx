import { Button } from '#components/ui/button'
import { Command, CommandInput } from '#components/ui/command'
import { Popover, PopoverTrigger } from '#components/ui/popover'
import { useCommissionViewMode } from '#features/home/commission/CommissionViewMode'
import { requestStaleCharactersLoad as dispatchStaleCharactersLoad } from '#features/home/commission/staleCharactersEvent'
import { resolveHomeControls } from '#features/home/i18n/homeLocale'
import CommissionSearchHelpPopover from '#features/home/search/CommissionSearchHelpPopover'
import CommissionSearchSuggestionDropdown from '#features/home/search/CommissionSearchSuggestionDropdown'
import PopularKeywordsRow from '#features/home/search/PopularKeywordsRow'
import type {
  CommissionSearchEntrySource,
  SearchSuggestionAliasGroup,
} from '#features/home/search/commissionSearchIndex'
import {
  dispatchSearchQueryLocationChange,
  useCommissionSearchModel,
} from '#features/home/search/useCommissionSearchModel'
import { useSuggestionPanelController } from '#features/home/search/useSuggestionPanelController'
import { IconCheck, IconHelpCircle, IconSearch, IconShare3, IconX } from '@tabler/icons-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import {
  applySuggestionToQuery,
  normalizeQuery,
  normalizeQuotedTokenBoundary,
} from '#lib/search/index'

export type {
  CommissionSearchEntrySource,
  SearchSuggestionAliasGroup,
} from '#features/home/search/commissionSearchIndex'

const shouldUseTapLikeFocus = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const hasTouchPoints = navigator.maxTouchPoints > 0
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return hasTouchPoints || hasCoarsePointer
}
const EMPTY_POPULAR_KEYWORDS: string[] = []
const EMPTY_SUGGESTION_ALIAS_GROUPS: SearchSuggestionAliasGroup[] = []

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
  dispatchSearchQueryLocationChange()
}

interface CommissionSearchProps {
  locale?: string
  disableDomFiltering?: boolean
  onQueryChange?: (query: string) => void
  onMatchedIdsChange?: (matchedIds: Set<number>) => void
  externalEntries?: CommissionSearchEntrySource[]
  initialQuery?: string
  autoFocusOnMount?: boolean
  deferIndexInit?: boolean
  openHelpOnMount?: boolean
  popularKeywords?: string[]
  refreshPopularSearchLabel?: string
  onRotatePopularKeywords?: () => void
  suppressInitialSuggestionPanelAnimation?: boolean
  suggestionAliasGroups?: SearchSuggestionAliasGroup[]
}

const CommissionSearch = ({
  locale,
  disableDomFiltering = false,
  onQueryChange,
  onMatchedIdsChange,
  externalEntries,
  initialQuery,
  autoFocusOnMount = false,
  deferIndexInit = false,
  openHelpOnMount = false,
  popularKeywords = EMPTY_POPULAR_KEYWORDS,
  refreshPopularSearchLabel = '',
  onRotatePopularKeywords,
  suppressInitialSuggestionPanelAnimation = false,
  suggestionAliasGroups = EMPTY_SUGGESTION_ALIAS_GROUPS,
}: CommissionSearchProps = {}) => {
  const mode = useCommissionViewMode()
  const controls = resolveHomeControls(locale)
  const inputRef = useRef<HTMLInputElement>(null)
  const didAutoJumpRef = useRef(false)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoreNextHelpTriggerClickRef = useRef(openHelpOnMount)
  const [isHelpOpen, setIsHelpOpen] = useState(openHelpOnMount)
  const [copyState, setCopyState] = useState<'idle' | 'success'>('idle')
  const [activeCommandValue, setActiveCommandValue] = useState('')
  const [isSuggestionPanelDismissed, setIsSuggestionPanelDismissed] = useState(false)
  const {
    ensureIndexReady,
    ensureSearchRuntimeReady,
    hasQuery,
    hiddenStaleNoticeMessage,
    initialUrlQuery,
    liveRef,
    query,
    resolvedActiveCommandValue,
    setInputQuery,
    shouldAnimateSuggestionPanel,
    shouldShowHiddenStaleNotice,
    shouldShowSuggestionPanel,
    suggestionIsExclusion,
    suggestionOperator,
    suggestionViewModels,
    visibleStatusMessage,
  } = useCommissionSearchModel({
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
  })

  useEffect(() => {
    if (didAutoJumpRef.current || !initialUrlQuery) return

    didAutoJumpRef.current = true
    requestAnimationFrame(() => {
      jumpToCommissionSearch({ focusMode: 'none' })
    })
  }, [initialUrlQuery])

  useEffect(() => {
    if (!inputRef.current) return
    // cmdk can generate an internal id; keep a stable id for jump/focus helpers.
    inputRef.current.id = 'commission-search-input'
  }, [])

  useEffect(() => {
    if (!autoFocusOnMount) return

    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return

      input.focus({ preventScroll: true })
      if (shouldUseTapLikeFocus()) {
        input.click()
      }
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })
  }, [autoFocusOnMount])

  useEffect(() => {
    if (!openHelpOnMount) return

    ignoreNextHelpTriggerClickRef.current = true

    const clearIgnoredClick = () => {
      ignoreNextHelpTriggerClickRef.current = false
    }

    window.addEventListener('pointerdown', clearIgnoredClick, {
      capture: true,
      once: true,
    })

    return () => {
      window.removeEventListener('pointerdown', clearIgnoredClick, true)
    }
  }, [openHelpOnMount])

  useEffect(
    () => () => {
      if (!copyResetTimerRef.current) return
      clearTimeout(copyResetTimerRef.current)
    },
    [],
  )

  const showSuggestionPanel = useCallback(() => {
    setIsSuggestionPanelDismissed(false)
  }, [])

  const dismissSuggestionPanel = useCallback(() => {
    setIsSuggestionPanelDismissed(true)
    setActiveCommandValue('')
  }, [])

  const setCopyFeedback = useCallback(() => {
    setCopyState('success')

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current)
    }

    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle')
      copyResetTimerRef.current = null
    }, 1200)
  }, [])

  const copySearchUrl = useCallback(async () => {
    if (!hasQuery) return

    try {
      await navigator.clipboard.writeText(buildSearchUrl(query))
      setCopyFeedback()
      if (liveRef.current) liveRef.current.textContent = controls.searchUrlCopied
    } catch {
      setCopyState('idle')
      if (liveRef.current) liveRef.current.textContent = controls.searchUrlCopyFailed
    }
  }, [
    controls.searchUrlCopied,
    controls.searchUrlCopyFailed,
    hasQuery,
    liveRef,
    query,
    setCopyFeedback,
  ])

  const clearSearch = useCallback(() => {
    setInputQuery('')
    showSuggestionPanel()
    setCopyState('idle')
    clearSearchQueryParamInAddress()
    inputRef.current?.focus()
  }, [setInputQuery, showSuggestionPanel])

  const handleStaleCharactersLoadRequest = useCallback(() => {
    dispatchStaleCharactersLoad(window, { strategy: 'all', preserveScroll: true })
  }, [])

  const { focusInputAfterSelection, searchRootRef, shouldSuppressInputFocusOpen } =
    useSuggestionPanelController({
      inputRef,
      shouldShowSuggestionPanel,
      dismissSuggestionPanel,
    })

  const applySelectedQuery = useCallback(
    (nextQuery: string, options?: { preventScroll?: boolean }) => {
      dismissSuggestionPanel()
      setInputQuery(nextQuery)
      setCopyState('idle')

      const input = inputRef.current
      if (input) {
        input.value = nextQuery
        const cursor = nextQuery.length
        input.setSelectionRange(cursor, cursor)
      }

      focusInputAfterSelection(nextQuery, options)
    },
    [dismissSuggestionPanel, focusInputAfterSelection, setInputQuery],
  )

  const applySuggestion = useCallback(
    (suggestion: string | null) => {
      if (!suggestion) return
      applySelectedQuery(applySuggestionToQuery(query, suggestion))
    },
    [applySelectedQuery, query],
  )

  const applyPopularKeyword = useCallback(
    (keyword: string) => {
      if (!keyword) return

      const nextQuery = applySuggestionToQuery('', keyword)
      if (!nextQuery.trim()) return

      ensureSearchRuntimeReady()
      applySelectedQuery(nextQuery, { preventScroll: true })
    },
    [applySelectedQuery, ensureSearchRuntimeReady],
  )

  const prepareSearchHelp = useCallback(() => {
    ensureIndexReady()
  }, [ensureIndexReady])

  const handleHelpTriggerClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (!ignoreNextHelpTriggerClickRef.current) return

    // Ignore the residual click that opened deferred search + help in one gesture.
    ignoreNextHelpTriggerClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Escape' || !shouldShowSuggestionPanel) return

      dismissSuggestionPanel()
      event.preventDefault()
      event.stopPropagation()
    },
    [dismissSuggestionPanel, shouldShowSuggestionPanel],
  )

  return (
    <section
      ref={searchRootRef}
      id="commission-search"
      className="mt-4 mb-8 md:mt-4 md:mb-10 lg:mt-6 lg:mb-12"
    >
      <div className="flex h-12 items-center justify-end">
        <div className="relative h-11 w-full overflow-visible border-b border-gray-300/80 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-300">
          <IconSearch
            className="absolute top-1/2 left-2.5 h-3.5 w-3.5 shrink-0 -translate-y-1/2 opacity-70"
            stroke={2}
            aria-hidden="true"
          />

          <div className="absolute inset-y-0 right-2 left-8 flex items-center gap-2">
            <Command
              shouldFilter={false}
              value={resolvedActiveCommandValue}
              onValueChange={setActiveCommandValue}
              className="relative h-full w-full overflow-visible bg-transparent"
            >
              <label htmlFor="commission-search-input" className="sr-only">
                {controls.searchCommissions}
              </label>

              <CommandInput
                ref={inputRef}
                id="commission-search-input"
                value={query}
                onFocus={() => {
                  ensureSearchRuntimeReady()
                  if (shouldSuppressInputFocusOpen()) return
                  showSuggestionPanel()
                }}
                onKeyDown={handleInputKeyDown}
                onValueChange={value => {
                  ensureSearchRuntimeReady()
                  setInputQuery(normalizeQuotedTokenBoundary(value))
                  showSuggestionPanel()
                  setCopyState('idle')
                }}
                placeholder={controls.searchPlaceholder}
                autoComplete="off"
                aria-label={controls.searchCommissions}
                className="peer m-0 flex h-10 w-full origin-[left_center] transform-[scale(0.8)] appearance-none rounded-md bg-transparent p-0 pr-24 font-mono text-[16px] leading-5 tracking-[0.01em] outline-none placeholder:text-gray-400"
              />

              <CommissionSearchSuggestionDropdown
                shouldShow={shouldShowSuggestionPanel}
                shouldAnimate={shouldAnimateSuggestionPanel}
                suggestionViewModels={suggestionViewModels}
                suggestionIsExclusion={suggestionIsExclusion}
                suggestionOperator={suggestionOperator}
                sourcePrefix={controls.sourcePrefix}
                shouldShowHiddenStaleNotice={shouldShowHiddenStaleNotice}
                hiddenStaleNoticeMessage={hiddenStaleNoticeMessage}
                visibleStatusMessage={visibleStatusMessage}
                loadStaleCharactersLabel={controls.loadStaleCharacters}
                onSelectSuggestion={applySuggestion}
                onLoadStaleCharacters={handleStaleCharactersLoadRequest}
              />
            </Command>

            <Popover open={isHelpOpen} onOpenChange={setIsHelpOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  onPointerDown={prepareSearchHelp}
                  onFocus={prepareSearchHelp}
                  onClick={handleHelpTriggerClick}
                  variant="ghost"
                  size="icon"
                  className={`absolute inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-[right,color] duration-200 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300 ${
                    hasQuery ? 'right-16' : 'right-0'
                  }`}
                  aria-label={controls.searchHelp}
                >
                  <IconHelpCircle className="h-5 w-5" stroke={2} aria-hidden="true" />
                </Button>
              </PopoverTrigger>

              <CommissionSearchHelpPopover controls={controls} onOpenChange={setIsHelpOpen} />
            </Popover>

            <Button
              type="button"
              onClick={copySearchUrl}
              variant="ghost"
              size="icon"
              className={`absolute right-8 inline-flex h-7 w-7 items-center justify-center rounded-full transition-[opacity,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:focus-visible:outline-gray-300 ${
                copyState === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              } ${hasQuery ? '' : 'pointer-events-none opacity-0'}`}
              aria-label={
                copyState === 'success' ? controls.searchUrlCopied : controls.copySearchUrl
              }
            >
              {copyState === 'success' ? (
                <IconCheck className="h-4.5 w-4.5" stroke={2.2} aria-hidden="true" />
              ) : (
                <IconShare3 className="h-4.5 w-4.5" stroke={2} aria-hidden="true" />
              )}
            </Button>

            <Button
              type="button"
              onClick={clearSearch}
              variant="ghost"
              size="icon"
              className={`absolute right-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-[opacity,color] hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300 ${
                hasQuery ? '' : 'pointer-events-none opacity-0'
              }`}
              aria-label={controls.clearSearch}
            >
              <IconX className="h-5 w-5" stroke={2.2} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <PopularKeywordsRow
        keywords={popularKeywords}
        refreshLabel={refreshPopularSearchLabel}
        onRotate={onRotatePopularKeywords}
        onKeywordPointerDown={ensureIndexReady}
        onKeywordSelect={applyPopularKeyword}
      />

      <p ref={liveRef} aria-live="polite" className="sr-only" />
    </section>
  )
}

export default CommissionSearch
