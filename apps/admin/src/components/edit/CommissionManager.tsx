import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
  CreatorAliasRow,
  SearchIndexLike,
} from '@commission-index/domain'
import type { AdminCommissionSearchEntry } from '../../lib/search/adminCommissionSearch'
import {
  createSearchIndex,
  getMatchedEntryIds,
  hydrateSearchIndexFuse,
} from '@commission-index/domain'
import { IconArrowsSort, IconSearch, IconX } from '@tabler/icons-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { formControlStyles } from '../../app/ui'
import { useCommissionManager } from '../../hooks/useCommissionManager'
import { useNativeDragReorder } from '../../hooks/useNativeDragReorder'
import { fetchCharacterCommissionsAction } from '../../lib/adminActions'
import { compareCommissionsByDate, formatCommissionPublicId, getCommissionAccessibleLabel } from '../../lib/commissionPresentation'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import {
  buildAdminCommissionSearchEntries,
  normalizeAdminSearchQuery,
} from '../../lib/search/adminCommissionSearch'
import { DropIndicator } from '../DropIndicator'
import { FloatingNotice } from '../FloatingNotice'
import { CharacterDeleteDialog } from './CharacterDeleteDialog'
import { CommissionEditDrawer } from './CommissionEditDrawer'
import { KeywordReplacePopover } from './KeywordReplacePopover'
import { SortableCharacterCard } from './SortableCharacterCard'
import { SortableDivider } from './SortableDivider'

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
  creatorAliases: CreatorAliasRow[]
  isInitialLoading?: boolean
  isInitialError?: boolean
  onOpenGroupsLoaded?: () => void
  onRefresh?: () => void
}

