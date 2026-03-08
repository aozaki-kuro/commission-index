import {
  collectSuggestions,
  createSearchIndex,
  parseSuggestionRows,
  type SearchEntryLike,
  type SearchIndexLike,
  type Suggestion,
  type SuggestionEntryLike,
} from '#lib/search/index'

export type Entry = SearchEntryLike &
  SuggestionEntryLike & {
    element?: HTMLElement
    sectionId?: string
    domKey?: string
  }

export type SearchSuggestionAliasGroup = {
  term: string
  aliases: string[]
}

export type Section = {
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

const parsedSuggestionRowsCache = new Map<string, ReturnType<typeof parseSuggestionRows>>()

const getParsedSuggestionRows = (searchSuggest = '') => {
  const cached = parsedSuggestionRowsCache.get(searchSuggest)
  if (cached) return cached

  const parsed = parseSuggestionRows(searchSuggest)
  parsedSuggestionRowsCache.set(searchSuggest, parsed)
  return parsed
}

export const createEmptySearchIndex = (): SearchIndex => ({
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
})

const collectVisibilityMetrics = (entries: Entry[]) => {
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
  ...collectVisibilityMetrics(entries),
  entryById: new Map(entries.map(entry => [entry.id, entry])),
  sections,
  staleDivider,
  suggestions: collectSuggestions(entries),
})

export const getDisplayMetrics = ({
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
}) => {
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
      domEntries: [] as Array<{ element: HTMLElement; sectionId?: string; domKey?: string }>,
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
    domKey: element.dataset.commissionSearchKey,
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

export const buildSearchIndex = (
  viewMode: 'character' | 'timeline',
  externalEntries?: CommissionSearchEntrySource[],
  options?: {
    skipDomContext?: boolean
    domSnapshotKey?: string
  },
): SearchIndex => {
  if (typeof window === 'undefined') return createEmptySearchIndex()

  void options?.domSnapshotKey
  const shouldSkipDomContext = options?.skipDomContext === true
  const domContext = shouldSkipDomContext
    ? {
        domEntries: [] as Array<{ element: HTMLElement; sectionId?: string; domKey?: string }>,
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

    const entries = externalEntries.map(entry => {
      const domEntry = domEntryByKey.get(entry.domKey)
      return {
        id: entry.id,
        domKey: entry.domKey,
        searchText: entry.searchText.toLowerCase(),
        suggestionRows: getParsedSuggestionRows(entry.searchSuggest ?? ''),
        element: domEntry?.element,
        sectionId: domEntry?.sectionId,
      }
    })

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

const addRelatedTerms = (related: Map<string, Set<string>>, terms: string[]) => {
  const uniqueTerms = new Map<string, string>()
  for (const term of terms) {
    const normalizedTerm = term.trim()
    const key = normalizeSuggestionTermKey(normalizedTerm)
    if (!key || uniqueTerms.has(key)) continue
    uniqueTerms.set(key, normalizedTerm)
  }

  if (uniqueTerms.size < 2) return

  const values = [...uniqueTerms.values()]
  for (const leftTerm of values) {
    const leftKey = normalizeSuggestionTermKey(leftTerm)
    if (!leftKey) continue
    const bucket = related.get(leftKey) ?? new Set<string>()
    for (const rightTerm of values) {
      const rightKey = normalizeSuggestionTermKey(rightTerm)
      if (!rightKey || rightKey === leftKey) continue
      bucket.add(rightTerm)
    }
    related.set(leftKey, bucket)
  }
}

export const buildRelatedSuggestionTermsMap = (
  entries: SuggestionEntryLike[],
  aliasGroups: SearchSuggestionAliasGroup[],
) => {
  const related = new Map<string, Set<string>>()
  const usedPrimaryKeys = new Set<string>()

  for (const group of aliasGroups) {
    const primaryKey = normalizeSuggestionTermKey(group.term)
    if (!primaryKey || usedPrimaryKeys.has(primaryKey)) continue
    usedPrimaryKeys.add(primaryKey)
    addRelatedTerms(related, [group.term, ...group.aliases])
  }

  for (const entry of entries) {
    const creatorTerms: string[] = []
    for (const row of entry.suggestionRows.values()) {
      if (row.source !== 'Creator') continue
      const term = row.term.trim()
      if (!term) continue
      creatorTerms.push(term)
    }

    addRelatedTerms(related, creatorTerms)
  }

  return new Map(
    [...related.entries()].map(([key, terms]) => [
      key,
      [...terms].sort((left, right) => left.localeCompare(right, 'ja')),
    ]),
  )
}
