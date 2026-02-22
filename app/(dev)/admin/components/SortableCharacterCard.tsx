'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Transition, TransitionChild } from '@headlessui/react'
import { type KeyboardEvent, type MouseEvent } from 'react'

import type { CharacterRow, CommissionRow } from '#lib/admin/db'
import { parseCommissionFileName } from '#lib/commissions/index'
import { normalizeCreatorName } from '#lib/creatorAliases/shared'
import { buildDateSearchTokensFromCompactDate } from '#lib/date/search'

import CommissionEditForm from '../CommissionEditForm'
import type { CharacterItem } from '../hooks/useCommissionManager'

const inlineEditStyles =
  'flex-1 min-w-0 text-base font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none px-0 py-0'

const normalizeSuggestionKey = (term: string) => term.trim().toLowerCase()

const buildCommissionSearchMetadata = (
  characterName: string,
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
) => {
  const { date, year, creator } = parseCommissionFileName(commission.fileName)
  const month = date.slice(4, 6)
  const searchableDateTerms = [date, ...buildDateSearchTokensFromCompactDate(date)]
  const normalizedCreatorName = creator ? normalizeCreatorName(creator) : null
  const creatorAliases = normalizedCreatorName
    ? (creatorAliasesMap.get(normalizedCreatorName) ?? [])
    : []
  const keywordTerms = (commission.keyword ?? '')
    .split(/[,\n，、;；]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)
  const keywordSearchText = keywordTerms.join(' ')

  const suggestionEntries = [
    { source: 'Character', term: characterName },
    ...(year && month ? [{ source: 'Date', term: `${year}/${month}` }] : []),
    ...(creator ? [{ source: 'Creator', term: creator }] : []),
    ...creatorAliases.map(alias => ({ source: 'Creator' as const, term: alias })),
    ...keywordTerms.map(keyword => ({ source: 'Keyword' as const, term: keyword })),
  ]

  const uniqueSuggestions = new Map<string, { source: string; term: string }>()
  for (const entry of suggestionEntries) {
    const normalizedTerm = normalizeSuggestionKey(entry.term)
    if (!normalizedTerm || uniqueSuggestions.has(normalizedTerm)) continue
    uniqueSuggestions.set(normalizedTerm, entry)
  }

  const searchSuggestionText = [...uniqueSuggestions.values()]
    .map(entry => `${entry.source}\t${entry.term}`)
    .join('\n')

  const searchText = [
    characterName,
    creator ?? '',
    ...creatorAliases,
    ...searchableDateTerms,
    commission.fileName,
    commission.design ?? '',
    commission.description ?? '',
    keywordSearchText,
  ]
    .join(' ')
    .toLowerCase()

  return { searchText, searchSuggestionText }
}

interface SortableCharacterCardProps {
  item: CharacterItem
  isActive: boolean
  commissionList: CommissionRow[]
  searchIndexCommissionList?: CommissionRow[]
  creatorAliasesMap: Map<string, string[]>
  isOpen: boolean
  onToggle: () => void
  onDeleteCommission: (commissionId: number) => void
  charactersForSelect: CharacterRow[]
  buttonRefFor: (id: number) => (el: HTMLButtonElement | null) => void
  getButtonRef: (id: number) => HTMLButtonElement | null
  isEditing: boolean
  editingValue: string
  onStartEdit: () => void
  onRenameChange: (value: string) => void
  onCancelEdit: () => void
  onSubmitRename: () => void
  onRequestDelete: () => void
  isDeleting: boolean
  disableDrag?: boolean
}

