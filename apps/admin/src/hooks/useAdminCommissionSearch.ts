import type {
  AdminCommissionSearchRow,
  CommissionRow,
  CreatorAliasRow,
  SearchIndexLike,
} from '@commission-index/domain'
import type { AdminCommissionSearchEntry } from '../lib/search/adminCommissionSearch'
import {
  createSearchIndex,
  getMatchedEntryIds,
  hydrateSearchIndexFuse,
} from '@commission-index/domain'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildAdminCommissionSearchEntries,
  normalizeAdminSearchQuery,
} from '../lib/search/adminCommissionSearch'

interface UseAdminCommissionSearchOptions {
  commissionSearchRows: AdminCommissionSearchRow[]
  creatorAliases: CreatorAliasRow[]
  // Already deferred by the caller, which owns the input state.
  query: string
}

// Search over bootstrap rows plus a local overlay of saved/deleted rows, so a save is searchable immediately.
// The overlay is bound to the bootstrap rows it was made against and drops away when fresh rows arrive.
export function useAdminCommissionSearch({
  commissionSearchRows,
  creatorAliases,
  query,
}: UseAdminCommissionSearchOptions) {
  const [searchUpdates, setSearchUpdates] = useState<{ base: AdminCommissionSearchRow[], rows: Map<number, CommissionRow | null> }>(() => ({
    base: commissionSearchRows,
    rows: new Map(),
  }))
  const commissionSearchRowsRef = useRef(commissionSearchRows)

  useEffect(() => {
    commissionSearchRowsRef.current = commissionSearchRows
  }, [commissionSearchRows])

  const normalizedQuery = useMemo(
    () => normalizeAdminSearchQuery(query),
    [query],
  )
  const hasAppliedSearchQuery = normalizedQuery.length > 0
  const currentSearchRows = useMemo(() => commissionSearchRows.flatMap((row) => {
    if (searchUpdates.base !== commissionSearchRows || !searchUpdates.rows.has(row.id)) {
      return [row]
    }
    const update = searchUpdates.rows.get(row.id)
    return update
      ? [
          {
            ...update,
            // Same raw D1 JSON string as bootstrap rows, so every reader parses one format.
            links: JSON.stringify(update.links),
          },
        ]
      : []
  }), [commissionSearchRows, searchUpdates])
  const searchEntries = useMemo(
    () => buildAdminCommissionSearchEntries(currentSearchRows, creatorAliases),
    [currentSearchRows, creatorAliases],
  )
  const baseSearchIndex = useMemo(
    () => createSearchIndex(searchEntries),
    [searchEntries],
  )
  const [hydratedIndex, setHydratedIndex] = useState<{ base: SearchIndexLike<AdminCommissionSearchEntry>, index: SearchIndexLike<AdminCommissionSearchEntry> } | null>(null)
  useEffect(() => {
    let cancelled = false
    hydrateSearchIndexFuse(baseSearchIndex).then((hydrated) => {
      if (!cancelled)
        setHydratedIndex({ base: baseSearchIndex, index: hydrated })
    })
    return () => {
      cancelled = true
    }
  }, [baseSearchIndex])
  const searchIndex = (hydratedIndex?.base === baseSearchIndex)
    ? hydratedIndex.index
    : baseSearchIndex
  const matchedCommissionIds = useMemo(
    () => getMatchedEntryIds(query, searchIndex),
    [searchIndex, query],
  )
  const matchedSearchRows = useMemo(
    () => hasAppliedSearchQuery
      ? currentSearchRows.filter(row => matchedCommissionIds.has(row.id))
      : [],
    [currentSearchRows, matchedCommissionIds, hasAppliedSearchQuery],
  )

  const updateSearchRow = useCallback((id: number, row: CommissionRow | null) => {
    // Save callbacks can outlive the render that created them; bind the overlay to the latest rows.
    const base = commissionSearchRowsRef.current
    setSearchUpdates(previous => ({
      base,
      rows: new Map(previous.base === base
        ? previous.rows
        : []).set(id, row),
    }))
  }, [])

  return {
    currentSearchRows,
    hasAppliedSearchQuery,
    matchedCommissionIds,
    matchedSearchRows,
    updateSearchRow,
  }
}
