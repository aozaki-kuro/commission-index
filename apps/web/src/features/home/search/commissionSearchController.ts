import type { SearchSuggestionAliasGroup } from '@features/home/search/commissionSearchIndex'
import type { SearchQuerySource } from '@features/home/search/commissionSearchModel'
import type { PanelLoadedState } from '@features/home/search/commissionSearchPanelState'
import type { CommissionViewMode } from '@features/home/search/commissionViewMode'
import {
  requestArchivedCharactersVisibility,
} from '@features/home/commission/archivedCharactersState'
import { resolveHomeSearchControls } from '@features/home/i18n/homeSearchControls'
import { mountBrowsePopoverClose } from '@features/home/search/browsePopoverClose'
import { KEYWORD_CHIP_SURFACE_CLASS, LOAD_ARCHIVED_COMMAND_VALUE } from '@features/home/search/commissionSearchConstants'
import {
  buildPopularKeywordPoolFromEntries,
  buildSearchEntriesFromDom,
  collapseAliasKeywordVariants,
  ensureHomeSearchEntriesPromise,
  getCachedHomeSearchEntries,
  getPopularKeywordBatch,
  MAX_VISIBLE_POPULAR_KEYWORDS,
} from '@features/home/search/commissionSearchDeferred'
import { createDomSyncRefs, syncDom } from '@features/home/search/commissionSearchDomSync'
import { getDropdownItemCount, renderDropdown } from '@features/home/search/commissionSearchDropdownRenderer'
import { computeFeaturedKeywordChips } from '@features/home/search/commissionSearchIndex'
import { createListboxController } from '@features/home/search/commissionSearchKeyboard'
import {
  computeSearchModel,
  dispatchSearchQueryLocationChange,
  getUrlQuerySnapshot,
  markAutoShowArchivedDone,
  resetModelState,
  setFuseHydrationCallback,
  subscribeToUrlQuerySnapshot,
} from '@features/home/search/commissionSearchModel'
import { readPanelLoadedState, subscribePanelState } from '@features/home/search/commissionSearchPanelState'
import { createSuggestionPanelController } from '@features/home/search/commissionSearchSuggestions'
import { readViewMode, subscribeViewMode } from '@features/home/search/commissionViewMode'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'
import { jumpToCommissionSearch } from '@lib/navigation/jumpToCommissionSearch'
import {
  applySuggestionToQuery,
  normalizeQuery,
  normalizeQuotedTokenBoundary,
} from '@lib/search/index'

// ==================== Helpers ====================

function shouldUseTapLikeFocus() {
  const hasTouchPoints = navigator.maxTouchPoints > 0
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return hasTouchPoints || hasCoarsePointer
}

function buildSearchUrl(rawQuery: string) {
  const url = new URL(window.location.href)
  if (normalizeQuery(rawQuery))
    url.searchParams.set('q', rawQuery)
  else url.searchParams.delete('q')
  return url.toString()
}

// Single writer for `?q=`. replaceState (never pushState) keeps one history entry per page, and passing the
// current state through preserves ClientRouter's {index, scrollX, scrollY}. It fires no location-change event,
// so a self-write is never re-read as an external query.
function writeSearchQueryToAddress(rawQuery: string) {
  const url = new URL(buildSearchUrl(rawQuery))
  if (url.search === window.location.search)
    return
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function clearSearchQueryParamInAddress() {
  writeSearchQueryToAddress('')
  dispatchSearchQueryLocationChange()
}

// The dropdown opens on the enter token and closes on the shorter exit; both pairs are swapped, not stacked, because
// two duration/ease utilities on one element resolve by stylesheet order, not class order.
const SUGGESTION_ENTER_MOTION = ['motion-safe:duration-180', 'motion-safe:ease-enter'] as const
const SUGGESTION_EXIT_MOTION = ['motion-safe:duration-120', 'motion-safe:ease-exit'] as const

// ==================== Popular keywords rendering ====================

// Same markup as the island's server-rendered chips: hydration compares `data-keyword` values to decide whether the
// server list can be kept. Clicks are delegated on the list, so the buttons carry no listeners.
function renderPopularKeywords(listEl: HTMLElement, keywords: string[]) {
  listEl.textContent = ''

  keywords.forEach((keyword, index) => {
    const li = document.createElement('li')
    li.className = `shrink-0${index >= 4
      ? ' hidden lg:block'
      : ''}`

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `${KEYWORD_CHIP_SURFACE_CLASS} px-2.5 py-1`
    btn.dataset.keyword = keyword
    btn.textContent = keyword

    li.appendChild(btn)
    listEl.appendChild(li)
  })
}

// ==================== Controller ====================

function readChipKeyword(target: EventTarget | null): string | null {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-keyword]')?.dataset.keyword ?? null
    : null
}

