import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
  CreatorAliasRow,
} from '#lib/admin/db'
import CommissionSearch, {
  type CommissionSearchEntrySource,
} from '#features/home/search/CommissionSearch'
import { getCharacterSectionId } from '#lib/characters/nav'
import { buildCommissionSearchDomKey } from '#lib/search/commissionSearchMetadata'
import { normalizeQuery } from '#lib/search/index'
import { fetchCharacterCommissionsAction } from '#admin/actions'

import CharacterDeleteDialog from './components/CharacterDeleteDialog'
import SortableCharacterCard from './components/SortableCharacterCard'
import SortableDivider from './components/SortableDivider'
import useCommissionManager, { DIVIDER_ID } from './hooks/useCommissionManager'
import { buildAdminCommissionSearchMetadata } from './search/commissionSearchMetadata'

interface CommissionManagerProps {
  characters: CharacterRow[]
  creatorAliases: CreatorAliasRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
}

const CommissionManager = ({
  characters,
  creatorAliases,
  commissionSearchRows,
}: CommissionManagerProps) => {
  const [loadedCommissions, setLoadedCommissions] = useState<CommissionRow[]>([])
  const [loadingCharacterIds, setLoadingCharacterIds] = useState<Set<number>>(new Set())
  const [loadedCharacterIds, setLoadedCharacterIds] = useState<Set<number>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadingCharacterIdsRef = useRef<Set<number>>(new Set())
  const loadedCharacterIdsRef = useRef<Set<number>>(new Set())
  const {
    list,
    commissionMap,
    feedback,
    openIds,
    editing,
    deletingId,
    isDeletePending,
    confirmingCharacter,
    sensors,
    orderedCharacters,
    itemIds,
    activeCount,
    handleDeleteCommission,
    handleRequestDelete,
    closeConfirmDialog,
    handleDragOver,
    handleDragEnd,
    startEditingName,
    handleRenameChange,
    cancelEditing,
    submitRename,
    performDeleteCharacter,
    toggleCharacterOpen,
    closeAllCharacterOpen,
  } = useCommissionManager({ characters, commissions: loadedCommissions })

  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const [hasAppliedSearchQuery, setHasAppliedSearchQuery] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dividerIndex = list.findIndex(i => i.type === 'divider')
  const creatorAliasesMap = useMemo(
    () => new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const)),
    [creatorAliases],
  )
  const sortedLoadedCommissionsByCharacter = useMemo(() => {
    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of commissionMap) {
      next.set(
        characterId,
        [...rows].sort((a, b) => b.fileName.localeCompare(a.fileName)),
      )
    }
    return next
  }, [commissionMap])
  const characterNameById = useMemo(
    () =>
      new Map(
        list
          .filter(
            (item): item is Extract<(typeof list)[number], { type: 'character' }> =>
              item.type === 'character',
          )
          .map(item => [item.data.id, item.data.name] as const),
      ),
    [list],
  )

  const commissionSearchEntries = useMemo<CommissionSearchEntrySource[]>(
    () =>
      commissionSearchRows.map(commission => {
        const characterName =
          characterNameById.get(commission.characterId) ?? commission.characterName
        const metadata = buildAdminCommissionSearchMetadata(
          characterName,
          commission,
          creatorAliasesMap,
        )
        return {
          id: commission.id,
          domKey: buildCommissionSearchDomKey(
            getCharacterSectionId(characterName),
            commission.fileName,
          ),
          searchText: metadata.searchText,
          searchSuggest: metadata.searchSuggestionText,
        }
      }),
    [characterNameById, commissionSearchRows, creatorAliasesMap],
  )
  const allCommissionIds = useMemo(
    () => new Set(commissionSearchEntries.map(entry => entry.id)),
    [commissionSearchEntries],
  )
  const [matchedCommissionIds, setMatchedCommissionIds] = useState<Set<number>>(
    () => allCommissionIds,
  )
  const effectiveMatchedCommissionIds = hasAppliedSearchQuery
    ? matchedCommissionIds
    : allCommissionIds

  const matchedCharacterIds = useMemo(() => {
    if (!hasAppliedSearchQuery) return new Set<number>()
    const next = new Set<number>()
    for (const row of commissionSearchRows) {
      if (effectiveMatchedCommissionIds.has(row.id)) {
        next.add(row.characterId)
      }
    }
    return next
  }, [commissionSearchRows, effectiveMatchedCommissionIds, hasAppliedSearchQuery])

  const visibleCommissionsByCharacter = useMemo(() => {
    if (!hasAppliedSearchQuery) return sortedLoadedCommissionsByCharacter

    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of sortedLoadedCommissionsByCharacter) {
      next.set(
        characterId,
        rows.filter(commission => effectiveMatchedCommissionIds.has(commission.id)),
      )
    }
    return next
  }, [effectiveMatchedCommissionIds, hasAppliedSearchQuery, sortedLoadedCommissionsByCharacter])

  const loadCharacterCommissions = useCallback((characterId: number) => {
    if (loadedCharacterIdsRef.current.has(characterId)) return
    if (loadingCharacterIdsRef.current.has(characterId)) return

    loadingCharacterIdsRef.current.add(characterId)
    setLoadingCharacterIds(prev => new Set(prev).add(characterId))
    setLoadError(null)

    fetchCharacterCommissionsAction(characterId)
      .then(commissions => {
        setLoadedCommissions(prev => [
          ...prev.filter(commission => commission.characterId !== characterId),
          ...commissions,
        ])
        loadedCharacterIdsRef.current.add(characterId)
        setLoadedCharacterIds(prev => new Set(prev).add(characterId))
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Failed to load commissions.'
        setLoadError(message)
      })
      .finally(() => {
        loadingCharacterIdsRef.current.delete(characterId)
        setLoadingCharacterIds(prev => {
          const next = new Set(prev)
          next.delete(characterId)
          return next
        })
      })
  }, [])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(query)
      const nextHasQuery = normalizeQuery(query).length > 0
      setHasAppliedSearchQuery(prev => (prev === nextHasQuery ? prev : nextHasQuery))
      if (!nextHasQuery) {
        closeAllCharacterOpen()
      }
    },
    [closeAllCharacterOpen],
  )

  const buttonRefFor = useCallback(
    (characterId: number) => (el: HTMLButtonElement | null) => {
      buttonRefs.current[characterId] = el
    },
    [],
  )

  const handleToggle = useCallback(
    (characterId: number) => {
      const isOpening = !openIds.has(characterId)
      if (isOpening) {
        loadCharacterCommissions(characterId)
      }

      toggleCharacterOpen(characterId)
      queueMicrotask(() => {
        const button = buttonRefs.current[characterId]
        if (button) {
          button.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: hasAppliedSearchQuery ? 'auto' : 'smooth',
          })
        }
      })
    },
    [hasAppliedSearchQuery, loadCharacterCommissions, openIds, toggleCharacterOpen],
  )

  useEffect(() => {
    if (!hasAppliedSearchQuery) return
    matchedCharacterIds.forEach(characterId => {
      loadCharacterCommissions(characterId)
    })
  }, [hasAppliedSearchQuery, loadCharacterCommissions, matchedCharacterIds])

  useEffect(() => {
    openIds.forEach(characterId => {
      loadCharacterCommissions(characterId)
    })
  }, [loadCharacterCommissions, openIds])

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Existing commissions
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Drag to reprioritize characters and edit their commissions in place. Click to expand.
        </p>
      </header>

      {feedback && (
        <p
          className={`text-sm ${
            feedback.type === 'error'
              ? 'text-red-500 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-200'
          }`}
        >
          {feedback.text}
        </p>
      )}
      {loadError && <p className="text-sm text-red-500 dark:text-red-400">{loadError}</p>}

      <CommissionSearch
        disableDomFiltering
        externalEntries={commissionSearchEntries}
        initialQuery={searchQuery || undefined}
        onQueryChange={handleSearchQueryChange}
        onMatchedIdsChange={setMatchedCommissionIds}
      />

      <div className="animate-[tabFade_260ms_ease-out] space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {list.map((item, index) => {
              if (item.type === 'divider') {
                return (
                  <SortableDivider key="divider" activeCount={activeCount} dividerId={DIVIDER_ID} />
                )
              }

              const character = item.data
              const visibleCharacterCommissions =
                visibleCommissionsByCharacter.get(character.id) ?? []

              const isActive = dividerIndex === -1 ? true : index < dividerIndex
              const shouldAutoOpen = hasAppliedSearchQuery && matchedCharacterIds.has(character.id)

              return (
                <SortableCharacterCard
                  key={character.id}
                  item={item}
                  isActive={isActive}
                  totalCommissions={character.commissionCount}
                  commissionList={visibleCharacterCommissions}
                  isCommissionsLoaded={loadedCharacterIds.has(character.id)}
                  isCommissionsLoading={loadingCharacterIds.has(character.id)}
                  isOpen={shouldAutoOpen || openIds.has(character.id)}
                  onToggle={() => handleToggle(character.id)}
                  onDeleteCommission={commissionId => {
                    setLoadedCommissions(prev =>
                      prev.filter(commission => commission.id !== commissionId),
                    )
                    handleDeleteCommission(character.id, commissionId)
                  }}
                  charactersForSelect={orderedCharacters}
                  buttonRefFor={buttonRefFor}
                  isEditing={editing?.id === character.id}
                  editingValue={editing?.id === character.id ? editing.value : character.name}
                  onStartEdit={() => startEditingName(character)}
                  onRenameChange={handleRenameChange}
                  onCancelEdit={cancelEditing}
                  onSubmitRename={submitRename}
                  onRequestDelete={() => handleRequestDelete(character)}
                  isDeleting={deletingId === character.id || isDeletePending}
                  disableDrag={hasAppliedSearchQuery}
                  reduceMotion={hasAppliedSearchQuery}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </div>

      <CharacterDeleteDialog
        isOpen={Boolean(confirmingCharacter)}
        characterName={confirmingCharacter?.name ?? ''}
        commissionCount={confirmingCharacter?.commissionCount ?? 0}
        isDeletePending={isDeletePending}
        confirmButtonRef={confirmDeleteButtonRef}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          if (confirmingCharacter) performDeleteCharacter(confirmingCharacter)
        }}
      />
    </section>
  )
}

export default CommissionManager
