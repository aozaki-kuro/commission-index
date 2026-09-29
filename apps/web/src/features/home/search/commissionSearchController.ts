import type { SearchSuggestionAliasGroup } from '@features/home/search/commissionSearchIndex'
import type { PanelLoadedState } from '@features/home/search/commissionSearchPanelState'
import type { CommissionViewMode } from '@features/home/search/commissionViewMode'
import {
  getHomeCharacterBatchTotalCount,
  prefetchHomeCharacterBatches,
} from '@features/home/commission/batch/homeCharacterBatchClient'
import {
  ACTIVE_CHARACTERS_LOAD_FAILED_EVENT,
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  requestActiveCharactersLoad,
} from '@features/home/commission/loader/activeCharactersEvent'
import {
  readArchivedCharactersLoadedBatchCount,
  requestArchivedCharactersLoad,
  requestArchivedCharactersVisibility,
} from '@features/home/commission/loader/archivedCharactersEvent'
import { resolveHomeSearchControls } from '@features/home/i18n/homeSearchControls'
import { LOAD_ARCHIVED_COMMAND_VALUE } from '@features/home/search/commissionSearchConstants'
import {
  buildPopularKeywordPoolFromEntries,
  buildSearchEntriesFromDom,
  collapseAliasKeywordVariants,
  ensureHomeSearchEntriesPromise,
  getCachedHomeSearchEntries,
  getPopularKeywordBatch,
  loadDeferredEntryBatch,
  MAX_FEATURED_KEYWORDS,
  MAX_VISIBLE_POPULAR_KEYWORDS,
  pickWeightedEntry,
  scrollAndAnimateEntry,
} from '@features/home/search/commissionSearchDeferred'
import { createDomSyncRefs, syncDom } from '@features/home/search/commissionSearchDomSync'
import { getDropdownItemCount, renderDropdown } from '@features/home/search/commissionSearchDropdownRenderer'
import { renderHelpContent } from '@features/home/search/commissionSearchHelpRenderer'
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
import { dedupeKeywords } from '@lib/search/popularKeywords'

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

function clearSearchQueryParamInAddress() {
  const url = new URL(window.location.href)
  url.searchParams.delete('q')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  dispatchSearchQueryLocationChange()
}

// 从 domKey 中提取 sectionId（与 commissionSearchDeferred 中同逻辑，但该函数未导出）
function extractSectionIdFromDomKey(domKey: string) {
  const separatorIndex = domKey.indexOf('::')
  return separatorIndex > 0 ? domKey.slice(0, separatorIndex) : ''
}

const REFRESH_ICON_SPIN_DURATION_MS = 650
const REFRESH_ICON_SPIN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

// ==================== Popular keywords rendering ====================

function renderPopularKeywords(
  listEl: HTMLElement,
  keywords: string[],
  onPointerDown: () => void,
  onSelect: (keyword: string) => void,
) {
  listEl.textContent = ''

  keywords.forEach((keyword, index) => {
    const li = document.createElement('li')
    li.className = `shrink-0${index >= 4 ? ' hidden lg:block' : ''}`

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = [
      'rounded-full border border-gray-300/80 bg-white/75 px-2.5 py-1',
      'font-mono text-[11px] tracking-[0.01em] text-gray-700',
      'transition-colors',
      'hover:border-gray-400 hover:text-gray-900',
      'focus-visible:outline-2 focus-visible:outline-offset-2',
      'focus-visible:outline-gray-500',
      'dark:border-gray-700 dark:bg-black/40 dark:text-gray-300',
      'dark:hover:border-gray-500 dark:hover:text-gray-100',
    ].join(' ')
    btn.textContent = keyword
    btn.addEventListener('pointerdown', onPointerDown)
    btn.addEventListener('click', () => onSelect(keyword))

    li.appendChild(btn)
    listEl.appendChild(li)
  })
}

// ==================== Controller ====================

