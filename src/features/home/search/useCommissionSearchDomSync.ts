import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'
import { useEffect, useRef } from 'react'
import type { SearchIndex } from '#features/home/search/commissionSearchIndex'

const areSetsEqual = <T>(left: Set<T>, right: Set<T>) => {
  if (left === right) return true
  if (left.size !== right.size) return false

  for (const value of left) {
    if (!right.has(value)) return false
  }

  return true
}

const setTextContentIfChanged = (element: HTMLElement | null, message: string) => {
  if (!element || element.textContent === message) return
  element.textContent = message
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

interface UseCommissionSearchDomSyncOptions {
  disableDomFiltering: boolean
  hasDeferredQuery: boolean
  matchedIds: Set<number>
  resolvedIndex: SearchIndex
  statusMessage: string
  visibleEntriesCount: number
}

export const useCommissionSearchDomSync = ({
  disableDomFiltering,
  hasDeferredQuery,
  matchedIds,
  resolvedIndex,
  statusMessage,
  visibleEntriesCount,
}: UseCommissionSearchDomSyncOptions) => {
  const liveRef = useRef<HTMLParagraphElement>(null)
  const previousMatchedIdsRef = useRef<Set<number>>(new Set())
  const previousFilterIndexRef = useRef<SearchIndex | null>(null)
  const sectionVisibilityRef = useRef(new Map<string, boolean>())
  const staleDividerVisibilityRef = useRef(true)

  useEffect(() => {
    if (disableDomFiltering) {
      if (visibleEntriesCount > 0) {
        setTextContentIfChanged(liveRef.current, statusMessage)
      }
      return
    }

    const { entryById, sections, staleDivider } = resolvedIndex
    const previousMatchedIds = previousMatchedIdsRef.current
    const matchedIdsChanged = !areSetsEqual(previousMatchedIds, matchedIds)
    const indexChanged = previousFilterIndexRef.current !== resolvedIndex
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
    previousFilterIndexRef.current = resolvedIndex

    if (visibleEntriesCount === 0) {
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
  }, [
    disableDomFiltering,
    hasDeferredQuery,
    matchedIds,
    resolvedIndex,
    statusMessage,
    visibleEntriesCount,
  ])

  return { liveRef }
}
