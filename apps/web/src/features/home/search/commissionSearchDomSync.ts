import type { SearchIndex } from '@features/home/search/commissionSearchIndex'
import { dispatchSidebarSearchState } from '@lib/navigation/sidebarSearchState'

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left === right)
    return true
  if (left.size !== right.size)
    return false

  for (const value of left) {
    if (!right.has(value))
      return false
  }

  return true
}

function setTextContentIfChanged(element: HTMLElement | null, message: string) {
  if (!element || element.textContent === message)
    return
  element.textContent = message
}

function toggleHiddenClass(element: HTMLElement, shouldHide: boolean) {
  const isHidden = element.classList.contains('hidden')
  if (isHidden === shouldHide)
    return false
  element.classList.toggle('hidden', shouldHide)
  return true
}

function syncEntryVisibilityForIndexChange({
  entryById,
  matchedIds,
  hasDeferredQuery,
  visibleSectionIds,
}: {
  entryById: SearchIndex['entryById']
  matchedIds: Set<number>
  hasDeferredQuery: boolean
  visibleSectionIds: Set<string> | null
}) {
  let didLayoutChange = false

  for (const entry of entryById.values()) {
    const isMatched = !hasDeferredQuery || matchedIds.has(entry.id)

    if (isMatched && visibleSectionIds && entry.sectionId) {
      visibleSectionIds.add(entry.sectionId)
    }

    if (!entry.element)
      continue
    if (toggleHiddenClass(entry.element, !isMatched)) {
      didLayoutChange = true
    }
  }

  return didLayoutChange
}

function syncEntryVisibilityForMatchedDiff({
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
}) {
  let didLayoutChange = false

  for (const id of previousMatchedIds) {
    if (matchedIds.has(id))
      continue

    const previousEntry = entryById.get(id)
    if (!previousEntry?.element)
      continue
    if (toggleHiddenClass(previousEntry.element, true)) {
      didLayoutChange = true
    }
  }

  for (const id of matchedIds) {
    const entry = entryById.get(id)
    if (!entry)
      continue

    if (visibleSectionIds && entry.sectionId) {
      visibleSectionIds.add(entry.sectionId)
    }

    const shouldEnsureVisible = indexChanged || !previousMatchedIds.has(id)
    if (!shouldEnsureVisible || !entry.element)
      continue

    if (toggleHiddenClass(entry.element, false)) {
      didLayoutChange = true
    }
  }

  return didLayoutChange
}

function syncSectionVisibility({
  sections,
  hasDeferredQuery,
  visibleSectionIds,
  sectionVisibilityById,
}: {
  sections: SearchIndex['sections']
  hasDeferredQuery: boolean
  visibleSectionIds: Set<string> | null
  sectionVisibilityById: Map<string, boolean>
}) {
  let didLayoutChange = false
  let visibleActiveSections = 0
  let visibleArchivedSections = 0

  for (const section of sections) {
    const visible = !hasDeferredQuery || Boolean(visibleSectionIds?.has(section.id))

    if (sectionVisibilityById.get(section.id) !== visible) {
      sectionVisibilityById.set(section.id, visible)
      if (toggleHiddenClass(section.element, !visible)) {
        didLayoutChange = true
      }
    }

    if (!visible || !hasDeferredQuery)
      continue
    if (section.status === 'active')
      visibleActiveSections += 1
    if (section.status === 'archived')
      visibleArchivedSections += 1
  }

  return { didLayoutChange, visibleActiveSections, visibleArchivedSections }
}

function syncArchivedDividerVisibility({
  archivedDivider,
  hasDeferredQuery,
  archivedVisible,
  visibleActiveSections,
  visibleArchivedSections,
  previousVisible,
}: {
  archivedDivider: HTMLElement | null
  hasDeferredQuery: boolean
  archivedVisible: boolean
  visibleActiveSections: number
  visibleArchivedSections: number
  previousVisible: boolean
}) {
  if (!archivedDivider) {
    return { didLayoutChange: false, nextVisible: previousVisible }
  }

  const shouldShowDivider
    = archivedVisible
      && (!hasDeferredQuery || (visibleActiveSections > 0 && visibleArchivedSections > 0))

  if (shouldShowDivider === previousVisible) {
    return { didLayoutChange: false, nextVisible: previousVisible }
  }

  const didLayoutChange = toggleHiddenClass(archivedDivider, !shouldShowDivider)
  return { didLayoutChange, nextVisible: shouldShowDivider }
}