export function initSearchController(root: HTMLElement) {
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
  const helpPopoverEl = root.querySelector<HTMLElement>('#search-help-popover')
  const copyUrlBtn = root.querySelector<HTMLElement>('#search-copy-url')
  const clearBtn = root.querySelector<HTMLElement>('#search-clear')
  const keywordListEl = root.querySelector<HTMLElement>('#search-keyword-list')
  const popularKeywordsEl = root.querySelector<HTMLElement>('#search-popular-keywords')
  const shuffleBtn = root.querySelector<HTMLElement>('#search-shuffle')
  const rotateBtn = root.querySelector<HTMLElement>('#search-rotate')
  const rotateIconEl = root.querySelector<HTMLElement>('#search-rotate-icon')
  const activeLoadFeedbackEl = root.querySelector<HTMLElement>('#search-active-load-feedback')
  const activeLoadFeedbackTextEl = root.querySelector<HTMLElement>('#search-active-load-feedback-text')
  const retryActiveLoadBtn = root.querySelector<HTMLButtonElement>('#search-active-load-retry')
  const comboboxEl = inputEl?.closest<HTMLElement>('[role="combobox"]') ?? null

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
  let activeCommandValue = ''
  let externalEntries = getCachedHomeSearchEntries()
  let popularKeywordPage = 0
  let hasDismissedFeaturedKeywords = false
  let popularKeywordPool: string[] = externalEntries
    ? buildPopularKeywordPoolFromEntries(externalEntries)
    : []
  let matchedIds = new Set<number>()
  let copyState: 'idle' | 'success' = 'idle'
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null
  let mode: CommissionViewMode = readViewMode()
  let panelState: PanelLoadedState = readPanelLoadedState()
  let lastShuffledId: number | null = null
  let didAutoJump = false
  let prefetchedActive = false
  let prefetchedArchived = false
  let requestedActiveForSearch = false
  let requestedArchivedForSearch = false
  let activeLoadFailed = false

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

  // ==================== Derived keyword computation ====================

  function computePopularKeywords(): string[] {
    const dedupedFeatured = dedupeKeywords(featuredKeywords, MAX_FEATURED_KEYWORDS)
    const featuredBatch = collapseAliasKeywordVariants(
      dedupedFeatured,
      suggestionAliasGroups,
      popularKeywordPage ^ 0x9E3779B9,
    )
    const shouldUseFeatured = !hasDismissedFeaturedKeywords && featuredBatch.length > 0

    if (shouldUseFeatured)
      return featuredBatch.slice(0, MAX_VISIBLE_POPULAR_KEYWORDS)

    const collapsed = collapseAliasKeywordVariants(
      popularKeywordPool,
      suggestionAliasGroups,
      popularKeywordPage,
    )
    return getPopularKeywordBatch(collapsed, popularKeywordPage, MAX_VISIBLE_POPULAR_KEYWORDS)
  }

  // ==================== Suggestion panel helpers ====================

  function showSuggestionPanel() {
    isSuggestionPanelDismissed = false
  }

  function dismissSuggestionPanel() {
    isSuggestionPanelDismissed = true
    activeCommandValue = ''
  }

  function applySuggestion(suggestion: string | null) {
    if (!suggestion)
      return
    trackRybbitEvent(ANALYTICS_EVENTS.suggestionSelected, { term: suggestion })
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

  // ==================== Prefetch helpers ====================

  function prefetchDeferredBatches(status: 'active' | 'archived') {
    if (mode !== 'character')
      return

    if (status === 'active' && prefetchedActive)
      return
    if (status === 'archived' && prefetchedArchived)
      return

    const totalBatchCount = getHomeCharacterBatchTotalCount({ doc: document, status })
    if (totalBatchCount <= 0)
      return

    const startBatchIndex = status === 'active'
      ? readActiveCharactersLoadedBatchCount(document)
      : readArchivedCharactersLoadedBatchCount(document)
    const targetBatchIndex = totalBatchCount - 1

    if (status === 'active')
      prefetchedActive = true
    else
      prefetchedArchived = true

    if (targetBatchIndex < startBatchIndex)
      return

    prefetchHomeCharacterBatches({
      doc: document,
      startBatchIndex,
      status,
      targetBatchIndex,
    })
  }

  function prepareSearchInteraction() {
    isIndexReady = true
    shouldWarmFuse = true
    prefetchDeferredBatches('active')
  }

  function shouldSuspendDomFilteringForActiveLoad() {
    return mode === 'character' && Boolean(normalizeQuery(query)) && !panelState.activeLoaded
  }

  function syncActiveLoadFeedback() {
    if (!activeLoadFeedbackEl || !activeLoadFeedbackTextEl)
      return

    const shouldShow = activeLoadFailed && !panelState.activeLoaded
    activeLoadFeedbackEl.hidden = !shouldShow
    activeLoadFeedbackTextEl.textContent = shouldShow ? controls.activeCharactersLoadFailed : ''
  }

  function requestActiveLoadBeforeFiltering() {
    if (requestedActiveForSearch || activeLoadFailed)
      return
    requestedActiveForSearch = true
    requestActiveCharactersLoad(window, { strategy: 'all' })
  }

  function retryActiveLoad() {
    activeLoadFailed = false
    requestedActiveForSearch = false
    syncActiveLoadFeedback()
    requestActiveLoadBeforeFiltering()
    scheduleRecompute({ immediate: true })
  }

  const handleActiveLoadFailed = () => {
    activeLoadFailed = true
    requestedActiveForSearch = false
    syncActiveLoadFeedback()
    scheduleRecompute({ immediate: true })
  }

  const handleActiveLoadSucceeded = () => {
    activeLoadFailed = false
    requestedActiveForSearch = true
    syncActiveLoadFeedback()
    scheduleRecompute({ immediate: true })
  }

  function shouldSuspendDomFilteringForArchivedLoad(model: {
    hiddenArchivedMatchedCount: number
    visibleMatchedCount: number
  }) {
    return mode === 'character'
      && Boolean(normalizeQuery(query))
      && model.visibleMatchedCount === 0
      && model.hiddenArchivedMatchedCount > 0
      && (!panelState.archivedVisible || !panelState.archivedLoaded)
  }

  function requestArchivedLoadBeforeFiltering() {
    if (requestedArchivedForSearch)
      return
    requestedArchivedForSearch = true
    requestArchivedCharactersLoad(window, { strategy: 'all', preserveScroll: true })
  }

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
        requestArchivedCharactersLoad(window, { strategy: 'all', preserveScroll: true })
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

  // ==================== Core recompute ====================
  // Split into two paths:
  // - Immediate (rAF): cheap UI updates (button visibility, ARIA)
  // - Debounced (100ms): heavy computation (model, DOM sync, dropdown)
  // This keeps typing responsive while deferring expensive work.

  const RECOMPUTE_DEBOUNCE_MS = 100

  let recomputeRafId = 0
  let recomputeTimerId = 0
  let prevSuggestionKey = ''
  let prevPopularKeywordsKey = ''

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
      helpTriggerEl.style.right = hasQuery ? '4rem' : '0'
    }
  }

  /** Heavy computation — debounced to avoid running on every keystroke */
  function recompute() {
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
      requestAnimationFrame(() => {
        jumpToCommissionSearch({ focusMode: 'none' })
      })
    }

    // Compute popular keywords
    const popularKeywords = computePopularKeywords()

    const shouldSuspendActiveFiltering = shouldSuspendDomFilteringForActiveLoad()
    if (shouldSuspendActiveFiltering) {
      requestActiveLoadBeforeFiltering()
    }

    // Compute search model
    const model = computeSearchModel({
      query,
      mode,
      panelState,
      externalEntries: externalEntries ?? undefined,
      isIndexReady,
      shouldWarmFuse,
      isSuggestionPanelDismissed,
      activeCommandValue,
      controls,
      suggestionAliasGroups,
      disableDomFiltering: shouldSuspendActiveFiltering,
      suppressInitialSuggestionPanelAnimation: false,
    })

    // Update matched IDs
    matchedIds = model.matchedIds

    const shouldSuspendArchivedFiltering = shouldSuspendDomFilteringForArchivedLoad(model)
    if (model.shouldAutoShowArchived) {
      markAutoShowArchivedDone()
      requestArchivedCharactersVisibility(window, 'visible')
    }
    if (shouldSuspendArchivedFiltering) {
      requestArchivedLoadBeforeFiltering()
    }

    const shouldSuspendDomFiltering = shouldSuspendActiveFiltering || shouldSuspendArchivedFiltering

    // Sync DOM filtering
    syncDom({
      disableDomFiltering: shouldSuspendDomFiltering,
      hasDeferredQuery: model.hasDeferredQuery,
      hiddenArchivedMatchedCount: model.hiddenArchivedMatchedCount,
      matchedIds: model.matchedIds,
      resolvedIndex: model.resolvedIndex,
      archivedBatchCount: panelState.archivedBatchCount,
      archivedVisible: panelState.archivedVisible,
      statusMessage: model.visibleStatusMessage,
      visibleEntriesCount: model.visibleEntriesCount,
    }, domSyncRefs)

    // Update button visibility + ARIA
    updateButtonVisibility()
    if (comboboxEl) {
      comboboxEl.setAttribute(
        'aria-expanded',
        String(model.shouldShowSuggestionPanel),
      )
    }

    // Render/hide suggestion dropdown (skip DOM rebuild if suggestions unchanged)
    const suggestionKey = model.shouldShowSuggestionPanel
      ? `${model.suggestionViewModels.map(s => s.term).join('\0')}:${model.shouldShowHiddenArchivedNotice}:${model.suggestionIsExclusion}:${model.suggestionOperator}`
      : ''
    if (suggestionKey !== prevSuggestionKey) {
      prevSuggestionKey = suggestionKey
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
            requestArchivedCharactersLoad(window, { strategy: 'all', preserveScroll: true })
          },
        })
        // Animate open: remove collapsed state, enable pointer events
        suggestionList.classList.remove('opacity-0', 'scale-y-[0.96]', 'pointer-events-none')
        suggestionList.classList.add('opacity-100', 'scale-y-100', 'pointer-events-auto')
        listboxCtrl.reset()
      }
      else {
        // Animate close: collapse and disable pointer events
        suggestionList.classList.add('opacity-0', 'scale-y-[0.96]', 'pointer-events-none')
        suggestionList.classList.remove('opacity-100', 'scale-y-100', 'pointer-events-auto')
        // Clear content after transition
        const onEnd = () => {
          if (suggestionList.classList.contains('opacity-0')) {
            suggestionList.textContent = ''
          }
          suggestionList.removeEventListener('transitionend', onEnd)
        }
        suggestionList.addEventListener('transitionend', onEnd, { once: true })
        // Fallback for motion-reduce (no transition fires)
        setTimeout(() => {
          if (suggestionList.classList.contains('opacity-0')) {
            suggestionList.textContent = ''
          }
        }, 200)
      }
    }

    // Prefetch archived batches when notice shows
    if (model.shouldShowHiddenArchivedNotice) {
      prefetchDeferredBatches('archived')
    }

    // Render popular keywords (skip if unchanged)
    const popularKeywordsKey = popularKeywords.join('\0')
    if (popularKeywordsKey !== prevPopularKeywordsKey) {
      prevPopularKeywordsKey = popularKeywordsKey
      if (keywordListEl) {
        renderPopularKeywords(
          keywordListEl,
          popularKeywords,
          prepareSearchInteraction,
          applyPopularKeyword,
        )
      }
      if (popularKeywordsEl) {
        const shouldShow = popularKeywords.length > 0
        popularKeywordsEl.classList.toggle('invisible', !shouldShow)
        popularKeywordsEl.classList.toggle('opacity-0', !shouldShow)
      }
    }
  }

  /**
   * Schedule recompute: immediate rAF for cheap UI, debounced for heavy work.
   * Pass `immediate: true` for non-typing triggers (focus, suggestion select, external state)
   * where the user expects instant feedback.
   */
  function scheduleRecompute(options?: { immediate?: boolean }) {
    // Always update buttons on next frame (cheap)
    if (!recomputeRafId) {
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
      requestAnimationFrame(recompute)
    }
    else {
      if (recomputeTimerId)
        clearTimeout(recomputeTimerId)
      recomputeTimerId = window.setTimeout(() => {
        recomputeTimerId = 0
        requestAnimationFrame(recompute)
      }, RECOMPUTE_DEBOUNCE_MS)
    }
  }

  // ==================== Popular keyword interaction ====================

  function applyPopularKeyword(keyword: string) {
    if (!keyword)
      return

    const nextQuery = applySuggestionToQuery('', keyword)
    if (!nextQuery.trim())
      return

    trackRybbitEvent(ANALYTICS_EVENTS.popularKeywordClicked, { keyword })
    prepareSearchInteraction()
    applySelectedQuery(nextQuery, {
      preventScroll: true,
      focusInput: !shouldUseTapLikeFocus(),
    })
    scheduleRecompute({ immediate: true })
  }

  // ==================== Bind event listeners ====================

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
        copyState = 'success'
        live.textContent = controls.searchUrlCopied
      }
      catch {
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
    const shareIcon = copyUrlBtn.querySelector('[data-icon="share"]')
    const checkIcon = copyUrlBtn.querySelector('[data-icon="check"]')
    if (shareIcon)
      (shareIcon as HTMLElement).classList.toggle('hidden', copyState === 'success')
    if (checkIcon)
      (checkIcon as HTMLElement).classList.toggle('hidden', copyState !== 'success')
  }

  // Help trigger/popover
  if (helpTriggerEl) {
    helpTriggerEl.addEventListener('pointerdown', () => {
      isIndexReady = true
    })
    helpTriggerEl.addEventListener('focus', () => {
      isIndexReady = true
    })
  }

  if (helpPopoverEl) {
    helpPopoverEl.addEventListener('toggle', (event) => {
      const toggleEvent = event as ToggleEvent
      if (toggleEvent.newState === 'open') {
        renderHelpContent(helpPopoverEl, controls)
      }
    })
  }

  // Shuffle button: pick weighted random entry, scroll to it
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      trackRybbitEvent(ANALYTICS_EVENTS.shuffleClicked)
      if (!externalEntries || externalEntries.length === 0)
        return

      const candidates = matchedIds.size > 0
        ? externalEntries.filter(entry => matchedIds.has(entry.id))
        : externalEntries

      if (candidates.length === 0)
        return

      // Avoid picking the same entry twice in a row
      const pool = candidates.length > 1 && lastShuffledId !== null
        ? candidates.filter(entry => entry.id !== lastShuffledId)
        : candidates

      const randomEntry = pickWeightedEntry(pool)
      lastShuffledId = randomEntry.id

      if (!randomEntry.domKey)
        return

      // Try to find the element in DOM (already loaded)
      const element = document.querySelector<HTMLElement>(
        `[data-commission-search-key="${CSS.escape(randomEntry.domKey)}"]`,
      )
      if (element) {
        scrollAndAnimateEntry(element)
        return
      }

      // Entry is in a deferred batch — trigger load, then scroll
      const sectionId = extractSectionIdFromDomKey(randomEntry.domKey)
      if (!sectionId)
        return

      void loadDeferredEntryBatch(sectionId)
        .then(() => {
          requestAnimationFrame(() => {
            const loadedElement = document.querySelector<HTMLElement>(
              `[data-commission-search-key="${CSS.escape(randomEntry.domKey)}"]`,
            )
            if (loadedElement) {
              scrollAndAnimateEntry(loadedElement)
            }
          })
        })
        .catch(() => {
          // Deferred load failed or timed out — silently ignore
        })
    })
  }

  // Rotate button: next keyword page + dismiss featured keywords
  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      trackRybbitEvent(ANALYTICS_EVENTS.keywordRefreshClicked)
      hasDismissedFeaturedKeywords = true
      popularKeywordPage += 1

      // Trigger refresh icon spin animation
      if (rotateIconEl) {
        rotateIconEl.getAnimations?.().forEach(a => a.cancel())
        rotateIconEl.animate?.(
          [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-360deg)' },
          ],
          {
            duration: REFRESH_ICON_SPIN_DURATION_MS,
            easing: REFRESH_ICON_SPIN_EASING,
            iterations: 1,
          },
        )
      }

      scheduleRecompute({ immediate: true })
    })
  }

  // 7. External subscriptions
  const unsubViewMode = subscribeViewMode((nextMode) => {
    mode = nextMode
    prefetchedActive = false
    prefetchedArchived = false
    requestedActiveForSearch = panelState.activeLoaded
    requestedArchivedForSearch = panelState.archivedLoaded
    scheduleRecompute({ immediate: true })
  })

  const unsubPanelState = subscribePanelState((nextState) => {
    panelState = nextState
    if (nextState.activeLoaded) {
      requestedActiveForSearch = true
      activeLoadFailed = false
    }
    if (nextState.archivedLoaded) {
      requestedArchivedForSearch = true
    }
    syncActiveLoadFeedback()
    scheduleRecompute({ immediate: true })
  })

  window.addEventListener(ACTIVE_CHARACTERS_LOAD_FAILED_EVENT, handleActiveLoadFailed)
  window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, handleActiveLoadSucceeded)
  retryActiveLoadBtn?.addEventListener('click', retryActiveLoad)

  const unsubUrlQuery = subscribeToUrlQuerySnapshot(() => {
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

  // Fetch external search index
  void ensureHomeSearchEntriesPromise()
    .then((entries) => {
      externalEntries = entries
      popularKeywordPool = buildPopularKeywordPoolFromEntries(entries)
      scheduleRecompute({ immediate: true })
    })
    .catch((error) => {
      console.error(error)
    })

  // Initial recompute (immediate — first render)
  scheduleRecompute({ immediate: true })

  // Return cleanup function
  return () => {
    setFuseHydrationCallback(null)
    unsubViewMode()
    unsubPanelState()
    unsubUrlQuery()
    window.removeEventListener(ACTIVE_CHARACTERS_LOAD_FAILED_EVENT, handleActiveLoadFailed)
    window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, handleActiveLoadSucceeded)
    retryActiveLoadBtn?.removeEventListener('click', retryActiveLoad)
    listboxCtrl.unbind()
    suggestionCtrl.unbindOutsideListeners()
    if (recomputeRafId)
      cancelAnimationFrame(recomputeRafId)
    if (recomputeTimerId)
      clearTimeout(recomputeTimerId)
    if (copyResetTimer)
      clearTimeout(copyResetTimer)
  }
}
