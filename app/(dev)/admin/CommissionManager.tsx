'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, useCallback, useRef } from 'react'

import type { CharacterRow, CommissionRow } from '#lib/admin/db'

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

      <Transition appear show={Boolean(confirmingCharacter)} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-20"
          onClose={closeConfirmDialog}
          initialFocus={confirmDeleteButtonRef}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm dark:bg-white/5" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-950">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-bold text-gray-900 dark:text-gray-100"
                  >
                    Delete character?
                  </DialogTitle>
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      This will remove the character and all associated commissions. This action
                      cannot be undone.
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">{confirmingCharacter?.name}</span> has{' '}
                      <span className="font-mono">{confirmingCharacter?.commissionCount ?? 0}</span>{' '}
                      entr{(confirmingCharacter?.commissionCount ?? 0) === 1 ? 'y' : 'ies'}.
                    </p>
                  </div>
                  <div className="mt-5 flex justify-end gap-3">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900"
                      onClick={closeConfirmDialog}
                      disabled={isDeletePending}
                    >
                      Cancel
                    </button>
                    <button
                      ref={confirmDeleteButtonRef}
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-70 dark:bg-red-500 dark:hover:bg-red-400 dark:focus-visible:ring-offset-gray-900"
                      onClick={() => {
                        if (confirmingCharacter) performDeleteCharacter(confirmingCharacter)
                      }}
                      disabled={isDeletePending}
                    >
                      Delete
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </section>
  )
}

export default CommissionManager
