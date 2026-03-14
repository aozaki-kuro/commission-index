import type { SearchEntryLike, SearchIndexLike, Suggestion, SuggestionEntryLike } from '#lib/search/index'
import {
  collectSuggestions,
  createSearchIndex,
  parseSuggestionRows,

} from '#lib/search/index'

export type Entry = SearchEntryLike
  & SuggestionEntryLike & {
    element?: HTMLElement
    sectionId?: string
    domKey?: string
  }

export interface SearchSuggestionAliasGroup {
  term: string
  aliases: string[]
}

export interface Section {
  id: string
  element: HTMLElement
  status: 'active' | 'stale' | undefined
}

export type SearchIndex = SearchIndexLike<Entry> & {
  entryById: Map<number, Entry>
  hiddenEntryIds: Set<number>
  sections: Section[]
  staleDivider: HTMLElement | null
  suggestions: Suggestion[]
  visibleEntriesCount: number
  visibleEntryIds: Set<number>
}

export interface CommissionSearchEntrySource {
  id: number
  domKey: string
  searchText: string
  searchSuggest?: string
}

const normalizeSuggestionTermKey = (term: string) => term.trim().toLowerCase()

const MAX_PARSED_SUGGESTION_ROWS_CACHE_SIZE = 400
const parsedSuggestionRowsCache = new Map<string, ReturnType<typeof parseSuggestionRows>>()
const externalEntryCache = new WeakMap<CommissionSearchEntrySource[], Entry[]>()
const stableEntryDerivedStateCache = new WeakMap<
  Entry[],
  {
    entryById: Map<number, Entry>
    suggestions: Suggestion[]
  }
>()

function setParsedSuggestionRowsCacheEntry(key: string, value: ReturnType<typeof parseSuggestionRows>) {
  if (parsedSuggestionRowsCache.has(key)) {
    parsedSuggestionRowsCache.delete(key)
  }

  parsedSuggestionRowsCache.set(key, value)
  if (parsedSuggestionRowsCache.size > MAX_PARSED_SUGGESTION_ROWS_CACHE_SIZE) {
    const oldestKey = parsedSuggestionRowsCache.keys().next().value
    if (oldestKey !== undefined) {
      parsedSuggestionRowsCache.delete(oldestKey)
    }
  }

  return value
}

function getParsedSuggestionRows(searchSuggest = '') {
  const cached = parsedSuggestionRowsCache.get(searchSuggest)
  if (cached) {
    setParsedSuggestionRowsCacheEntry(searchSuggest, cached)
    return cached
  }

  const parsed = parseSuggestionRows(searchSuggest)
  return setParsedSuggestionRowsCacheEntry(searchSuggest, parsed)
}

function getCachedExternalEntries(externalEntries: CommissionSearchEntrySource[]) {
  const cached = externalEntryCache.get(externalEntries)
  if (cached)
    return cached

  const nextEntries: Entry[] = externalEntries.map(entry => ({
    id: entry.id,
    domKey: entry.domKey,
    searchText: entry.searchText.toLowerCase(),
    suggestionRows: getParsedSuggestionRows(entry.searchSuggest ?? ''),
  }))

  externalEntryCache.set(externalEntries, nextEntries)
  return nextEntries
}

function getStableEntryDerivedState(entries: Entry[]) {
  const cached = stableEntryDerivedStateCache.get(entries)
  if (cached)
    return cached

  const next = {
    entryById: new Map(entries.map(entry => [entry.id, entry])),
    suggestions: collectSuggestions(entries),
  }

  stableEntryDerivedStateCache.set(entries, next)
  return next
}

export function createEmptySearchIndex(): SearchIndex {
  return {
    entries: [],
    entryById: new Map(),
    hiddenEntryIds: new Set<number>(),
    sections: [],
    staleDivider: null,
    allIds: new Set<number>(),
    suggestions: [],
    fuse: null,
    visibleEntriesCount: 0,
    visibleEntryIds: new Set<number>(),
  }
}

function collectVisibilityMetrics(entries: Entry[]) {
  const visibleEntryIds = new Set<number>()
  const hiddenEntryIds = new Set<number>()
  let visibleEntriesCount = 0

  for (const entry of entries) {
    if (entry.element) {
      visibleEntryIds.add(entry.id)
      visibleEntriesCount += 1
      continue
    }

    hiddenEntryIds.add(entry.id)
  }

  return { hiddenEntryIds, visibleEntriesCount, visibleEntryIds }
}

function finalizeSearchIndex(entries: Entry[], {
  sections = [],
  staleDivider = null,
}: {
  sections?: Section[]
  staleDivider?: HTMLElement | null
} = {}): SearchIndex {
  const { entryById, suggestions } = getStableEntryDerivedState(entries)

  return {
    ...createSearchIndex(entries),
    ...collectVisibilityMetrics(entries),
    entryById,
    sections,
    staleDivider,
    suggestions,
  }
}

export function getDisplayMetrics({
  searchIndex,
  matchedIds,
  disableDomFiltering,
  hasDeferredQuery,
  mode,
  staleLoaded,
}: {
  searchIndex: SearchIndex
  matchedIds: Set<number>
  disableDomFiltering: boolean
  hasDeferredQuery: boolean
  mode: 'character' | 'timeline'
  staleLoaded: boolean
}) {
  if (disableDomFiltering) {
    const visibleEntriesCount = searchIndex.entries.length
    return {
      visibleEntriesCount,
      visibleMatchedCount: hasDeferredQuery ? matchedIds.size : visibleEntriesCount,
      hiddenStaleMatchedCount: 0,
    }
  }

  const { hiddenEntryIds, visibleEntriesCount, visibleEntryIds } = searchIndex
  if (!hasDeferredQuery) {
    return {
      visibleEntriesCount,
      visibleMatchedCount: visibleEntriesCount,
      hiddenStaleMatchedCount: 0,
    }
  }

  let visibleMatchedCount = 0
  let hiddenStaleMatchedCount = 0
  const canHaveHiddenStaleMatches = mode === 'character' && !staleLoaded

  for (const id of matchedIds) {
    if (visibleEntryIds.has(id)) {
      visibleMatchedCount += 1
      continue
    }

    if (canHaveHiddenStaleMatches && hiddenEntryIds.has(id)) {
      hiddenStaleMatchedCount += 1
    }
  }

  return {
    visibleEntriesCount,
    visibleMatchedCount,
    hiddenStaleMatchedCount,
  }
}