export function initSearchController(root: HTMLElement, options?: { pendingKeyword?: string }) {
  // 1. Parse props from data attributes
  const locale = root.dataset.locale ?? undefined
  const featuredKeywords: string[] = JSON.parse(root.dataset.featuredKeywords ?? '[]')
  const suggestionAliasGroups: SearchSuggestionAliasGroup[] = JSON.parse(root.dataset.suggestionAliasGroups ?? '[]')
  const controls = resolveHomeSearchControls(locale)

  // 2. Get DOM references
  const inputEl = root.querySelector<HTMLInputElement>('#commission-search-input')
  const suggestionListEl = root.querySelector<HTMLElement>('#search-suggestion-list')
  const liveEl = root.querySelector<HTMLElement>('#search-live-region')
  const helpTriggerEl = root.querySelector<HTMLElement>('#search-help-trigger')
  const copyUrlBtn = root.querySelector<HTMLElement>('#search-copy-url')
  const clearBtn = root.querySelector<HTMLElement>('#search-clear')
  const keywordListEl = root.querySelector<HTMLElement>('#search-keyword-list')
  const popularKeywordsEl = root.querySelector<HTMLElement>('#search-popular-keywords')
  const browseTriggerEl = root.querySelector<HTMLElement>('#search-browse-trigger')
  const browsePopoverEl = root.querySelector<HTMLElement>('#search-browse-popover')

  if (!inputEl || !suggestionListEl || !liveEl)
    return

  // Non-null aliases for use in closures (TS doesn't narrow after early return in nested fns)
  const input = inputEl
  const suggestionList = suggestionListEl
  const live = liveEl

  // 3. Initialize state
  const initialUrlQuery = getUrlQuerySnapshot()
  let query = initialUrlQuery
  let inputQuery: string | null = null
  let isIndexReady = !!initialUrlQuery
  let shouldWarmFuse = !!initialUrlQuery
  let isSuggestionPanelDismissed = false
  let externalEntries = getCachedHomeSearchEntries()
  let querySource: SearchQuerySource = 'url_query'
  let popularKeywordPool: string[] = externalEntries
    ? buildPopularKeywordPoolFromEntries(externalEntries)
    : []
  let copyState: 'idle' | 'success' = 'idle'
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null
  let mode: CommissionViewMode = readViewMode()
  let panelState: PanelLoadedState = readPanelLoadedState()
  let didAutoJump = false
  let requestedArchivedForSearch = false
  // Teardown runs on astro:before-swap; anything resolving later would read and write the next page.
  let disposed = false

  if (initialUrlQuery) {
    input.value = initialUrlQuery
  }

  // 4. Create module instances
  const domSyncRefs = createDomSyncRefs()
  domSyncRefs.liveElement = live
  resetModelState()
  // When Fuse.js finishes loading, trigger a recompute so that queries applied before hydration
  // (e.g. popular keyword clicks for CJK terms that bypass strict regex matching) get results.
  setFuseHydrationCallback(() => scheduleRecompute({ immediate: true }))

  const suggestionCtrl = createSuggestionPanelController(input)

  // ==================== Listbox controller ====================

  const listboxCtrl = createListboxController({
    inputEl: input,
    listEl: suggestionList,
    getItemCount: () => getDropdownItemCount(suggestionList),
    onSelect: (index) => {
      const items = suggestionList.querySelectorAll<HTMLElement>('[role="option"]')
      const item = items[index]
      if (!item)
        return
      const value = item.dataset.value
      if (!value)
        return
      if (value === LOAD_ARCHIVED_COMMAND_VALUE) {
        requestArchivedCharactersVisibility(window, 'visible')
      }
      else {
        applySuggestion(value)
      }
    },
    onDismiss: () => {
      dismissSuggestionPanel()
      scheduleRecompute({ immediate: true })
    },
  })

  // ==================== Derived keyword computation ====================

  function computePopularKeywords(): string[] {
    const featuredBatch = computeFeaturedKeywordChips(featuredKeywords, suggestionAliasGroups)
    if (featuredBatch.length > 0)
      return featuredBatch

    const collapsed = collapseAliasKeywordVariants(popularKeywordPool, suggestionAliasGroups, 0)
    return getPopularKeywordBatch(collapsed, 0, MAX_VISIBLE_POPULAR_KEYWORDS)
  }

  // ==================== Suggestion panel helpers ====================

  function showSuggestionPanel() {
    isSuggestionPanelDismissed = false
  }

  function dismissSuggestionPanel() {
    isSuggestionPanelDismissed = true
    // The options stay in the DOM until the close transition ends; an active option left set would make Enter
    // select an invisible suggestion and point aria-activedescendant at a node about to be removed.
    listboxCtrl.clear()
  }

  function applySuggestion(suggestion: string | null) {
    if (!suggestion)
      return
    querySource = 'input'
    applySelectedQuery(applySuggestionToQuery(query, suggestion))
  }

  function applySelectedQuery(
    nextQuery: string,
    options?: { preventScroll?: boolean, focusInput?: boolean },
  ) {
    dismissSuggestionPanel()
    setInputQuery(nextQuery)
    copyState = 'idle'

    input.value = nextQuery
    const cursor = nextQuery.length
    input.setSelectionRange(cursor, cursor)

    if (options?.focusInput !== false) {
      suggestionCtrl.focusInputAfterSelection(nextQuery, options)
    }

    scheduleRecompute({ immediate: true })
  }

  function setInputQuery(value: string) {
    inputQuery = value
    query = value
  }

  function prepareSearchInteraction() {
    isIndexReady = true
    shouldWarmFuse = true
    requestSearchIndex()
  }

  // The index is fetched on the first search interaction (or at init when a query or the entry-pool fallback
  // needs it), not on every visit. Until it arrives, a query is held rather than run against the index-less DOM,
  // which would hide every entry and announce "no results" for one round trip.
  let indexStatus: 'idle' | 'loading' | 'ready' | 'failed' = externalEntries
    ? 'ready'
    : 'idle'

  function requestSearchIndex() {
    if (disposed || indexStatus === 'loading' || indexStatus === 'ready')
      return
    indexStatus = 'loading'
    // ensureHomeSearchEntriesPromise drops a rejected promise, so a later interaction retries after a failure.
    void ensureHomeSearchEntriesPromise()
      .then((entries) => {
        if (disposed)
          return
        indexStatus = 'ready'
        externalEntries = entries
        popularKeywordPool = buildPopularKeywordPoolFromEntries(entries)
        scheduleRecompute({ immediate: true })
      })
      .catch((error) => {
        if (disposed)
          return
        console.error(error)
        // Fall back to the DOM-only index instead of holding the query forever.
        indexStatus = 'failed'
        scheduleRecompute({ immediate: true })
      })
  }

  function isQueryWaitingForIndex() {
    return indexStatus === 'loading' && !externalEntries && Boolean(normalizeQuery(query))
  }

  // An archived-only match reveals archived instead of filtering the viewport down to nothing; this pass
  // still sees the collapsed index, so filtering waits for the recompute the visibility change triggers.
  function shouldSuspendDomFilteringForArchivedReveal(model: {
    hiddenArchivedMatchedCount: number
    visibleMatchedCount: number
  }) {
    return mode === 'character'
      && Boolean(normalizeQuery(query))
      && model.visibleMatchedCount === 0
      && model.hiddenArchivedMatchedCount > 0
      && !panelState.archivedVisible
  }

  function revealArchivedBeforeFiltering() {
    if (requestedArchivedForSearch)
      return
    requestedArchivedForSearch = true
    requestArchivedCharactersVisibility(window, 'visible')
  }

  // ==================== Core recompute ====================
  // Split into two paths:
  // - Immediate (rAF): cheap UI updates (button visibility, ARIA)
  // - Debounced (100ms): heavy computation (model, DOM sync, dropdown)
  // This keeps typing responsive while deferring expensive work.

  const RECOMPUTE_DEBOUNCE_MS = 100
  const ADDRESS_SYNC_DEBOUNCE_MS = 300

  // Last `?q=` the address held; lets the popstate handler tell a hash-only popstate from a real q change.
  let lastAddressQuery = initialUrlQuery
  let addressSyncTimerId = 0
  function cancelAddressSync() {
    if (addressSyncTimerId)
      clearTimeout(addressSyncTimerId)
    addressSyncTimerId = 0
  }

  // Keeps refresh/share in step with the query the list actually shows, without a write per keystroke.
  function scheduleAddressSync() {
    cancelAddressSync()
    if (disposed || query === getUrlQuerySnapshot())
      return
    const appliedQuery = query
    addressSyncTimerId = window.setTimeout(() => {
      addressSyncTimerId = 0
      writeSearchQueryToAddress(appliedQuery)
      lastAddressQuery = getUrlQuerySnapshot()
    }, ADDRESS_SYNC_DEBOUNCE_MS)
  }

  let recomputeRafId = 0
  let recomputeTimerId = 0
  let immediateRecomputeRafId = 0
  let autoJumpRafId = 0
  let isRecomputing = false
  let isRerunRequested = false
  let suggestionCloseTimerId = 0
  let suggestionCloseOnEnd: (() => void) | null = null
  let prevSuggestionKey = ''
  // Seeded from the server-rendered chips, so the first recompute keeps them when it derives the same list.
  let prevPopularKeywordsKey = keywordListEl
    ? [
        ...keywordListEl.querySelectorAll<HTMLElement>('[data-keyword]'),
      ].map(chip => chip.dataset.keyword).join('\0')
    : ''

  /** Cheap UI updates that should run immediately on every frame */
  function updateButtonVisibility() {
    const hasQuery = !!normalizeQuery(query)
    if (copyUrlBtn) {
      copyUrlBtn.classList.toggle('pointer-events-none', !hasQuery)
      copyUrlBtn.classList.toggle('opacity-0', !hasQuery)
    }
    if (clearBtn) {
      clearBtn.classList.toggle('pointer-events-none', !hasQuery)
      clearBtn.classList.toggle('opacity-0', !hasQuery)
    }
    if (helpTriggerEl) {
      // transform, not right: a `right` transition lays out every frame on WebKit's main thread.
      helpTriggerEl.style.transform = hasQuery ? 'translateX(-4rem)' : 'none'
    }
  }

  /** Heavy computation — debounced to avoid running on every keystroke */
  function recompute() {
    if (disposed)
      return
    // Read URL query snapshot for effective query
    const urlQuery = getUrlQuerySnapshot()
    const effectiveQuery = inputQuery ?? urlQuery
    query = effectiveQuery
    if (inputQuery === null && input.value !== effectiveQuery) {
      input.value = effectiveQuery
    }

    // Auto-jump on initial URL query (once)
    if (!didAutoJump && urlQuery) {
      didAutoJump = true
      autoJumpRafId = requestAnimationFrame(() => {
        autoJumpRafId = 0
        jumpToCommissionSearch({ focusMode: 'none' })
      })
    }

    if (isQueryWaitingForIndex()) {
      updateButtonVisibility()
      return
    }

    scheduleAddressSync()

    // Compute popular keywords
    const popularKeywords = computePopularKeywords()

    // Compute search model
    const model = computeSearchModel({
      query,
      mode,
      panelState,
      externalEntries: externalEntries ?? undefined,
      isIndexReady,
      shouldWarmFuse,
      isSuggestionPanelDismissed,
      controls,
      suggestionAliasGroups,
      querySource,
    })

    const shouldSuspendArchivedFiltering = shouldSuspendDomFilteringForArchivedReveal(model)
    if (model.shouldAutoShowArchived) {
      markAutoShowArchivedDone()
      requestArchivedCharactersVisibility(window, 'visible')
    }
    if (shouldSuspendArchivedFiltering) {
      revealArchivedBeforeFiltering()
    }

    // Sync DOM filtering
    syncDom({
      disableDomFiltering: shouldSuspendArchivedFiltering,
      hasQuery: model.hasQuery,
      hiddenArchivedMatchedCount: model.hiddenArchivedMatchedCount,
      matchedIds: model.matchedIds,
      resolvedIndex: model.resolvedIndex,
      archivedVisible: panelState.archivedVisible,
      statusMessage: model.visibleStatusMessage,
      visibleEntriesCount: model.visibleEntriesCount,
    }, domSyncRefs)

    // Update button visibility + ARIA
    updateButtonVisibility()
    // ARIA 1.2 combobox: the input itself carries the role and its expanded state.
    input.setAttribute('aria-expanded', String(model.shouldShowSuggestionPanel))

    // Render/hide suggestion dropdown (skip DOM rebuild if suggestions unchanged)
    const suggestionKey = model.shouldShowSuggestionPanel
      ? `${model.suggestionViewModels.map(s => s.term).join('\0')}:${model.shouldShowHiddenArchivedNotice}:${model.suggestionIsExclusion}:${model.suggestionOperator}`
      : ''
    if (suggestionKey !== prevSuggestionKey) {
      prevSuggestionKey = suggestionKey
      cancelSuggestionClose()
      if (model.shouldShowSuggestionPanel) {
        renderDropdown({
          container: suggestionList,
          suggestionViewModels: model.suggestionViewModels,
          suggestionIsExclusion: model.suggestionIsExclusion,
          suggestionOperator: model.suggestionOperator,
          sourcePrefix: controls.sourcePrefix,
          shouldShowHiddenArchivedNotice: model.shouldShowHiddenArchivedNotice,
          hiddenArchivedNoticeMessage: model.hiddenArchivedNoticeMessage,
          visibleStatusMessage: model.visibleStatusMessage,
          loadArchivedCharactersLabel: controls.loadArchivedCharacters,
          onSelectSuggestion: applySuggestion,
          onLoadArchivedCharacters: () => {
            requestArchivedCharactersVisibility(window, 'visible')
          },
        })
        // Animate open: remove collapsed state, enable pointer events
        suggestionList.classList.remove('opacity-0', 'scale-y-[0.96]', 'pointer-events-none', ...SUGGESTION_EXIT_MOTION)
        suggestionList.classList.add('opacity-100', 'scale-y-100', 'pointer-events-auto', ...SUGGESTION_ENTER_MOTION)
        listboxCtrl.reset()
      }
      else {
        // Animate close: collapse and disable pointer events
        suggestionList.classList.add('opacity-0', 'scale-y-[0.96]', 'pointer-events-none', ...SUGGESTION_EXIT_MOTION)
        suggestionList.classList.remove('opacity-100', 'scale-y-100', 'pointer-events-auto', ...SUGGESTION_ENTER_MOTION)
        listboxCtrl.clear()
        // Clear content after transition
        const onEnd = () => {
          cancelSuggestionClose()
          // Arrow keys during the close window can re-activate a closing option; nothing may stay active once empty.
          listboxCtrl.clear()
          if (suggestionList.classList.contains('opacity-0')) {
            suggestionList.textContent = ''
          }
        }
        suggestionCloseOnEnd = onEnd
        suggestionList.addEventListener('transitionend', onEnd, { once: true })
        // Fallback for motion-reduce (no transition fires)
        suggestionCloseTimerId = window.setTimeout(onEnd, 200)
      }
    }

    // Render popular keywords (skip if unchanged)
    const popularKeywordsKey = popularKeywords.join('\0')
    if (popularKeywordsKey !== prevPopularKeywordsKey) {
      prevPopularKeywordsKey = popularKeywordsKey
      if (keywordListEl) {
        renderPopularKeywords(keywordListEl, popularKeywords)
      }
      if (popularKeywordsEl) {
        const shouldShow = popularKeywords.length > 0
        popularKeywordsEl.classList.toggle('invisible', !shouldShow)
        popularKeywordsEl.classList.toggle('opacity-0', !shouldShow)
      }
    }
  }

  function cancelSuggestionClose() {
    if (suggestionCloseTimerId)
      clearTimeout(suggestionCloseTimerId)
    suggestionCloseTimerId = 0
    if (suggestionCloseOnEnd)
      suggestionList.removeEventListener('transitionend', suggestionCloseOnEnd)
    suggestionCloseOnEnd = null
  }

  // One recompute per frame however many triggers asked for it. A request made while a pass runs (a synchronous
  // archived reveal notifies the panel-state subscriber mid-pass) reruns it once in the same frame, so the list
  // the reveal exposed is filtered before it paints; anything further waits for the next frame.
  function runImmediateRecompute() {
    immediateRecomputeRafId = 0
    if (disposed)
      return
    isRecomputing = true
    try {
      recompute()
      if (isRerunRequested) {
        isRerunRequested = false
        recompute()
      }
    }
    finally {
      isRecomputing = false
    }
    if (isRerunRequested) {
      isRerunRequested = false
      requestImmediateRecompute()
    }
  }

  function requestImmediateRecompute() {
    if (disposed)
      return
    if (isRecomputing) {
      isRerunRequested = true
      return
    }
    if (!immediateRecomputeRafId)
      immediateRecomputeRafId = requestAnimationFrame(runImmediateRecompute)
  }

  /**
   * Schedule recompute: immediate rAF for cheap UI, debounced for heavy work.
   * Pass `immediate: true` for non-typing triggers (focus, suggestion select, external state)
   * where the user expects instant feedback.
   */
  function scheduleRecompute(options?: { immediate?: boolean }) {
    if (disposed)
      return
    // Always update buttons on next frame (cheap)
    if (!recomputeRafId && !immediateRecomputeRafId) {
      recomputeRafId = requestAnimationFrame(() => {
        recomputeRafId = 0
        updateButtonVisibility()
      })
    }

    // Heavy recompute: immediate or debounced
    if (options?.immediate) {
      if (recomputeTimerId)
        clearTimeout(recomputeTimerId)
      recomputeTimerId = 0
      // Cancel the rAF UI-only update since recompute will cover it
      if (recomputeRafId) {
        cancelAnimationFrame(recomputeRafId)
        recomputeRafId = 0
      }
      requestImmediateRecompute()
    }
    else {
      if (recomputeTimerId)
        clearTimeout(recomputeTimerId)
      recomputeTimerId = window.setTimeout(() => {
        recomputeTimerId = 0
        requestImmediateRecompute()
      }, RECOMPUTE_DEBOUNCE_MS)
    }
  }

  // ==================== Popular keyword interaction ====================

  function applyPopularKeyword(keyword: string, from: 'row' | 'all', scope?: string) {
    if (!keyword)
      return

    // A scoped term (a co-appearance) ANDs the scope in front, e.g. `Lucia "Kanaut Nishe" `.
    const nextQuery = `${scope
      ? applySuggestionToQuery('', scope)
      : ''}${applySuggestionToQuery('', keyword)}`
    if (!nextQuery.trim())
      return

    trackRybbitEvent(ANALYTICS_EVENTS.popularKeywordClicked, { keyword, from })
    querySource = 'keyword'
    prepareSearchInteraction()
    // When this pass reveals archived (an archived-only match suspends filtering), the panel-state listener's
    // request reruns it in the same frame (`runImmediateRecompute`), so the revealed list is filtered before it paints.
    applySelectedQuery(nextQuery, {
      preventScroll: true,
      focusInput: !shouldUseTapLikeFocus(),
    })
  }

  // ==================== Bind event listeners ====================

  const onChipPointerDown = (event: PointerEvent) => {
    if (readChipKeyword(event.target))
      prepareSearchInteraction()
  }
  const onChipClick = (event: MouseEvent) => {
    const keyword = readChipKeyword(event.target)
    if (keyword)
      applyPopularKeyword(keyword, 'row')
  }
  keywordListEl?.addEventListener('pointerdown', onChipPointerDown)
  keywordListEl?.addEventListener('click', onChipClick)

  // Input: pointerdown → prepare, focus → prepare + show suggestions, input → update query
  input.addEventListener('pointerdown', prepareSearchInteraction)
  input.addEventListener('focus', () => {
    prepareSearchInteraction()
    if (suggestionCtrl.shouldSuppressInputFocusOpen())
      return
    showSuggestionPanel()
    scheduleRecompute({ immediate: true })
  })
  input.addEventListener('input', () => {
    prepareSearchInteraction()
    querySource = 'input'
    setInputQuery(normalizeQuotedTokenBoundary(input.value))
    showSuggestionPanel()
    copyState = 'idle'
    scheduleRecompute() // debounced — heavy work deferred during rapid typing
  })

  // Keyboard: listbox navigation
  listboxCtrl.bind()

  // Outside click/escape dismissal
  suggestionCtrl.bindOutsideListeners(root, () => {
    dismissSuggestionPanel()
    scheduleRecompute({ immediate: true })
  })

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      setInputQuery('')
      input.value = ''
      showSuggestionPanel()
      copyState = 'idle'
      cancelAddressSync()
      clearSearchQueryParamInAddress()
      if (!shouldUseTapLikeFocus()) {
        input.focus()
      }
      scheduleRecompute({ immediate: true })
    })
  }

  // Copy URL button
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', async () => {
      if (!normalizeQuery(query))
        return

      try {
        await navigator.clipboard.writeText(buildSearchUrl(query))
        if (disposed)
          return
        copyState = 'success'
        live.textContent = controls.searchUrlCopied
      }
      catch {
        if (disposed)
          return
        copyState = 'idle'
        live.textContent = controls.searchUrlCopyFailed
      }

      // Toggle share/check icon classes
      updateCopyButtonIcon()

      if (copyResetTimer)
        clearTimeout(copyResetTimer)
      copyResetTimer = setTimeout(() => {
        copyState = 'idle'
        copyResetTimer = null
        updateCopyButtonIcon()
      }, 1200)
    })
  }

  function updateCopyButtonIcon() {
    if (!copyUrlBtn)
      return
    copyUrlBtn.querySelector<HTMLElement>('[data-icon="share"]')?.classList.toggle('hidden', copyState === 'success')
    copyUrlBtn.querySelector<HTMLElement>('[data-icon="check"]')?.classList.toggle('hidden', copyState !== 'success')
  }

  // Help trigger (the popover content is server-rendered)
  if (helpTriggerEl) {
    helpTriggerEl.addEventListener('pointerdown', () => {
      isIndexReady = true
    })
    helpTriggerEl.addEventListener('focus', () => {
      isIndexReady = true
    })
  }

  // Browse popover: the full character/keyword list behind the featured row
  if (browseTriggerEl) {
    browseTriggerEl.addEventListener('pointerdown', prepareSearchInteraction)
    browseTriggerEl.addEventListener('focus', prepareSearchInteraction)
  }
  // Covers every opener, including the mobile floating keyword button outside this island.
  browsePopoverEl?.addEventListener('beforetoggle', prepareSearchInteraction)

  const browsePopoverClose = browsePopoverEl
    ? mountBrowsePopoverClose(browsePopoverEl)
    : null
  if (browsePopoverEl && browsePopoverClose) {
    browsePopoverEl.addEventListener('click', (event) => {
      const termEl = (event.target as Element).closest<HTMLElement>('[data-browse-term]')
      const term = termEl?.dataset.browseTerm
      if (!term)
        return
      // Close first: the desktop popover hides at once, and a hide while focus is still inside returns focus to its
      // trigger, which would steal it back from the input. The full-screen panel hides after its fade, by when a
      // focused input holds focus outside it, so nothing is returned.
      browsePopoverClose.close()
      applyPopularKeyword(term, 'all', termEl.dataset.browseScope)
    })
  }

  // 7. External subscriptions
  const unsubViewMode = subscribeViewMode((nextMode) => {
    mode = nextMode
    requestedArchivedForSearch = panelState.archivedVisible
    scheduleRecompute({ immediate: true })
  })

  const unsubPanelState = subscribePanelState((nextState) => {
    panelState = nextState
    // Collapsed again (e.g. from the sidebar): a later archived-only query must be able to reveal it once more.
    requestedArchivedForSearch = nextState.archivedVisible
    scheduleRecompute({ immediate: true })
  })

  const unsubUrlQuery = subscribeToUrlQuerySnapshot(() => {
    // Back/forward landed on a different ?q=: the address wins over what was typed.
    // A hash-only popstate (fragment navigation) leaves typed text and the pending write alone.
    const addressQuery = getUrlQuerySnapshot()
    // Back/forward onto a `?q=` is a search the reader did not type; it needs the index too.
    if (addressQuery)
      requestSearchIndex()
    if (addressQuery !== lastAddressQuery) {
      lastAddressQuery = addressQuery
      if (addressQuery !== query) {
        inputQuery = null
        querySource = 'url_query'
        cancelAddressSync()
      }
    }
    scheduleRecompute({ immediate: true })
  })

  // 8. Initialize
  // Load initial entries from DOM if no cached entries
  if (!externalEntries) {
    const domEntries = buildSearchEntriesFromDom()
    if (domEntries.length > 0) {
      externalEntries = domEntries
      popularKeywordPool = buildPopularKeywordPoolFromEntries(domEntries)
    }
  }

  // Fetch the index now only when the page needs it before any interaction: a `?q=` load, or no featured
  // keywords, where the keyword row is built from the index's entry pool.
  if (initialUrlQuery || computeFeaturedKeywordChips(featuredKeywords, suggestionAliasGroups).length === 0)
    requestSearchIndex()

  // Initial recompute (immediate — first render)
  scheduleRecompute({ immediate: true })

  // A chip tapped before this chunk loaded (queued by the island mount)
  if (options?.pendingKeyword)
    applyPopularKeyword(options.pendingKeyword, 'row')

  // Return cleanup function
  return () => {
    disposed = true
    setFuseHydrationCallback(null)
    keywordListEl?.removeEventListener('pointerdown', onChipPointerDown)
    keywordListEl?.removeEventListener('click', onChipClick)
    unsubViewMode()
    unsubPanelState()
    unsubUrlQuery()
    listboxCtrl.unbind()
    suggestionCtrl.unbindOutsideListeners()
    if (recomputeRafId)
      cancelAnimationFrame(recomputeRafId)
    if (immediateRecomputeRafId)
      cancelAnimationFrame(immediateRecomputeRafId)
    if (autoJumpRafId)
      cancelAnimationFrame(autoJumpRafId)
    if (recomputeTimerId)
      clearTimeout(recomputeTimerId)
    cancelSuggestionClose()
    suggestionCtrl.dispose()
    if (copyResetTimer)
      clearTimeout(copyResetTimer)
    cancelAddressSync()
    browsePopoverClose?.dispose()
  }
}
