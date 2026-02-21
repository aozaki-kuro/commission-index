'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useCallback, useRef } from 'react'

import type { CharacterRow, CommissionRow } from '#lib/admin/db'

import CharacterDeleteDialog from './components/CharacterDeleteDialog'
import SortableCharacterCard from './components/SortableCharacterCard'
import SortableDivider from './components/SortableDivider'
import useCommissionManager, { DIVIDER_ID } from './hooks/useCommissionManager'

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissions: CommissionRow[]
}

const CommissionManager = ({ characters, commissions }: CommissionManagerProps) => {
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
  } = useCommissionManager({ characters, commissions })

  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const dividerIndex = list.findIndex(i => i.type === 'divider')
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
            behavior: 'smooth',
          })
        }
      })
    },
    [toggleCharacterOpen],
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

      <div className="space-y-4">
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
              const characterCommissions = [...(commissionMap.get(character.id) ?? [])].sort(
                (a, b) => b.fileName.localeCompare(a.fileName),
              )

              const isActive = dividerIndex === -1 ? true : index < dividerIndex

              return (
                <SortableCharacterCard
                  key={character.id}
                  item={item}
                  isActive={isActive}
                  commissionList={characterCommissions}
                  isOpen={openIds.has(character.id)}
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