function getActiveCommissionViewRoot(viewMode: 'character' | 'timeline'): ParentNode | Document {
  if (typeof window === 'undefined')
    return document

  const activeSelector = `[data-commission-view-panel="${viewMode}"][data-commission-view-active="true"]`
  const panelSelector = `[data-commission-view-panel="${viewMode}"]`

  return (
    document.querySelector<HTMLElement>(activeSelector)
    ?? document.querySelector<HTMLElement>(panelSelector)
    ?? document
  )
}

function getDomSearchContext(viewMode: 'character' | 'timeline') {
  if (typeof window === 'undefined') {
    return {
      domEntries: [] as Array<{ element: HTMLElement, sectionId?: string, domKey?: string }>,
      sections: [] as Section[],
      staleDivider: null as HTMLElement | null,
    }
  }

  const root = getActiveCommissionViewRoot(viewMode)
  const domEntries = Array.from(root.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'), element => ({
    element,
    sectionId: element.dataset.characterSectionId,
    domKey: element.dataset.commissionSearchKey,
  }))

  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-character-section="true"]'), element => ({
    id: element.id,
    element,
    status: element.dataset.characterStatus as 'active' | 'stale' | undefined,
  }))

  const staleDivider = root.querySelector<HTMLElement>('[data-stale-divider="true"]')

  return { domEntries, sections, staleDivider }
}

export function buildSearchIndex(viewMode: 'character' | 'timeline', externalEntries?: CommissionSearchEntrySource[], options?: {
  skipDomContext?: boolean
  domSnapshotKey?: string
}): SearchIndex {
  if (typeof window === 'undefined')
    return createEmptySearchIndex()

  void options?.domSnapshotKey
  const shouldSkipDomContext = options?.skipDomContext === true
  const domContext = shouldSkipDomContext
    ? {
        domEntries: [] as Array<{ element: HTMLElement, sectionId?: string, domKey?: string }>,
        sections: [] as Section[],
        staleDivider: null as HTMLElement | null,
      }
    : getDomSearchContext(viewMode)
  const { domEntries, sections, staleDivider } = domContext

  if (externalEntries) {
    const domEntryByKey = new Map(
      domEntries
        .filter(entry => Boolean(entry.domKey))
        .map(entry => [entry.domKey as string, entry] as const),
    )

    const entries = getCachedExternalEntries(externalEntries)
    for (const entry of entries) {
      const domEntry = domEntryByKey.get(entry.domKey ?? '')
      entry.element = domEntry?.element
      entry.sectionId = domEntry?.sectionId
    }

    return finalizeSearchIndex(entries, { sections, staleDivider })
  }

  const entries = domEntries.map(({ element, sectionId, domKey }, id) => {
    const suggestText = element.dataset.searchSuggest ?? ''
    const suggestionRows = getParsedSuggestionRows(suggestText)
    return {
      suggestionRows,
      id,
      element,
      sectionId,
      domKey,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }
  })

  return finalizeSearchIndex(entries, { sections, staleDivider })
}

function addRelatedTerms(related: Map<string, Set<string>>, terms: string[]) {
  const uniqueTerms = new Map<string, string>()
  for (const term of terms) {
    const normalizedTerm = term.trim()
    const key = normalizeSuggestionTermKey(normalizedTerm)
    if (!key || uniqueTerms.has(key))
      continue
    uniqueTerms.set(key, normalizedTerm)
  }

  if (uniqueTerms.size < 2)
    return

  const values = [...uniqueTerms.values()]
  for (const leftTerm of values) {
    const leftKey = normalizeSuggestionTermKey(leftTerm)
    if (!leftKey)
      continue
    const bucket = related.get(leftKey) ?? new Set<string>()
    for (const rightTerm of values) {
      const rightKey = normalizeSuggestionTermKey(rightTerm)
      if (!rightKey || rightKey === leftKey)
        continue
      bucket.add(rightTerm)
    }
    related.set(leftKey, bucket)
  }
}

export function buildRelatedSuggestionTermsMap(entries: SuggestionEntryLike[], aliasGroups: SearchSuggestionAliasGroup[]) {
  const related = new Map<string, Set<string>>()
  const usedPrimaryKeys = new Set<string>()

  for (const group of aliasGroups) {
    const primaryKey = normalizeSuggestionTermKey(group.term)
    if (!primaryKey || usedPrimaryKeys.has(primaryKey))
      continue
    usedPrimaryKeys.add(primaryKey)
    addRelatedTerms(related, [group.term, ...group.aliases])
  }

  for (const entry of entries) {
    const creatorTerms: string[] = []
    for (const row of entry.suggestionRows.values()) {
      if (row.source !== 'Creator')
        continue
      const term = row.term.trim()
      if (!term)
        continue
      creatorTerms.push(term)
    }

    addRelatedTerms(related, creatorTerms)
  }

  return new Map(
    Array.from(related.entries(), ([key, terms]) => [
      key,
      terms.toSorted((left, right) => left.localeCompare(right, 'ja')),
    ]),
  )
}
