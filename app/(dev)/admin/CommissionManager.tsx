'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { CharacterRow, CommissionRow, CreatorAliasRow } from '#lib/admin/db'
import CommissionSearch, {
  type CommissionSearchEntrySource,
} from '#components/home/search/CommissionSearch'
import { normalizeQuery } from '#lib/search/index'

import CharacterDeleteDialog from './components/CharacterDeleteDialog'
import SortableCharacterCard from './components/SortableCharacterCard'
import SortableDivider from './components/SortableDivider'
import useCommissionManager, { DIVIDER_ID } from './hooks/useCommissionManager'
import { buildAdminCommissionSearchMetadata } from './search/commissionSearchMetadata'

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissions: CommissionRow[]
  creatorAliases: CreatorAliasRow[]
}

const CommissionManager = ({ characters, commissions, creatorAliases }: CommissionManagerProps) => {
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
  } = useCommissionManager({ characters, commissions })

  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const [hasAppliedSearchQuery, setHasAppliedSearchQuery] = useState(false)
  const dividerIndex = list.findIndex(i => i.type === 'divider')
  const creatorAliasesMap = useMemo(
    () => new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const)),
    [creatorAliases],
  )
  const sortedCommissionsByCharacter = useMemo(() => {
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

  const commissionSearchEntries = useMemo<CommissionSearchEntrySource[]>(() => {
    const entries: CommissionSearchEntrySource[] = []

    for (const [characterId, rows] of sortedCommissionsByCharacter) {
      const characterName = characterNameById.get(characterId)
      if (!characterName) continue

      for (const commission of rows) {
        const metadata = buildAdminCommissionSearchMetadata(
          characterName,
          commission,
          creatorAliasesMap,
        )
        entries.push({
          id: commission.id,
          searchText: metadata.searchText,
          searchSuggest: metadata.searchSuggestionText,
        })
      }
    }

    return entries
  }, [characterNameById, creatorAliasesMap, sortedCommissionsByCharacter])
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

  const visibleCommissionsByCharacter = useMemo(() => {
    if (!hasAppliedSearchQuery) return sortedCommissionsByCharacter

    const next = new Map<number, CommissionRow[]>()
    for (const [characterId, rows] of sortedCommissionsByCharacter) {
      next.set(
        characterId,
        rows.filter(commission => effectiveMatchedCommissionIds.has(commission.id)),
      )
    }
    return next
  }, [effectiveMatchedCommissionIds, hasAppliedSearchQuery, sortedCommissionsByCharacter])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
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
  const getButtonRef = useCallback(
    (characterId: number) => buttonRefs.current[characterId] ?? null,
    [],
  )

  const handleToggle = useCallback(
    (characterId: number) => {
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
    [hasAppliedSearchQuery, toggleCharacterOpen],
  )

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

      <CommissionSearch
        disableDomFiltering
        externalEntries={commissionSearchEntries}
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
              const shouldAutoOpen = hasAppliedSearchQuery && visibleCharacterCommissions.length > 0

              return (
                <SortableCharacterCard
                  key={character.id}
                  item={item}
                  isActive={isActive}
                  commissionList={visibleCharacterCommissions}
                  isOpen={shouldAutoOpen || openIds.has(character.id)}
                  onToggle={() => handleToggle(character.id)}
                  onDeleteCommission={commissionId =>
                    handleDeleteCommission(character.id, commissionId)
                  }
                  charactersForSelect={orderedCharacters}
                  buttonRefFor={buttonRefFor}
                  getButtonRef={getButtonRef}
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
