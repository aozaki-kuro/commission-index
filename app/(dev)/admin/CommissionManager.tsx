'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Fuse from 'fuse.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import CommissionSearch from '#components/home/search/CommissionSearch'
import type { CharacterRow, CommissionRow, CreatorAliasRow } from '#lib/admin/db'
import { parseCommissionFileName } from '#lib/commissions/index'
import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'
import { buildStrictTermIndex, getMatchedEntryIds, normalizeQuery } from '#lib/search/index'

import CharacterDeleteDialog from './components/CharacterDeleteDialog'
import SortableCharacterCard from './components/SortableCharacterCard'
import SortableDivider from './components/SortableDivider'
import useCommissionManager, { DIVIDER_ID } from './hooks/useCommissionManager'

interface CommissionManagerProps {
  characters: CharacterRow[]
  commissions: CommissionRow[]
  creatorAliases: CreatorAliasRow[]
}

const buildAdminCommissionSearchText = (
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
) => {
  const { date, creator } = parseCommissionFileName(commission.fileName)
  const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
  const keywordTerms = (commission.keyword ?? '')
    .split(/[,\n，、;；]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)
  const normalizedCreatorName = creator ? normalizeCreatorName(creator) : null
  const creatorAliases = normalizedCreatorName
    ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
    : []

  return [
    commission.characterName,
    creator ?? '',
    ...creatorAliases,
    ...searchableDateTerms,
    commission.fileName,
    commission.design ?? '',
    commission.description ?? '',
    keywordTerms.join(' '),
  ]
    .join(' ')
    .toLowerCase()
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
  const [isSearchReady, setIsSearchReady] = useState(false)
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')
  const dividerIndex = list.findIndex(i => i.type === 'divider')
  const normalizedAppliedSearchQuery = normalizeQuery(appliedSearchQuery)
  const hasAppliedSearchQuery = normalizedAppliedSearchQuery.length > 0
  const creatorAliasesMap = useMemo(
    () => new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const)),
    [creatorAliases],
  )

  const commissionSearchEntries = useMemo(
    () =>
      commissions.map(commission => ({
        id: commission.id,
        searchText: buildAdminCommissionSearchText(commission, creatorAliasesMap),
      })),
    [commissions, creatorAliasesMap],
  )
  const commissionSearchIndex = useMemo(
    () => ({
      entries: commissionSearchEntries,
      allIds: new Set(commissionSearchEntries.map(entry => entry.id)),
      strictTermIndex: buildStrictTermIndex(commissionSearchEntries),
      fuse: new Fuse(commissionSearchEntries, {
        keys: ['searchText'],
        threshold: 0.33,
        ignoreLocation: true,
        includeScore: false,
        minMatchCharLength: 1,
        useExtendedSearch: true,
      }),
    }),
    [commissionSearchEntries],
  )
  const matchedCommissionIds = useMemo(
    () =>
      hasAppliedSearchQuery
        ? getMatchedEntryIds(appliedSearchQuery, commissionSearchIndex)
        : commissionSearchIndex.allIds,
    [appliedSearchQuery, commissionSearchIndex, hasAppliedSearchQuery],
  )

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsSearchReady(true)
    })

    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setAppliedSearchQuery(query)
      if (!normalizeQuery(query)) {
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

      {isSearchReady ? (
        <CommissionSearch disableDomFiltering onQueryChange={handleSearchQueryChange} />
      ) : (
        <div className="mb-6 h-12" aria-hidden="true" />
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
              const allCharacterCommissions = [...(commissionMap.get(character.id) ?? [])].sort(
                (a, b) => b.fileName.localeCompare(a.fileName),
              )
              const visibleCharacterCommissions = hasAppliedSearchQuery
                ? allCharacterCommissions.filter(commission =>
                    matchedCommissionIds.has(commission.id),
                  )
                : allCharacterCommissions

              const isActive = dividerIndex === -1 ? true : index < dividerIndex
              const shouldAutoOpen = hasAppliedSearchQuery && visibleCharacterCommissions.length > 0

              return (
                <SortableCharacterCard
                  key={character.id}
                  item={item}
                  isActive={isActive}
                  commissionList={visibleCharacterCommissions}
                  searchIndexCommissionList={allCharacterCommissions}
                  creatorAliasesMap={creatorAliasesMap}
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
