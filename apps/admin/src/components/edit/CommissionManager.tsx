import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
  CreatorAliasRow,
} from '@commission-index/domain'
import type { DiscardGuard } from './CommissionEditDrawer'
import { IconArrowsSort, IconSearch, IconX } from '@tabler/icons-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { buttonStyles, formControlStyles } from '../../app/ui'
import { useAdminCommissionSearch } from '../../hooks/useAdminCommissionSearch'
import { useCharacterCommissionGroups } from '../../hooks/useCharacterCommissionGroups'
import { useCommissionManager } from '../../hooks/useCommissionManager'
import { arrayMove, useNativeDragReorder } from '../../hooks/useNativeDragReorder'
import { compareCommissionsByDate, formatCommissionPublicId, getCommissionAccessibleLabel } from '../../lib/commissionPresentation'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { consumeCommissionEditRequest } from '../../lib/editIntent'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import { normalizeAdminSearchQuery } from '../../lib/search/adminCommissionSearch'
import { DropIndicator } from '../DropIndicator'
import { FloatingNotice } from '../FloatingNotice'
import { CharacterDeleteDialog } from './CharacterDeleteDialog'
import { CommissionEditDrawer } from './CommissionEditDrawer'
import { CommissionThumbnail } from './CommissionThumbnailGrid'
import { KeywordReplacePopover } from './KeywordReplacePopover'
import { CharacterCardSkeleton, SortableCharacterCard } from './SortableCharacterCard'
import { SortableDivider } from './SortableDivider'

type MoveDirection = 'down' | 'up'

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
  creatorAliases: CreatorAliasRow[]
  isInitialLoading?: boolean
  isInitialError?: boolean
  onOpenGroupsLoaded?: () => void
  onRefresh?: () => void
  // Characters to refetch when new bootstrap rows land; null/undefined refetches every loaded group.
  refreshScope?: ReadonlySet<number> | null
}