export interface DomSyncState {
  disableDomFiltering: boolean
  hasDeferredQuery: boolean
  hiddenArchivedMatchedCount: number
  matchedIds: Set<number>
  resolvedIndex: SearchIndex
  archivedVisible: boolean
  statusMessage: string
  visibleEntriesCount: number
}

export interface DomSyncRefs {
  liveElement: HTMLElement | null
  previousMatchedIds: Set<number>
  previousFilterIndex: SearchIndex | null
  sectionVisibilityById: Map<string, boolean>
  archivedDividerVisible: boolean
}

export function createDomSyncRefs(): DomSyncRefs {
  return {
    liveElement: null,
    previousMatchedIds: new Set(),
    previousFilterIndex: null,
    sectionVisibilityById: new Map(),
    archivedDividerVisible: false,
  }
}

export function syncDom(state: DomSyncState, refs: DomSyncRefs) {
  const {
    disableDomFiltering,
    hasDeferredQuery,
    hiddenArchivedMatchedCount,
    matchedIds,
    resolvedIndex,
    archivedVisible,
    statusMessage,
    visibleEntriesCount,
  } = state

  if (disableDomFiltering) {
    if (visibleEntriesCount > 0) {
      setTextContentIfChanged(refs.liveElement, statusMessage)
    }
    return
  }

  const { entryById, sections, archivedDivider } = resolvedIndex
  const previousMatchedIds = refs.previousMatchedIds
  const matchedIdsChanged = !areSetsEqual(previousMatchedIds, matchedIds)
  const indexChanged = refs.previousFilterIndex !== resolvedIndex
  const visibleSectionIds = hasDeferredQuery ? new Set<string>() : null
  let didLayoutChange = false

  if (!matchedIdsChanged && !indexChanged) {
    setTextContentIfChanged(refs.liveElement, statusMessage)
    return
  }

  if (indexChanged) {
    didLayoutChange
      = syncEntryVisibilityForIndexChange({
        entryById,
        matchedIds,
        hasDeferredQuery,
        visibleSectionIds,
      }) || didLayoutChange
  }
  else if (matchedIdsChanged) {
    didLayoutChange
      = syncEntryVisibilityForMatchedDiff({
        entryById,
        matchedIds,
        previousMatchedIds,
        indexChanged,
        visibleSectionIds,
      }) || didLayoutChange
  }

  refs.previousMatchedIds = matchedIds
  refs.previousFilterIndex = resolvedIndex

  // Hide the archived placeholder when searching with no archived matches —
  // keeping it visible would let users click into a section with zero results.
  const { archivedPlaceholder } = resolvedIndex
  if (archivedPlaceholder) {
    const shouldHidePlaceholder = archivedVisible || (hasDeferredQuery && hiddenArchivedMatchedCount === 0)
    if (toggleHiddenClass(archivedPlaceholder, shouldHidePlaceholder)) {
      didLayoutChange = true
    }
  }

  if (visibleEntriesCount === 0) {
    return
  }

  const sectionSyncResult = syncSectionVisibility({
    sections,
    hasDeferredQuery,
    visibleSectionIds,
    sectionVisibilityById: refs.sectionVisibilityById,
  })
  didLayoutChange = sectionSyncResult.didLayoutChange || didLayoutChange

  const dividerSyncResult = syncArchivedDividerVisibility({
    archivedDivider,
    hasDeferredQuery,
    archivedVisible,
    visibleActiveSections: sectionSyncResult.visibleActiveSections,
    visibleArchivedSections: sectionSyncResult.visibleArchivedSections,
    previousVisible: refs.archivedDividerVisible,
  })
  refs.archivedDividerVisible = dividerSyncResult.nextVisible
  didLayoutChange = dividerSyncResult.didLayoutChange || didLayoutChange

  setTextContentIfChanged(refs.liveElement, statusMessage)

  if (didLayoutChange) {
    dispatchSidebarSearchState()
  }
}
