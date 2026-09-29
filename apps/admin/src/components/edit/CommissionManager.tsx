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
import { compareCommissionsByDate } from '../../lib/commissionPresentation'
import { notifyDataUpdate } from '../../lib/dataUpdateSignal'
import { markPendingRebuild } from '../../lib/pendingRebuildSignal'
import {
  buildAdminCommissionSearchEntries,
  buildCommissionToCharacterMap,
  collectMatchedCharacterIds,
  normalizeAdminSearchQuery,
} from '../../lib/search/adminCommissionSearch'
import { DropIndicator } from '../DropIndicator'
import { CharacterDeleteDialog } from './CharacterDeleteDialog'
import { CommissionEditDrawer } from './CommissionEditDrawer'
import { KeywordReplacePopover } from './KeywordReplacePopover'
import { SortableCharacterCard } from './SortableCharacterCard'
import { SortableDivider } from './SortableDivider'

const MAX_AUTO_LOAD_SEARCH_CHARACTERS = 8

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
  creatorAliases: CreatorAliasRow[]
}

export function CommissionManager({
  characters,
  commissionSearchRows,
  creatorAliases,
}: CommissionManagerProps) {
  const [loadedCommissions, setLoadedCommissions] = useState<CommissionRow[]>([])
  const [loadingCharacterIds, setLoadingCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadedCharacterIds, setLoadedCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedCommission, setSelectedCommission] = useState<CommissionRow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isReorderMode, setIsReorderMode] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const loadedCharacterIdsRef = useRef<Set<number>>(new Set())
  const inFlightLoadPromisesRef = useRef<Map<number, Promise<void>>>(new Map())
  const buttonMapRef = useRef<Record<number, HTMLButtonElement | null>>({})
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const {
    activeCount,
    cancelEditing,
    closeAllCharacterOpen,
    closeConfirmDialog,
    commissionMap,
    confirmingCharacter,
    deletingId,
    editing,
    feedback,
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
  })

  const normalizedQuery = useMemo(
    () => normalizeAdminSearchQuery(deferredSearchQuery),
    [deferredSearchQuery],
  )
  const hasAppliedSearchQuery = normalizedQuery.length > 0
  const searchEntries = useMemo(
    () => buildAdminCommissionSearchEntries(commissionSearchRows, creatorAliases),
    [commissionSearchRows, creatorAliases],
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
  const commissionToCharacterIdMap = useMemo(
    () => buildCommissionToCharacterMap(commissionSearchRows),
    [commissionSearchRows],
  )
  const matchedCharacterIds = useMemo(() => {
    if (!hasAppliedSearchQuery) {
      return new Set<number>()
    }

    return collectMatchedCharacterIds(effectiveMatchedCommissionIds, commissionToCharacterIdMap)
  }, [commissionToCharacterIdMap, effectiveMatchedCommissionIds, hasAppliedSearchQuery])
  const autoLoadSearchCharacterIds = useMemo(() => {
    if (!hasAppliedSearchQuery) {
      return new Set<number>()
    }

    const next = new Set<number>()
    for (const item of list) {
      if (item.type !== 'character') {
        continue
      }
      if (!matchedCharacterIds.has(item.data.id)) {
        continue
      }

      next.add(item.data.id)
      if (next.size >= MAX_AUTO_LOAD_SEARCH_CHARACTERS) {
        break
      }
    }

    return next
  }, [hasAppliedSearchQuery, list, matchedCharacterIds])
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
  const visibleCommissionsByCharacter = useMemo(() => {
    if (!hasAppliedSearchQuery) {
      return sortedLoadedCommissionsByCharacter
    }

    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of sortedLoadedCommissionsByCharacter) {
      next.set(
        characterId,
        rows.filter(row => effectiveMatchedCommissionIds.has(row.id)),
      )
    }
    return next
  }, [effectiveMatchedCommissionIds, hasAppliedSearchQuery, sortedLoadedCommissionsByCharacter])
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

  const buttonRefFor = useCallback(
    (characterId: number) => (element: HTMLButtonElement | null) => {
      buttonMapRef.current[characterId] = element
    },
    [],
  )

  const loadCharacterCommissions = useCallback((characterId: number): Promise<void> => {
    if (loadedCharacterIdsRef.current.has(characterId)) {
      return Promise.resolve()
    }

    const inFlight = inFlightLoadPromisesRef.current.get(characterId)
    if (inFlight) {
      return inFlight
    }

    setLoadingCharacterIds(previous => new Set(previous).add(characterId))
    setLoadError(null)

    const request = fetchCharacterCommissionsAction(characterId)
      .then((commissions) => {
        setLoadedCommissions(previous => [
          ...previous.filter(commission => commission.characterId !== characterId),
          ...commissions,
        ])
        loadedCharacterIdsRef.current.add(characterId)
        setLoadedCharacterIds(previous => new Set(previous).add(characterId))
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load commissions.')
      })
      .finally(() => {
        setLoadingCharacterIds((previous) => {
          const next = new Set(previous)
          next.delete(characterId)
          return next
        })
        inFlightLoadPromisesRef.current.delete(characterId)
      })

    inFlightLoadPromisesRef.current.set(characterId, request)
    return request
  }, [])

  const handleToggle = useCallback((characterId: number) => {
    const isOpening = !openIds.has(characterId)
    if (isOpening) {
      void loadCharacterCommissions(characterId)
    }

    toggleCharacterOpen(characterId)
    queueMicrotask(() => {
      const button = buttonMapRef.current[characterId]
      button?.scrollIntoView({
        behavior: hasAppliedSearchQuery ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    })
  }, [hasAppliedSearchQuery, loadCharacterCommissions, openIds, toggleCharacterOpen])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (!normalizeAdminSearchQuery(value)) {
      closeAllCharacterOpen()
    }
    if (normalizeAdminSearchQuery(value)) {
      setIsReorderMode(false)
    }
  }

  useEffect(() => {
    if (!hasAppliedSearchQuery || autoLoadSearchCharacterIds.size === 0) {
      return
    }

    let active = true
    const loadInSequence = async () => {
      for (const characterId of autoLoadSearchCharacterIds) {
        if (!active) {
          return
        }
        await loadCharacterCommissions(characterId)
      }
    }

    void loadInSequence()

    return () => {
      active = false
    }
  }, [autoLoadSearchCharacterIds, hasAppliedSearchQuery, loadCharacterCommissions])

  useEffect(() => {
    openIds.forEach((characterId) => {
      void loadCharacterCommissions(characterId)
    })
  }, [loadCharacterCommissions, openIds])

  // Update a single commission in-place after a successful save — no network
  // round-trip needed, and the updated characterId is handled automatically
  // because commissionMap is derived from loadedCommissions.
  const handleCommissionSaved = useCallback((updated: CommissionRow) => {
    setLoadedCommissions(previous =>
      previous.map(commission => commission.id === updated.id ? updated : commission),
    )
  }, [])

  const handleSelectCommission = useCallback((commission: CommissionRow) => {
    setSelectedCommission(commission)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setSelectedCommission(null)
  }, [])

  const handleKeywordReplaceComplete = useCallback(() => {
    notifyDataUpdate()
    markPendingRebuild()
    // Full reload to get fresh bootstrap data — simpler than surgical updates
    // since the replace can affect commissions across multiple characters
    window.location.reload()
  }, [])

  const handleDrawerDelete = useCallback(() => {
    if (!selectedCommission)
      return
    setLoadedCommissions(previous =>
      previous.filter(c => c.id !== selectedCommission.id),
    )
    handleDeleteCommission(
      selectedCommission.characterId,
      selectedCommission.id,
    )
    setSelectedCommission(null)
  }, [handleDeleteCommission, selectedCommission])

  const handleDrawerSaveSuccess = useCallback((updated: CommissionRow) => {
    handleCommissionSaved(updated)
    // Keep drawer open with updated data
    setSelectedCommission(updated)
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

      {feedback
        ? (
            <p
              className={feedback.type === 'error'
                ? `
                  text-sm text-red-500
                  dark:text-red-400
                `
                : `
                  text-sm text-gray-700
                  dark:text-gray-200
                `}
            >
              {feedback.text}
            </p>
          )
        : null}

      {loadError
        ? (
            <p className="
              text-sm text-red-500
              dark:text-red-400
            "
            >
              {loadError}
            </p>
          )
        : null}

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
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
                pr-10 pl-9
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
            commissionSearchRows={commissionSearchRows}
            onComplete={handleKeywordReplaceComplete}
          />
        </div>

        {hasAppliedSearchQuery
          ? (
              <p className="
                text-xs text-gray-500
                dark:text-gray-400
              "
              >
                {matchedCommissionIds.size === 0
                  ? 'No commissions match the current query.'
                  : `${matchedCommissionIds.size} matching commission entries.`}
              </p>
            )
          : null}
      </div>

      <div className="animate-[tabFade_260ms_ease-out] space-y-4">
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
              = visibleCommissionsByCharacter.get(character.id) ?? []
            const isActive = dividerIndex === -1 ? true : index < dividerIndex
            const shouldAutoOpen
              = hasAppliedSearchQuery && autoLoadSearchCharacterIds.has(character.id)

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
                  isOpen={shouldAutoOpen || openIds.has(character.id)}
                  onToggle={() => handleToggle(character.id)}
                  selectedCommissionId={selectedCommission?.id ?? null}
                  onSelectCommission={handleSelectCommission}
                  buttonRefFor={buttonRefFor}
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
                  reduceMotion={hasAppliedSearchQuery}
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
        commissionSearchRows={commissionSearchRows}
        onClose={handleCloseDrawer}
        onDelete={handleDrawerDelete}
        onSaveSuccess={handleDrawerSaveSuccess}
      />
    </section>
  )
}
