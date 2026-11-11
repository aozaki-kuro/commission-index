import type { AdminCommissionSearchRow, CharacterRow, CommissionRow } from '@commission-index/domain'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCharacterCommissionsAction } from '../lib/adminActions'

interface UseCharacterCommissionGroupsOptions {
  characters: CharacterRow[]
  // New bootstrap rows trigger a refresh of the loaded groups.
  commissionSearchRows: AdminCommissionSearchRow[]
  // Characters to refetch when new bootstrap rows land; null/undefined refetches every loaded group.
  refreshScope?: ReadonlySet<number> | null
}

// Per-character lazy loader for full commission rows. Every request carries a per-character version, so a response
// superseded by a later load, save or invalidation never overwrites newer rows; callers waiting on a superseded
// request continue with the latest one instead.
export function useCharacterCommissionGroups({
  characters,
  commissionSearchRows,
  refreshScope,
}: UseCharacterCommissionGroupsOptions) {
  const [loadedCommissions, setLoadedCommissions] = useState<CommissionRow[]>([])
  const [loadingCharacterIds, setLoadingCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadedCharacterIds, setLoadedCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadErrors, setLoadErrors] = useState<Map<number, string>>(() => new Map())
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const loadedCharacterIdsRef = useRef<Set<number>>(new Set())
  const inFlightLoadPromisesRef = useRef<Map<number, Promise<CommissionRow[] | null>>>(new Map())
  const latestLoadPromisesRef = useRef(new Map<number, { version: number, promise: Promise<CommissionRow[] | null> }>())
  const staleCharacterIdsRef = useRef(new Set<number>())
  const loadVersionsRef = useRef(new Map<number, number>())
  const previousSearchRowsRef = useRef(commissionSearchRows)

  const loadCharacterCommissions = useCallback((characterId: number, force = false): Promise<CommissionRow[] | null> => {
    const inFlight = inFlightLoadPromisesRef.current.get(characterId)
    if (inFlight && !force) {
      return inFlight
    }
    if (!force && loadedCharacterIdsRef.current.has(characterId) && !staleCharacterIdsRef.current.has(characterId)) {
      return Promise.resolve(null)
    }

    staleCharacterIdsRef.current.add(characterId)

    const version = (loadVersionsRef.current.get(characterId) ?? 0) + 1
    loadVersionsRef.current.set(characterId, version)
    const isCurrent = () => loadVersionsRef.current.get(characterId) === version

    setLoadingCharacterIds(previous => new Set(previous).add(characterId))
    setLoadErrors((previous) => {
      const next = new Map(previous)
      next.delete(characterId)
      return next
    })

    // 刷新取代旧请求时，等待旧请求的选中操作必须接续最新响应。
    const latestResult = (): Promise<CommissionRow[] | null> | null => {
      const latest = latestLoadPromisesRef.current.get(characterId)
      return latest && latest.version !== version
        ? latest.promise
        : null
    }
    const request: Promise<CommissionRow[] | null> = fetchCharacterCommissionsAction(characterId)
      .then((commissions) => {
        if (!isCurrent()) {
          return latestResult()
        }
        staleCharacterIdsRef.current.delete(characterId)
        setLoadedCommissions(previous => [
          ...previous.filter(commission => commission.characterId !== characterId),
          ...commissions,
        ])
        loadedCharacterIdsRef.current.add(characterId)
        setLoadedCharacterIds(previous => new Set(previous).add(characterId))
        return commissions
      })
      .catch((error) => {
        if (!isCurrent()) {
          return latestResult()
        }
        const message = error instanceof Error
          ? error.message
          : 'Failed to load commissions.'
        setLoadErrors(previous => new Map(previous).set(characterId, message))
        if (loadedCharacterIdsRef.current.has(characterId)) {
          setRefreshError(message)
        }
        return null
      })
      .finally(() => {
        if (inFlightLoadPromisesRef.current.get(characterId) === request) {
          setLoadingCharacterIds((previous) => {
            const next = new Set(previous)
            next.delete(characterId)
            return next
          })
          inFlightLoadPromisesRef.current.delete(characterId)
        }
      })

    inFlightLoadPromisesRef.current.set(characterId, request)
    latestLoadPromisesRef.current.set(characterId, { version, promise: request })
    return request
  }, [])

  const refreshLoadedGroups = useCallback((scope?: ReadonlySet<number> | null) => {
    const currentCharacterIds = new Set(characters.map(character => character.id))
    const currentIds = [...loadedCharacterIdsRef.current].filter(id => currentCharacterIds.has(id) && (!scope || scope.has(id)))
    void Promise.all(currentIds.map(characterId => loadCharacterCommissions(characterId, true))).then((results) => {
      // A scoped pass says nothing about the groups it skipped, so it must not clear their refresh error.
      if (!scope && results.every(Boolean)) {
        setRefreshError(null)
      }
    })
  }, [characters, loadCharacterCommissions])

  const refreshScopeRef = useRef(refreshScope)
  refreshScopeRef.current = refreshScope

  useEffect(() => {
    if (previousSearchRowsRef.current !== commissionSearchRows) {
      previousSearchRowsRef.current = commissionSearchRows
      refreshLoadedGroups(refreshScopeRef.current)
    }
  }, [commissionSearchRows, refreshLoadedGroups])

  // Drops any response still in flight for this character; a local write is newer than what it would return.
  const invalidateCharacterLoad = useCallback((characterId: number) => {
    loadVersionsRef.current.set(characterId, (loadVersionsRef.current.get(characterId) ?? 0) + 1)
  }, [])

  // 旧网格可保留展示，但批量变更后的记录必须刷新后才能编辑。
  const invalidateAllGroups = useCallback(() => {
    for (const characterId of new Set([
      ...loadedCharacterIdsRef.current,
      ...inFlightLoadPromisesRef.current.keys(),
    ])) {
      staleCharacterIdsRef.current.add(characterId)
      invalidateCharacterLoad(characterId)
    }
  }, [invalidateCharacterLoad])

  // Read at call time: these change outside render and must not be captured by a stale closure.
  const isCharacterStale = useCallback((characterId: number) => staleCharacterIdsRef.current.has(characterId), [])
  const hasInFlightLoad = useCallback((characterId: number) => inFlightLoadPromisesRef.current.has(characterId), [])

  // A selection that could not find its entry marks the group stale so the next pick refetches it.
  const markCharacterLoadFailed = useCallback((characterId: number, getMessage: (previous: string | undefined) => string) => {
    staleCharacterIdsRef.current.add(characterId)
    setLoadErrors(previous => new Map(previous).set(characterId, getMessage(previous.get(characterId))))
  }, [])

  const replaceLoadedCommission = useCallback((updated: CommissionRow) => {
    setLoadedCommissions(previous =>
      previous.map(commission => commission.id === updated.id
        ? updated
        : commission),
    )
  }, [])

  const removeLoadedCommission = useCallback((commissionId: number) => {
    setLoadedCommissions(previous =>
      previous.filter(c => c.id !== commissionId),
    )
  }, [])

  const dismissRefreshError = useCallback(() => setRefreshError(null), [])

  return {
    dismissRefreshError,
    hasInFlightLoad,
    invalidateAllGroups,
    invalidateCharacterLoad,
    isCharacterStale,
    loadCharacterCommissions,
    loadedCharacterIds,
    loadedCommissions,
    loadErrors,
    loadingCharacterIds,
    markCharacterLoadFailed,
    refreshError,
    refreshLoadedGroups,
    removeLoadedCommission,
    replaceLoadedCommission,
  }
}
