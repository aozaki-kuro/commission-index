import type { CommissionSearchEntrySource } from '#features/home/search/CommissionSearch'
import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
  CreatorAliasRow,
} from '#lib/admin/db'
import type { ListItem } from './hooks/useCommissionManager'

import { fetchCharacterCommissionsAction } from '#admin/actions'
import CommissionSearch from '#features/home/search/CommissionSearch'
import { getCharacterSectionId } from '#lib/characters/nav'
import { buildCommissionSearchDomKey } from '#lib/search/commissionSearchMetadata'
import { normalizeQuery } from '#lib/search/index'
import { closestCenter, DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CharacterDeleteDialog from './components/CharacterDeleteDialog'
import SortableCharacterCard from './components/SortableCharacterCard'
import SortableDivider from './components/SortableDivider'
import useCommissionManager, { DIVIDER_ID } from './hooks/useCommissionManager'
import { buildAdminCommissionSearchMetadata } from './search/commissionSearchMetadata'
import {
  areNumberSetsEqual,
  buildCommissionToCharacterMap,
  collectMatchedCharacterIds,
} from './search/matchedCharacterIds'

interface CommissionManagerProps {
  characters: CharacterRow[]
  creatorAliases: CreatorAliasRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
}

const MAX_AUTO_LOAD_SEARCH_CHARACTERS = 8

function CommissionManager({
  characters,
  creatorAliases,
  commissionSearchRows,
}: CommissionManagerProps) {
  const [loadedCommissions, setLoadedCommissions] = useState<CommissionRow[]>([])
  const [loadingCharacterIds, setLoadingCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadedCharacterIds, setLoadedCharacterIds] = useState<Set<number>>(() => new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadedCharacterIdsRef = useRef<Set<number>>(new Set())
  const inFlightLoadPromisesRef = useRef<Map<number, Promise<void>>>(new Map())
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

  const buttonMapRef = useRef<Record<number, HTMLButtonElement | null>>({})
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
        rows.toSorted((a, b) => b.fileName.localeCompare(a.fileName)),
      )
    }
    return next
  }, [commissionMap])
  const characterNameById = useMemo(
    () =>
      new Map<number, string>(
        list
          .filter(
            (item): item is Extract<ListItem, { type: 'character' }> => item.type === 'character',
          )
          .map(item => [item.data.id, item.data.name] as const),
      ),
    [list],
  )

  const commissionSearchEntries = useMemo<CommissionSearchEntrySource[]>(
    () =>
      commissionSearchRows.map((commission) => {
        const characterName
          = characterNameById.get(commission.characterId) ?? commission.characterName
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
  const commissionToCharacterIdMap = useMemo(
    () => buildCommissionToCharacterMap(commissionSearchRows),
    [commissionSearchRows],
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
    if (!hasAppliedSearchQuery)
      return new Set<number>()
    return collectMatchedCharacterIds(effectiveMatchedCommissionIds, commissionToCharacterIdMap)
  }, [commissionToCharacterIdMap, effectiveMatchedCommissionIds, hasAppliedSearchQuery])
  const autoLoadSearchCharacterIds = useMemo(() => {
    if (!hasAppliedSearchQuery)
      return new Set<number>()

    const next = new Set<number>()
    for (const item of list) {
      if (item.type !== 'character')
        continue
      if (!matchedCharacterIds.has(item.data.id))
        continue
      next.add(item.data.id)
      if (next.size >= MAX_AUTO_LOAD_SEARCH_CHARACTERS)
        break
    }

    return next
  }, [hasAppliedSearchQuery, list, matchedCharacterIds])

  const visibleCommissionsByCharacter = useMemo(() => {
    if (!hasAppliedSearchQuery)
      return sortedLoadedCommissionsByCharacter

    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of sortedLoadedCommissionsByCharacter) {
      next.set(
        characterId,
        rows.filter(commission => effectiveMatchedCommissionIds.has(commission.id)),
      )
    }
    return next
  }, [effectiveMatchedCommissionIds, hasAppliedSearchQuery, sortedLoadedCommissionsByCharacter])

  const loadCharacterCommissions = useCallback((characterId: number): Promise<void> => {
    if (loadedCharacterIdsRef.current.has(characterId)) {
      return Promise.resolve()
    }
    const inFlight = inFlightLoadPromisesRef.current.get(characterId)
    if (inFlight) {
      return inFlight
    }

    setLoadingCharacterIds(prev => new Set(prev).add(characterId))
    setLoadError(null)

    const request = fetchCharacterCommissionsAction(characterId)
      .then((commissions) => {
        setLoadedCommissions(prev => [
          ...prev.filter(commission => commission.characterId !== characterId),
          ...commissions,
        ])
        loadedCharacterIdsRef.current.add(characterId)
        setLoadedCharacterIds(prev => new Set(prev).add(characterId))
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load commissions.'
        setLoadError(message)
      })
      .finally(() => {
        setLoadingCharacterIds((prev) => {
          const next = new Set(prev)
          next.delete(characterId)
          return next
        })
        inFlightLoadPromisesRef.current.delete(characterId)
      })
    inFlightLoadPromisesRef.current.set(characterId, request)

    return request
  }, [])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(previous => (previous === query ? previous : query))
      const nextHasQuery = normalizeQuery(query).length > 0
      setHasAppliedSearchQuery(prev => (prev === nextHasQuery ? prev : nextHasQuery))
      if (!nextHasQuery) {
        closeAllCharacterOpen()
      }
    },
    [closeAllCharacterOpen],
  )

  const handleMatchedIdsChange = useCallback((nextMatchedIds: Set<number>) => {
    setMatchedCommissionIds(previous =>
      areNumberSetsEqual(previous, nextMatchedIds) ? previous : nextMatchedIds,
    )
  }, [])

  const buttonRefFor = useCallback(
    (characterId: number) => (el: HTMLButtonElement | null) => {
      buttonMapRef.current[characterId] = el
    },
    [],
  )

  const handleToggle = useCallback(
    (characterId: number) => {
      const isOpening = !openIds.has(characterId)
      if (isOpening) {
        void loadCharacterCommissions(characterId)
      }

      toggleCharacterOpen(characterId)
      queueMicrotask(() => {
        const button = buttonMapRef.current[characterId]
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
    if (!hasAppliedSearchQuery || autoLoadSearchCharacterIds.size === 0)
      return

    let active = true
    const loadInSequence = async () => {
      for (const characterId of autoLoadSearchCharacterIds) {
        if (!active)
          return
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
          Drag to reprioritize characters and edit their commissions in place. Click to expand.
        </p>
      </header>

      {feedback && (
        <p
          className={`
            text-sm
            ${
        feedback.type === 'error'
          ? `
            text-red-500
            dark:text-red-400
          `
          : `
            text-gray-700
            dark:text-gray-200
          `
        }
          `}
        >
          {feedback.text}
        </p>
      )}
      {loadError && (
        <p className="
          text-sm text-red-500
          dark:text-red-400
        "
        >
          {loadError}
        </p>
      )}

      <CommissionSearch
        disableDomFiltering
        externalEntries={commissionSearchEntries}
        initialQuery={searchQuery || undefined}
        onQueryChange={handleSearchQueryChange}
        onMatchedIdsChange={handleMatchedIdsChange}
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
              const visibleCharacterCommissions
                = visibleCommissionsByCharacter.get(character.id) ?? []

              const isActive = dividerIndex === -1 ? true : index < dividerIndex
              const shouldAutoOpen
                = hasAppliedSearchQuery && autoLoadSearchCharacterIds.has(character.id)

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
                  onDeleteCommission={(commissionId) => {
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
          if (confirmingCharacter)
            performDeleteCharacter(confirmingCharacter)
        }}
      />
    </section>
  )
}

export default CommissionManager