export function CommissionManager({
  characters,
  commissionSearchRows,
  creatorAliases,
  isInitialLoading = false,
  isInitialError = false,
  onOpenGroupsLoaded,
  onRefresh,
}: CommissionManagerProps) {
  const [loadedCommissions, setLoadedCommissions] = useState<CommissionRow[]>([])
  const [loadingCharacterIds, setLoadingCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadedCharacterIds, setLoadedCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadErrors, setLoadErrors] = useState<Map<number, string>>(() => new Map())
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [searchUpdates, setSearchUpdates] = useState<{ base: AdminCommissionSearchRow[], rows: Map<number, CommissionRow | null> }>(() => ({ base: commissionSearchRows, rows: new Map() }))
  const [selectedCommission, setSelectedCommission] = useState<CommissionRow | null>(null)
  const [pendingCommissionId, setPendingCommissionId] = useState<number | null>(null)
  const [selectionError, setSelectionError] = useState<{ commissionId: number, characterId: number } | null>(null)
  const pendingCommissionIdRef = useRef<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isReorderMode, setIsReorderMode] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const loadedCharacterIdsRef = useRef<Set<number>>(new Set())
  const inFlightLoadPromisesRef = useRef<Map<number, Promise<CommissionRow[] | null>>>(new Map())
  const latestLoadPromisesRef = useRef(new Map<number, { version: number, promise: Promise<CommissionRow[] | null> }>())
  const staleCharacterIdsRef = useRef(new Set<number>())
  const loadVersionsRef = useRef(new Map<number, number>())
  const previousSearchRowsRef = useRef(commissionSearchRows)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const {
    activeCount,
    cancelEditing,
    closeConfirmDialog,
    commissionMap,
    confirmingCharacter,
    deletingId,
    editing,
    feedback,
    dismissFeedback,
    handleDeleteCommission,
    handleRenameChange,
    handleReorder,
    handleRequestDelete,
    isDeletePending,
    list,
    openIds,
    orderedCharacters,
    performDeleteCharacter,
    startEditingName,
    submitRename,
    toggleCharacterOpen,
  } = useCommissionManager({
    characters,
    commissions: loadedCommissions,
    isDataReady: !isInitialLoading && !isInitialError,
    onDataChanged: onRefresh,
  })

  const normalizedQuery = useMemo(
    () => normalizeAdminSearchQuery(deferredSearchQuery),
    [deferredSearchQuery],
  )
  const hasAppliedSearchQuery = normalizedQuery.length > 0
  const currentSearchRows = useMemo(() => commissionSearchRows.flatMap((row) => {
    if (searchUpdates.base !== commissionSearchRows || !searchUpdates.rows.has(row.id)) {
      return [row]
    }
    const update = searchUpdates.rows.get(row.id)
    return update ? [{ ...update, links: update.links.join('\n') }] : []
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
  const searchIndex = (hydratedIndex?.base === baseSearchIndex) ? hydratedIndex.index : baseSearchIndex
  const allCommissionIds = baseSearchIndex.allIds
  const matchedCommissionIds = useMemo(
    () => getMatchedEntryIds(deferredSearchQuery, searchIndex),
    [searchIndex, deferredSearchQuery],
  )
  const effectiveMatchedCommissionIds = hasAppliedSearchQuery ? matchedCommissionIds : allCommissionIds
  const matchedSearchRows = useMemo(
    () => hasAppliedSearchQuery
      ? currentSearchRows.filter(row => effectiveMatchedCommissionIds.has(row.id))
      : [],
    [currentSearchRows, effectiveMatchedCommissionIds, hasAppliedSearchQuery],
  )
  const sortedLoadedCommissionsByCharacter = useMemo(() => {
    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of commissionMap) {
      next.set(
        characterId,
        rows.toSorted(compareCommissionsByDate),
      )
    }
    return next
  }, [commissionMap])
  const dividerIndex = list.findIndex(item => item.type === 'divider')

  const {
    containerProps: dragContainerProps,
    dragHandleProps,
    dragItemAttr,
    draggingIndex,
    dropIndicatorIndex,
  } = useNativeDragReorder({
    itemCount: list.length,
    onReorder: handleReorder,
    disabled: hasAppliedSearchQuery,
  })

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
      return latest && latest.version !== version ? latest.promise : null
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
        const message = error instanceof Error ? error.message : 'Failed to load commissions.'
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

  const refreshLoadedGroups = useCallback(() => {
    const currentCharacterIds = new Set(characters.map(character => character.id))
    const currentIds = [...loadedCharacterIdsRef.current].filter(id => currentCharacterIds.has(id))
    void Promise.all(currentIds.map(characterId => loadCharacterCommissions(characterId, true))).then((results) => {
      if (results.every(Boolean)) {
        setRefreshError(null)
      }
    })
  }, [characters, loadCharacterCommissions])

  useEffect(() => {
    if (previousSearchRowsRef.current !== commissionSearchRows) {
      previousSearchRowsRef.current = commissionSearchRows
      refreshLoadedGroups()
    }
  }, [commissionSearchRows, refreshLoadedGroups])

  const updateSearchRow = useCallback((id: number, row: CommissionRow | null) => {
    setSearchUpdates(previous => ({
      base: commissionSearchRows,
      rows: new Map(previous.base === commissionSearchRows ? previous.rows : []).set(id, row),
    }))
  }, [commissionSearchRows])

  const handleToggle = useCallback((characterId: number) => {
    const isOpening = !openIds.has(characterId)
    if (isOpening) {
      void loadCharacterCommissions(characterId)
    }

    toggleCharacterOpen(characterId)
  }, [loadCharacterCommissions, openIds, toggleCharacterOpen])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    pendingCommissionIdRef.current = null
    setPendingCommissionId(null)
    setSelectionError(null)
    if (normalizeAdminSearchQuery(value)) {
      setIsReorderMode(false)
    }
  }

  useEffect(() => {
    if (isInitialLoading || isInitialError) {
      return
    }
    let active = true
    const validIds = new Set(characters.map(character => character.id))
    void Promise.all([...openIds].filter(id => validIds.has(id)).map(characterId => loadCharacterCommissions(characterId)))
      .finally(() => {
        if (active) {
          onOpenGroupsLoaded?.()
        }
      })
    return () => {
      active = false
    }
  }, [characters, isInitialError, isInitialLoading, loadCharacterCommissions, onOpenGroupsLoaded, openIds])

  const invalidateCharacterLoad = useCallback((characterId: number) => {
    loadVersionsRef.current.set(characterId, (loadVersionsRef.current.get(characterId) ?? 0) + 1)
  }, [])

  // 保存后立即更新作品和搜索；后台同步只刷新已加载的角色组。
  const handleCommissionSaved = useCallback((updated: CommissionRow) => {
    const previous = loadedCommissions.find(commission => commission.id === updated.id)
    invalidateCharacterLoad(updated.characterId)
    if (previous && previous.characterId !== updated.characterId) {
      invalidateCharacterLoad(previous.characterId)
    }
    setLoadedCommissions(previous =>
      previous.map(commission => commission.id === updated.id ? updated : commission),
    )
    updateSearchRow(updated.id, updated)
    onRefresh?.()
  }, [invalidateCharacterLoad, loadedCommissions, onRefresh, updateSearchRow])

  const handleSearchResultSelect = useCallback((commissionId: number, characterId: number) => {
    const cached = loadedCommissions.find(commission => commission.id === commissionId)
    setSelectionError(null)
    if (cached && !staleCharacterIdsRef.current.has(characterId) && !inFlightLoadPromisesRef.current.has(characterId)) {
      pendingCommissionIdRef.current = null
      setPendingCommissionId(null)
      setSelectedCommission(cached)
      return
    }
    pendingCommissionIdRef.current = commissionId
    setPendingCommissionId(commissionId)
    void loadCharacterCommissions(characterId, !cached && !inFlightLoadPromisesRef.current.has(characterId)).then((commissions) => {
      if (pendingCommissionIdRef.current !== commissionId) {
        return
      }
      const selected = commissions?.find(commission => commission.id === commissionId)
      if (selected) {
        setSelectedCommission(selected)
        setPendingCommissionId(null)
        pendingCommissionIdRef.current = null
      }
      else {
        staleCharacterIdsRef.current.add(characterId)
        setSelectionError({ commissionId, characterId })
        setLoadErrors(previous => new Map(previous).set(characterId, commissions
          ? 'Entry no longer available'
          : previous.get(characterId) ?? 'Current details are unavailable'))
      }
    })
  }, [loadCharacterCommissions, loadedCommissions])

  const handleSelectCommission = useCallback((commission: CommissionRow) => {
    handleSearchResultSelect(commission.id, commission.characterId)
  }, [handleSearchResultSelect])

  const handleCloseDrawer = useCallback(() => {
    pendingCommissionIdRef.current = null
    setPendingCommissionId(null)
    setSelectionError(null)
    setSelectedCommission(null)
  }, [])

  const handleKeywordReplaceComplete = useCallback(() => {
    // 旧网格可保留展示，但批量变更后的记录必须刷新后才能编辑。
    for (const characterId of new Set([...loadedCharacterIdsRef.current, ...inFlightLoadPromisesRef.current.keys()])) {
      staleCharacterIdsRef.current.add(characterId)
      invalidateCharacterLoad(characterId)
    }
    notifyDataUpdate()
    markPendingRebuild()
    onRefresh?.()
  }, [invalidateCharacterLoad, onRefresh])

  const handleDrawerDelete = useCallback(() => {
    if (!selectedCommission)
      return
    invalidateCharacterLoad(selectedCommission.characterId)
    setLoadedCommissions(previous =>
      previous.filter(c => c.id !== selectedCommission.id),
    )
    handleDeleteCommission(
      selectedCommission.characterId,
      selectedCommission.id,
    )
    updateSearchRow(selectedCommission.id, null)
    setSelectedCommission(null)
    onRefresh?.()
  }, [handleDeleteCommission, invalidateCharacterLoad, onRefresh, selectedCommission, updateSearchRow])

  const handleDrawerSaveSuccess = useCallback((updated: CommissionRow) => {
    handleCommissionSaved(updated)
    // 保存响应不得重新打开用户已关闭的抽屉，或切换回上一条作品。
    setSelectedCommission(current => current?.id === updated.id ? updated : current)
  }, [handleCommissionSaved])

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="
          text-lg font-semibold text-gray-900
          dark:text-gray-100
        "
        >
          Existing commissions
        </h2>
        <p className="
          text-sm text-gray-600
          dark:text-gray-300
        "
        >
          <span className="hidden sm:inline">Drag to reprioritize characters and edit their commissions in place. </span>
          <span className="sm:hidden">Tap the sort button to reorder characters. </span>
          Click to expand.
        </p>
      </header>

      {feedback && <FloatingNotice tone={feedback.type} onDismiss={dismissFeedback}>{feedback.text}</FloatingNotice>}
      {pendingCommissionId !== null && !selectionError && !hasAppliedSearchQuery && (
        <FloatingNotice>Loading commission…</FloatingNotice>
      )}
      {selectionError && !hasAppliedSearchQuery && (
        <FloatingNotice tone="error" onDismiss={() => setSelectionError(null)}>
          <p>Could not load the latest commission. Try again before editing.</p>
          <button type="button" onClick={() => handleSearchResultSelect(selectionError.commissionId, selectionError.characterId)} className="mt-2 font-medium underline underline-offset-2">Retry opening commission</button>
        </FloatingNotice>
      )}
      {refreshError && (
        <FloatingNotice tone="error" onDismiss={() => setRefreshError(null)}>
          <p>Could not refresh commissions. Showing saved data.</p>
          <p className="mt-1 text-xs">{refreshError}</p>
          <button type="button" onClick={refreshLoadedGroups} className="mt-2 font-medium underline underline-offset-2">Try again</button>
        </FloatingNotice>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <IconSearch
              className="
                pointer-events-none absolute top-1/2 left-3 size-4
                -translate-y-1/2 text-gray-400
              "
              stroke={1.8}
              aria-hidden="true"
            />
            <input
              role="combobox"
              aria-label="Search commissions"
              aria-expanded="false"
              value={searchQuery}
              onChange={event => handleSearchChange(event.target.value)}
              placeholder="Search commissions"
              className={`
                ${formControlStyles}
                pr-20 pl-9
              `}
            />
            {searchQuery
              ? (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    aria-label="Clear search"
                    className="
                      absolute top-1/2 right-3 inline-flex size-5 -translate-y-1/2
                      items-center justify-center rounded-full text-gray-400
                      transition
                      hover:bg-gray-100 hover:text-gray-600
                      focus-visible:ring-2 focus-visible:ring-gray-400
                      focus-visible:ring-offset-2 focus-visible:ring-offset-white
                      focus-visible:outline-none
                      dark:hover:bg-gray-800 dark:hover:text-gray-200
                      dark:focus-visible:ring-offset-gray-900
                    "
                  >
                    <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                  </button>
                )
              : null}
            {hasAppliedSearchQuery && (
              <span aria-live="polite" className="pointer-events-none absolute top-1/2 right-11 -translate-y-1/2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {matchedCommissionIds.size}
                <span className="sr-only"> matching commission entries</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsReorderMode(prev => !prev)}
            disabled={hasAppliedSearchQuery}
            aria-pressed={isReorderMode}
            aria-label={isReorderMode ? 'Exit reorder mode' : 'Enter reorder mode'}
            className={`
              inline-flex sm:hidden size-10 shrink-0 items-center justify-center
              rounded-xl border text-sm font-medium transition
              focus-visible:ring-2 focus-visible:ring-gray-400
              focus-visible:ring-offset-2 focus-visible:ring-offset-white
              focus-visible:outline-none
              dark:focus-visible:ring-offset-gray-900
              disabled:pointer-events-none disabled:opacity-50
              ${isReorderMode
      ? `
                  border-blue-200 bg-blue-50 text-blue-600
                  dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400
                `
      : `
                  border-gray-200 bg-white text-gray-500
                  hover:bg-gray-50 hover:text-gray-700
                  dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400
                  dark:hover:bg-gray-800 dark:hover:text-gray-200
                `}
            `}
          >
            <IconArrowsSort className="size-4.5" stroke={2} aria-hidden="true" />
          </button>
          <KeywordReplacePopover
            commissionSearchRows={currentSearchRows}
            onComplete={handleKeywordReplaceComplete}
          />
        </div>

      </div>

      {hasAppliedSearchQuery
        ? (
            <div className="space-y-2" aria-label="Search results">
              {matchedSearchRows.length === 0 && <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No commissions match the current query.</p>}
              {matchedSearchRows.map(row => (
                <button
                  key={row.id}
                  type="button"
                  title={`Public ID: ${row.publicId}`}
                  aria-label={`${row.characterName} · ${getCommissionAccessibleLabel(row)}`}
                  aria-busy={pendingCommissionId === row.id && loadingCharacterIds.has(row.characterId)}
                  onClick={() => handleSearchResultSelect(row.id, row.characterId)}
                  className="flex min-h-16 w-full min-w-0 flex-col items-start justify-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:bg-gray-800"
                >
                  <span className="w-full truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {row.characterName}
                    {' · '}
                    {row.commissionDate || 'Undated'}
                    {' · '}
                    {row.creatorName?.trim() || 'Anon'}
                  </span>
                  <span className="w-full truncate text-xs text-gray-500 dark:text-gray-400">
                    {pendingCommissionId === row.id && loadingCharacterIds.has(row.characterId)
                      ? 'Loading commission…'
                      : pendingCommissionId === row.id && loadErrors.has(row.characterId)
                        ? `Could not load: ${loadErrors.get(row.characterId)} — click to retry`
                        : row.design?.trim() || `#${formatCommissionPublicId(row.publicId)}`}
                    {row.partNumber ? ` · Part ${row.partNumber}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )
        : isInitialLoading
          ? (
              <div aria-hidden="true" className="space-y-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-[3.75rem] motion-safe:animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900/50" />
                ))}
              </div>
            )
          : isInitialError
            ? (
                <div className="flex min-h-60 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Commission list is unavailable.
                </div>
              )
            : (
                <div className="motion-safe:animate-[tabFade_260ms_ease-out] space-y-4">
                  <div className="space-y-4" {...dragContainerProps}>
                    {list.map((item, index) => {
                      if (item.type === 'divider') {
                        return (
                          <div key="divider" className="relative" {...dragItemAttr(index)}>
                            {dropIndicatorIndex === index && <DropIndicator />}
                            <SortableDivider activeCount={activeCount} />
                          </div>
                        )
                      }

                      const character = item.data
                      const visibleCharacterCommissions
                        = sortedLoadedCommissionsByCharacter.get(character.id) ?? []
                      const isActive = dividerIndex === -1 ? true : index < dividerIndex
                      return (
                        <div key={character.id} className="relative" {...dragItemAttr(index)}>
                          {dropIndicatorIndex === index && <DropIndicator />}
                          <SortableCharacterCard
                            character={character}
                            isActive={isActive}
                            totalCommissions={character.commissionCount}
                            commissionList={visibleCharacterCommissions}
                            isCommissionsLoaded={loadedCharacterIds.has(character.id)}
                            isCommissionsLoading={loadingCharacterIds.has(character.id)}
                            commissionLoadError={loadErrors.get(character.id) ?? null}
                            onRetryLoad={() => void loadCharacterCommissions(character.id)}
                            isOpen={openIds.has(character.id)}
                            onToggle={() => handleToggle(character.id)}
                            selectedCommissionId={selectedCommission?.id ?? null}
                            onSelectCommission={handleSelectCommission}
                            isEditing={editing?.id === character.id}
                            editingValue={editing?.id === character.id ? editing.value : character.name}
                            onStartEdit={() => startEditingName(character)}
                            onRenameChange={handleRenameChange}
                            onCancelEdit={cancelEditing}
                            onSubmitRename={submitRename}
                            onRequestDelete={() => {
                              deleteReturnFocusRef.current = document.activeElement instanceof HTMLElement
                                ? document.activeElement
                                : null
                              handleRequestDelete(character)
                            }}
                            isDeleting={deletingId === character.id || isDeletePending}
                            isDragging={draggingIndex === index}
                            dragHandleProps={dragHandleProps(index)}
                            disableDrag={hasAppliedSearchQuery}
                            isReorderMode={isReorderMode}
                            onMoveUp={index === 0
                              ? undefined
                              : () => {
                                  const targetIndex = dividerIndex !== -1 && index - 1 === dividerIndex
                                    ? index - 2
                                    : index - 1
                                  if (targetIndex >= 0)
                                    handleReorder(index, targetIndex)
                                }}
                            onMoveDown={index === list.length - 1
                              ? undefined
                              : () => {
                                  const targetIndex = dividerIndex !== -1 && index + 1 === dividerIndex
                                    ? index + 2
                                    : index + 1
                                  if (targetIndex < list.length)
                                    handleReorder(index, targetIndex)
                                }}
                          />
                        </div>
                      )
                    })}
                    {dropIndicatorIndex === list.length && <DropIndicator />}
                  </div>
                </div>
              )}

      <CharacterDeleteDialog
        isOpen={Boolean(confirmingCharacter)}
        characterName={confirmingCharacter?.name ?? ''}
        commissionCount={confirmingCharacter?.commissionCount ?? 0}
        cancelButtonRef={cancelDeleteButtonRef}
        returnFocusRef={deleteReturnFocusRef}
        isDeletePending={isDeletePending}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          if (confirmingCharacter) {
            performDeleteCharacter(confirmingCharacter)
          }
        }}
      />

      <CommissionEditDrawer
        open={selectedCommission !== null}
        commission={selectedCommission}
        characters={orderedCharacters}
        commissionSearchRows={currentSearchRows}
        onClose={handleCloseDrawer}
        onDelete={handleDrawerDelete}
        onSaveSuccess={handleDrawerSaveSuccess}
      />
    </section>
  )
}