const SortableCharacterCard = ({
  item,
  isActive,
  commissionList,
  searchIndexCommissionList,
  creatorAliasesMap,
  isOpen,
  onToggle,
  onDeleteCommission,
  charactersForSelect,
  buttonRefFor,
  getButtonRef,
  isEditing,
  editingValue,
  onStartEdit,
  onRenameChange,
  onCancelEdit,
  onSubmitRename,
  onRequestDelete,
  isDeleting,
  disableDrag = false,
}: SortableCharacterCardProps) => {
  const character = item.data
  const sectionId = `admin-character-${character.id}`
  const searchSourceCommissions = searchIndexCommissionList ?? commissionList
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: character.id,
    disabled: disableDrag || isDeleting,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  const triggerDisclosureToggle = () => {
    onToggle()
  }

  const handleHeaderClick = (event: MouseEvent<HTMLDivElement>) => {
    const disclosureButton = getButtonRef(character.id)
    if (!disclosureButton) return
    if (disclosureButton.contains(event.target as Node)) return
    triggerDisclosureToggle()
  }

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      triggerDisclosureToggle()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={sectionId}
      data-character-section="true"
      data-character-status={isActive ? 'active' : 'stale'}
      data-total-commissions={commissionList.length}
    >
      <div className="hidden" aria-hidden="true">
        {searchSourceCommissions.map(commission => {
          const { searchText, searchSuggestionText } = buildCommissionSearchMetadata(
            character.name,
            commission,
            creatorAliasesMap,
          )

          return (
            <div
              key={`search-entry-${commission.id}`}
              data-commission-entry="true"
              data-character-section-id={sectionId}
              data-search-text={searchText}
              data-search-suggest={searchSuggestionText}
            />
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-sm ring-1 ring-gray-900/5 transition dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10">
        <div
          className="flex items-center gap-3 bg-white/90 px-5 py-3 dark:bg-gray-900/40"
          role="button"
          tabIndex={0}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
        >
          <button
            type="button"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${
              disableDrag || isDeleting
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-grab hover:text-gray-600 active:cursor-grabbing dark:hover:text-gray-200'
            }`}
            {...attributes}
            {...listeners}
            onClick={event => event.stopPropagation()}
            aria-label={
              disableDrag
                ? `Drag disabled while search is applied for ${character.name}`
                : `Drag ${character.name}`
            }
            disabled={isDeleting || disableDrag}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8h16M4 16h16"
              />
            </svg>
          </button>

          {isEditing ? (
            <div className="flex flex-1 items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-blue-500/90' : 'bg-gray-400/80'}`}
              />
              <input
                type="text"
                autoFocus
                value={editingValue}
                onChange={event => onRenameChange(event.target.value)}
                onBlur={onSubmitRename}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onSubmitRename()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelEdit()
                  }
                }}
                className={inlineEditStyles}
                disabled={isDeleting}
                onClick={event => event.stopPropagation()}
              />
              <span className="w-24 text-right font-mono text-xs font-normal text-gray-500 dark:text-gray-300">
                {commissionList.length} entries
              </span>
            </div>
          ) : (
            <>
              <button
                ref={buttonRefFor(character.id)}
                type="button"
                onClick={(event: MouseEvent) => {
                  event.preventDefault()
                  onToggle()
                }}
                className="flex flex-1 items-center justify-between gap-3 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                aria-expanded={isOpen}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-blue-500/90' : 'bg-gray-400/80'}`}
                  />
                  <span className="truncate text-base font-semibold text-gray-800 dark:text-gray-100">
                    {character.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={event => {
                      event.stopPropagation()
                      event.preventDefault()
                      onStartEdit()
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        onStartEdit()
                      }
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-gray-400 dark:hover:text-gray-200 dark:focus-visible:ring-offset-gray-900"
                    aria-label={`Rename ${character.name}`}
                    aria-disabled={isDeleting}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </span>
                </div>

                <span className="w-24 text-right font-mono text-xs font-normal text-gray-500 dark:text-gray-300">
                  {commissionList.length} entries
                </span>
              </button>

              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:hover:text-red-300 dark:focus-visible:ring-red-300 dark:focus-visible:ring-offset-gray-900 dark:disabled:text-gray-600"
                onClick={event => {
                  event.stopPropagation()
                  onRequestDelete()
                }}
                disabled={isDeleting}
                aria-label={`Remove ${character.name}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        <Transition
          show={isOpen}
          unmount
          as="div"
          className="grid"
          enter="transition-[grid-template-rows] duration-200 ease-in-out"
          enterFrom="grid-rows-[0fr]"
          enterTo="grid-rows-[1fr]"
          leave="transition-[grid-template-rows] duration-200 ease-in-out"
          leaveFrom="grid-rows-[1fr]"
          leaveTo="grid-rows-[0fr]"
        >
          <div className="overflow-hidden">
            <TransitionChild
              as="div"
              enter="transition-all duration-200 ease-out"
              enterFrom="-translate-y-1 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="transition-all duration-150 ease-in"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="-translate-y-1 opacity-0"
              className="space-y-4 border-t border-gray-200 bg-white/85 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/30"
            >
              {commissionList.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  No commissions recorded yet.
                </p>
              ) : (
                commissionList.map(commission => (
                  <CommissionEditForm
                    key={commission.id}
                    commission={commission}
                    characters={charactersForSelect}
                    onDelete={() => onDeleteCommission(commission.id)}
                  />
                ))
              )}
            </TransitionChild>
          </div>
        </Transition>
      </div>
    </div>
  )
}

export default SortableCharacterCard