export function CommissionManager({
  characters,
  commissionSearchRows,
  creatorAliases,
  isInitialLoading = false,
  isInitialError = false,
  onOpenGroupsLoaded,
  onRefresh,
  refreshScope,
}: CommissionManagerProps) {
  const {
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
  } = useCharacterCommissionGroups({ characters, commissionSearchRows, refreshScope })
  const [selectedCommission, setSelectedCommission] = useState<CommissionRow | null>(null)
  const [pendingCommissionId, setPendingCommissionId] = useState<number | null>(null)
  const [selectionError, setSelectionError] = useState<{ commissionId: number, characterId: number } | null>(null)
  const pendingCommissionIdRef = useRef<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isReorderMode, setIsReorderMode] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const drawerDiscardGuardRef = useRef<DiscardGuard | null>(null)
  const [lastMove, setLastMove] = useState<{ characterId: number, direction: MoveDirection } | null>(null)
  const [moveAnnouncement, setMoveAnnouncement] = useState('')
  const {
    cancelEditing,
    closeConfirmDialog,
    commissionMap,
    confirmingCharacter,
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

  const {
    currentSearchRows,
    hasAppliedSearchQuery,
    matchedCommissionIds,
    matchedSearchRows,
    updateSearchRow,
  } = useAdminCommissionSearch({ commissionSearchRows, creatorAliases, query: deferredSearchQuery })
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
  })

  const moveCharacter = (fromIndex: number, toIndex: number, character: CharacterRow, direction: MoveDirection) => {
    const nextList = arrayMove(list, fromIndex, toIndex)
    const nextCharacters = nextList.filter(item => item.type === 'character')
    const position = nextCharacters.findIndex(item => item.data.id === character.id) + 1
    const nextDividerIndex = nextList.findIndex(item => item.type === 'divider')
    const crossedDivider = (fromIndex < dividerIndex) !== (toIndex < nextDividerIndex)
    const status = toIndex < nextDividerIndex
      ? 'active'
      : 'archived'
    handleReorder(fromIndex, toIndex)
    setLastMove({ characterId: character.id, direction })
    setMoveAnnouncement(`${character.name} moved to position ${position} of ${nextCharacters.length}${crossedDivider
      ? `, ${status}`
      : ''}`)
  }

  // React moves the focused card's node (or disables the pressed control at an end), which blurs it; restore it before paint.
  useLayoutEffect(() => {
    if (!lastMove)
      return
    const card = document.getElementById(`admin-character-${lastMove.characterId}`)
    const pressed = card?.querySelector<HTMLButtonElement>(`[data-move-direction="${lastMove.direction}"]`)
    const opposite = card?.querySelector<HTMLButtonElement>(`[data-move-direction="${lastMove.direction === 'up'
      ? 'down'
      : 'up'}"]`)
    const target = pressed && !pressed.disabled
      ? pressed
      : opposite
    target?.focus()
  }, [lastMove])

  const handleToggle = useCallback((characterId: number) => {
    const isOpening = !openIds.has(characterId)
    if (isOpening) {
      void loadCharacterCommissions(characterId)
    }

    toggleCharacterOpen(characterId)
  }, [loadCharacterCommissions, openIds, toggleCharacterOpen])

  const clearPendingSelection = useCallback(() => {
    pendingCommissionIdRef.current = null
    setPendingCommissionId(null)
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    clearPendingSelection()
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
  }, [
    characters,
    isInitialError,
    isInitialLoading,
    loadCharacterCommissions,
    onOpenGroupsLoaded,
    openIds,
  ])

  // 保存后立即更新作品和搜索；后台同步只刷新已加载的角色组。
  const handleCommissionSaved = useCallback((updated: CommissionRow) => {
    const previous = loadedCommissions.find(commission => commission.id === updated.id)
    invalidateCharacterLoad(updated.characterId)
    if (previous && previous.characterId !== updated.characterId) {
      invalidateCharacterLoad(previous.characterId)
    }
    replaceLoadedCommission(updated)
    updateSearchRow(updated.id, updated)
    onRefresh?.()
  }, [
    invalidateCharacterLoad,
    loadedCommissions,
    onRefresh,
    replaceLoadedCommission,
    updateSearchRow,
  ])

  const handleSearchResultSelect = useCallback((commissionId: number, characterId: number) => {
    const cached = loadedCommissions.find(commission => commission.id === commissionId)
    setSelectionError(null)
    if (cached && !isCharacterStale(characterId) && !hasInFlightLoad(characterId)) {
      clearPendingSelection()
      setSelectedCommission(cached)
      return
    }
    pendingCommissionIdRef.current = commissionId
    setPendingCommissionId(commissionId)
    void loadCharacterCommissions(characterId, !cached && !hasInFlightLoad(characterId)).then((commissions) => {
      if (pendingCommissionIdRef.current !== commissionId) {
        return
      }
      const selected = commissions?.find(commission => commission.id === commissionId)
      if (selected) {
        setSelectedCommission(selected)
        clearPendingSelection()
      }
      else {
        setSelectionError({ commissionId, characterId })
        markCharacterLoadFailed(characterId, previous => commissions
          ? 'Entry no longer available'
          : previous ?? 'Current details are unavailable')
      }
    })
  }, [
    clearPendingSelection,
    hasInFlightLoad,
    isCharacterStale,
    loadCharacterCommissions,
    loadedCommissions,
    markCharacterLoadFailed,
  ])

  // Overview's Edit buttons hand over a commission to open once this page has data.
  useEffect(() => {
    if (isInitialLoading) {
      return
    }
    const request = consumeCommissionEditRequest()
    if (request && !isInitialError) {
      // Deferred so the selection is an event-like update, not a state write during the effect.
      queueMicrotask(() => handleSearchResultSelect(request.commissionId, request.characterId))
    }
  }, [handleSearchResultSelect, isInitialError, isInitialLoading])

  // Switching records unmounts the open form, so a dirty draft must be confirmed first.
  const requestSearchResultSelect = useCallback((commissionId: number, characterId: number) => {
    const select = () => handleSearchResultSelect(commissionId, characterId)
    const guard = drawerDiscardGuardRef.current
    if (guard && selectedCommission && selectedCommission.id !== commissionId) {
      guard(select)
      return
    }
    select()
  }, [handleSearchResultSelect, selectedCommission])

  const handleSelectCommission = useCallback((commission: CommissionRow) => {
    requestSearchResultSelect(commission.id, commission.characterId)
  }, [requestSearchResultSelect])

  const handleCloseDrawer = useCallback(() => {
    clearPendingSelection()
    setSelectionError(null)
    setSelectedCommission(null)
  }, [clearPendingSelection])

  const handleKeywordReplaceComplete = useCallback(() => {
    invalidateAllGroups()
    notifyDataUpdate()
    markPendingRebuild()
    onRefresh?.()
  }, [invalidateAllGroups, onRefresh])

  const handleDrawerDelete = useCallback(() => {
    if (!selectedCommission)
      return
    invalidateCharacterLoad(selectedCommission.characterId)
    removeLoadedCommission(selectedCommission.id)
    handleDeleteCommission(
      selectedCommission.characterId,
      selectedCommission.id,
    )
    updateSearchRow(selectedCommission.id, null)
    setSelectedCommission(null)
    onRefresh?.()
  }, [
    handleDeleteCommission,
    invalidateCharacterLoad,
    onRefresh,
    removeLoadedCommission,
    selectedCommission,
    updateSearchRow,
  ])

  const handleDrawerSaveSuccess = useCallback((updated: CommissionRow) => {
    handleCommissionSaved(updated)
    // 保存响应不得重新打开用户已关闭的抽屉，或切换回上一条作品。
    setSelectedCommission(current => current?.id === updated.id
      ? updated
      : current)
  }, [handleCommissionSaved])

  return (
    <section className="space-y-5">
      {/* Mounted before any move so the first announcement is read; sr-only keeps it out of layout. */}
      <p role="status" aria-live="polite" className="sr-only">{moveAnnouncement}</p>
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
          Select a character to expand.
        </p>
      </header>

      {feedback && <FloatingNotice tone={feedback.type} onDismiss={dismissFeedback}>{feedback.text}</FloatingNotice>}
      {pendingCommissionId !== null && !selectionError && !hasAppliedSearchQuery && (
        <FloatingNotice>Loading commission…</FloatingNotice>
      )}
      {selectionError && !hasAppliedSearchQuery && (
        <FloatingNotice tone="error" onDismiss={() => setSelectionError(null)}>
          <p className="text-inherit">Could not load the latest commission. Try again before editing.</p>
          <button type="button" onClick={() => requestSearchResultSelect(selectionError.commissionId, selectionError.characterId)} className="mt-2 font-medium underline underline-offset-2">Retry opening commission</button>
        </FloatingNotice>
      )}
      {refreshError && (
        <FloatingNotice tone="error" onDismiss={dismissRefreshError}>
          <p className="text-inherit">Could not refresh commissions. Showing saved data.</p>
          <p className="mt-1 text-xs text-inherit">{refreshError}</p>
          <button type="button" onClick={() => refreshLoadedGroups()} className="mt-2 font-medium underline underline-offset-2">Try again</button>
        </FloatingNotice>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 basis-full @min-[44rem]/workspace:flex-1 @min-[44rem]/workspace:basis-0">
            <IconSearch
              className="
                pointer-events-none absolute top-1/2 left-3 size-4
                -translate-y-1/2 text-gray-400
              "
              stroke={1.8}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search commissions"
              value={searchQuery}
              onChange={event => handleSearchChange(event.target.value)}
              placeholder="Search commissions"
              className={`
                ${formControlStyles}
                pr-20 pl-9 [&::-webkit-search-cancel-button]:hidden
              `}
            />
            {searchQuery
              ? (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    aria-label="Clear search"
                    className={`${buttonStyles.icon} absolute top-1/2 right-0 size-11 -translate-y-1/2`}
                  >
                    <IconX className="size-3.5" stroke={1.8} aria-hidden="true" />
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
            className={`${isReorderMode ? buttonStyles.primary : buttonStyles.secondary} shrink-0`}
          >
            <IconArrowsSort className="size-4.5" stroke={1.8} aria-hidden="true" />
            <span>{isReorderMode ? 'Done' : 'Reorder'}</span>
          </button>
          <KeywordReplacePopover
            commissionSearchRows={currentSearchRows}
            onComplete={handleKeywordReplaceComplete}
          />
        </div>

        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          Active characters appear first on the public site. Archived characters are folded by default.
        </p>
        {isReorderMode && !hasAppliedSearchQuery && (
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            Use the arrows or drag to reorder. Move below the divider to archive; move above to make active.
          </p>
        )}
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
                  onClick={() => requestSearchResultSelect(row.id, row.characterId)}
                  className="group flex min-h-16 w-full min-w-0 items-center gap-3 admin-surface rounded-xl border border-gray-200 p-2 text-left transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-800 dark:hover:bg-gray-800"
                >
                  <span className="w-28 shrink-0 overflow-hidden rounded-md sm:w-40">
                    <CommissionThumbnail
                      commissionId={row.id}
                      alt={`Source image for ${row.characterName} · ${getCommissionAccessibleLabel(row)}`}
                      isEnabled
                      retryKey={row}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="w-full truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {row.characterName}
                      {' · '}
                      {row.commissionDate || 'Undated'}
                      {' · '}
                      {row.creatorName?.trim() || 'Anon'}
                    </span>
                    <span className="w-full truncate text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {pendingCommissionId === row.id && loadingCharacterIds.has(row.characterId)
                        ? 'Loading commission…'
                        : pendingCommissionId === row.id && loadErrors.has(row.characterId)
                          ? `Could not load: ${loadErrors.get(row.characterId)} — select to retry`
                          : `#${formatCommissionPublicId(row.publicId)}`}
                      {row.partNumber
                        ? ` · Part ${row.partNumber}`
                        : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )
        : isInitialLoading
          ? (
              <div aria-hidden="true" className="space-y-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <CharacterCardSkeleton key={index} />
                ))}
              </div>
            )
          : isInitialError
            ? (
                <div className="flex min-h-60 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Commission list is unavailable.
                </div>
              )
            : (
                <div className="space-y-4">
                  <div className="space-y-4" {...dragContainerProps}>
                    {list.map((item, index) => {
                      if (item.type === 'divider') {
                        return (
                          <div key="divider" className="relative" {...dragItemAttr(index)}>
                            {dropIndicatorIndex === index && <DropIndicator />}
                            <SortableDivider archivedCount={list.length - dividerIndex - 1} />
                          </div>
                        )
                      }

                      const character = item.data
                      const visibleCharacterCommissions
                        = sortedLoadedCommissionsByCharacter.get(character.id) ?? []
                      const isActive = dividerIndex === -1
                        ? true
                        : index < dividerIndex
                      return (
                        <div key={character.id} className="relative" {...dragItemAttr(index)}>
                          {dropIndicatorIndex === index && <DropIndicator />}
                          <SortableCharacterCard
                            character={character}
                            isActive={isActive}
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
                            editingValue={editing?.id === character.id
                              ? editing.value
                              : character.name}
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
                            isDeleting={isDeletePending}
                            isDragging={draggingIndex === index}
                            dragHandleProps={dragHandleProps(index)}
                            isReorderMode={isReorderMode}
                            onMoveUp={index === 0
                              ? undefined
                              : () => moveCharacter(index, index - 1, character, 'up')}
                            onMoveDown={index === list.length - 1
                              ? undefined
                              : () => moveCharacter(index, index + 1, character, 'down')}
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
        discardGuardRef={drawerDiscardGuardRef}
        onClose={handleCloseDrawer}
        onDelete={handleDrawerDelete}
        onSaveSuccess={handleDrawerSaveSuccess}
      />
    </section>
  )
}
