import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconGripHorizontal, IconPencil, IconX } from '@tabler/icons-react'
import { Button } from '#components/ui/button'
import { Skeleton } from '#components/ui/skeleton'
import { Suspense, lazy, type KeyboardEvent, type MouseEvent } from 'react'

import type { CharacterRow, CommissionRow } from '#lib/admin/db'

import type { CharacterItem } from '../hooks/useCommissionManager'

const CommissionEditForm = lazy(() => import('../CommissionEditForm'))

const CommissionEditFormSkeleton = () => (
  <div className="space-y-4 rounded-xl border border-gray-200/80 bg-white/80 p-4 dark:border-gray-700/80 dark:bg-gray-900/30">
    <Skeleton className="aspect-1280/525 w-full rounded-xl" />
    <div className="grid gap-3 md:grid-cols-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
    <Skeleton className="h-24 w-full" />
  </div>
)

const inlineEditStyles =
  'flex-1 min-w-0 text-base font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none px-0 py-0'

interface SortableCharacterCardProps {
  item: CharacterItem
  isActive: boolean
  totalCommissions: number
  commissionList: CommissionRow[]
  isCommissionsLoaded: boolean
  isCommissionsLoading: boolean
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
  reduceMotion?: boolean
}

const SortableCharacterCard = ({
  item,
  isActive,
  totalCommissions,
  commissionList,
  isCommissionsLoaded,
  isCommissionsLoading,
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
  reduceMotion = false,
}: SortableCharacterCardProps) => {
  const character = item.data
  const sectionId = `admin-character-${character.id}`
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
      data-total-commissions={totalCommissions}
    >
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-sm ring-1 ring-gray-900/5 transition dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10">
        <div
          className="flex items-center gap-3 bg-white/90 px-5 py-3 dark:bg-gray-900/40"
          role="button"
          tabIndex={0}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
            <IconGripHorizontal className="h-5 w-5" stroke={2} aria-hidden="true" />
          </Button>

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
                {totalCommissions} entries
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
                    <IconPencil className="h-4 w-4" stroke={2} aria-hidden="true" />
                  </span>
                </div>

                <span className="w-24 text-right font-mono text-xs font-normal text-gray-500 dark:text-gray-300">
                  {totalCommissions} entries
                </span>
              </button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:hover:text-red-300 dark:focus-visible:ring-red-300 dark:focus-visible:ring-offset-gray-900 dark:disabled:text-gray-600"
                onClick={event => {
                  event.stopPropagation()
                  onRequestDelete()
                }}
                disabled={isDeleting}
                aria-label={`Remove ${character.name}`}
              >
                <IconX className="h-4 w-4" stroke={2} aria-hidden="true" />
              </Button>
            </>
          )}
        </div>

        <div
          className={`grid ${reduceMotion ? '' : 'transition-[grid-template-rows] duration-200 ease-in-out'} ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div
              className={`space-y-4 border-t border-gray-200 bg-white/85 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/30 ${
                reduceMotion ? '' : 'transition-all duration-200 ease-out'
              } ${isOpen ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}
              aria-hidden={!isOpen}
            >
              {isOpen ? (
                isCommissionsLoading || !isCommissionsLoaded ? (
                  <div className="space-y-4">
                    <CommissionEditFormSkeleton />
                    <p className="text-sm text-gray-500 dark:text-gray-300">Loading commissions…</p>
                  </div>
                ) : commissionList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-300">
                    No commissions recorded yet.
                  </p>
                ) : (
                  commissionList.map(commission => (
                    <Suspense key={commission.id} fallback={<CommissionEditFormSkeleton />}>
                      <CommissionEditForm
                        commission={commission}
                        characters={charactersForSelect}
                        onDelete={() => onDeleteCommission(commission.id)}
                      />
                    </Suspense>
                  ))
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SortableCharacterCard
