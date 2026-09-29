import type {
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import type { KeyboardEvent } from 'react'
import type { DragHandleProps } from '../../hooks/useNativeDragReorder'
import { IconArrowDown, IconArrowUp, IconDeviceFloppy, IconGripHorizontal, IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { CommissionThumbnailGrid, CommissionThumbnailGridSkeleton } from './CommissionThumbnailGrid'

const inlineEditStyles
  = 'flex-1 min-w-0 bg-transparent px-0 py-0 text-base font-semibold text-gray-900 outline-none dark:text-gray-100'

interface SortableCharacterCardProps {
  character: CharacterRow
  commissionList: CommissionRow[]
  disableDrag?: boolean
  dragHandleProps: DragHandleProps
  editingValue: string
  isActive: boolean
  isCommissionsLoaded: boolean
  isCommissionsLoading: boolean
  commissionLoadError?: string | null
  isDeleting: boolean
  isDragging: boolean
  isEditing: boolean
  isReorderMode?: boolean
  isOpen: boolean
  onCancelEdit: () => void
  onMoveDown?: () => void
  onMoveUp?: () => void
  onRenameChange: (value: string) => void
  onRequestDelete: () => void
  onRetryLoad?: () => void
  onSelectCommission: (commission: CommissionRow) => void
  onStartEdit: () => void
  onSubmitRename: () => void
  onToggle: () => void
  selectedCommissionId: number | null
  totalCommissions: number
}

export function SortableCharacterCard({
  character,
  commissionList,
  disableDrag = false,
  dragHandleProps,
  editingValue,
  isActive,
  isCommissionsLoaded,
  isCommissionsLoading,
  commissionLoadError = null,
  isDeleting,
  isDragging,
  isEditing,
  isOpen,
  isReorderMode = false,
  onCancelEdit,
  onMoveDown,
  onMoveUp,
  onRenameChange,
  onRequestDelete,
  onRetryLoad,
  onSelectCommission,
  onStartEdit,
  onSubmitRename,
  onToggle,
  selectedCommissionId,
  totalCommissions,
}: SortableCharacterCardProps) {
  const sectionId = `admin-character-${character.id}`
  const panelId = `${sectionId}-panel`

  return (
    <div
      id={sectionId}
      data-character-id={character.id}
      data-character-section="true"
      data-character-status={isActive ? 'active' : 'archived'}
      data-total-commissions={totalCommissions}
      className={isDragging ? 'opacity-55' : ''}
    >
      <div className="
        overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-sm
        ring-1 ring-gray-900/5 transition
        dark:border-gray-700 dark:bg-gray-900/40 dark:ring-white/10
      "
      >
        <div
          role={isEditing ? undefined : 'button'}
          tabIndex={isEditing ? undefined : -1}
          onClick={isEditing
            ? undefined
            : (event) => {
                event.preventDefault()
                onToggle()
              }}
          className={`
            flex items-center gap-2 bg-white/90 px-3 py-2.5
            sm:gap-3 sm:px-5 sm:py-3
            dark:bg-gray-900/40
            ${isEditing ? '' : 'cursor-pointer'}
          `}
        >
          {/* 桌面端拖拽手柄 — 移动端始终隐藏 */}
          <button
            type="button"
            {...dragHandleProps}
            disabled={isDeleting || disableDrag}
            onClick={event => event.stopPropagation()}
            aria-label={disableDrag
              ? `Drag disabled while search is applied for ${character.name}`
              : `Drag ${character.name}`}
            className={`
              hidden sm:inline-flex size-8 shrink-0 items-center justify-center rounded-lg
              border border-transparent text-gray-400 transition
              focus-visible:ring-2 focus-visible:ring-gray-400
              focus-visible:ring-offset-2 focus-visible:ring-offset-white
              focus-visible:outline-none
              dark:focus-visible:ring-offset-gray-900
              ${disableDrag || isDeleting
      ? 'cursor-not-allowed opacity-50'
      : `
        cursor-grab
        hover:text-gray-600
        active:cursor-grabbing
        dark:hover:text-gray-200
      `}
            `}
          >
            <IconGripHorizontal className="size-5" stroke={2} aria-hidden="true" />
          </button>

          {/* 名字/输入区域 — 统一结构，编辑时原地替换内容 */}
          <button
            type="button"
            aria-expanded={isEditing ? undefined : isOpen}
            aria-controls={isEditing ? undefined : panelId}
            tabIndex={isEditing ? -1 : undefined}
            className="
              flex flex-1 items-center gap-3 rounded-lg text-left
              focus-visible:ring-2 focus-visible:ring-gray-400
              focus-visible:ring-offset-2
              focus-visible:ring-offset-white focus-visible:outline-none
              dark:focus-visible:ring-offset-gray-900
            "
          >
            <span
              aria-hidden="true"
              className={isActive
                ? 'size-2.5 shrink-0 rounded-full bg-blue-500/90'
                : 'size-2.5 shrink-0 rounded-full bg-gray-400/80'}
            />
            {isEditing
              ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingValue}
                    disabled={isDeleting}
                    onChange={event => onRenameChange(event.target.value)}
                    onBlur={onSubmitRename}
                    onClick={event => event.stopPropagation()}
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
                  />
                )
              : (
                  <span className="
                    truncate text-base font-semibold text-gray-800
                    dark:text-gray-100
                  "
                  >
                    {character.name}
                  </span>
                )}
          </button>

          <span className="
            shrink-0 text-right font-mono text-xs font-normal text-gray-500
            dark:text-gray-300
          "
          >
            {totalCommissions}
            <span className="
              hidden
              sm:inline
            "
            >
              {' '}
              entries
            </span>
          </span>

          {/* 操作按钮 — 位置尺寸固定，编辑/reorder 模式时原地替换图标和功能 */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (isReorderMode) {
                  onMoveUp?.()
                }
                else if (isEditing) {
                  onSubmitRename()
                }
                else {
                  onStartEdit()
                }
              }}
              disabled={isReorderMode ? !onMoveUp : isDeleting}
              aria-label={isReorderMode
                ? `Move ${character.name} up`
                : isEditing ? `Save name for ${character.name}` : `Rename ${character.name}`}
              className={`
                inline-flex size-7 shrink-0 items-center justify-center
                rounded-lg border border-transparent text-gray-400
                transition
                hover:text-gray-600
                focus-visible:ring-2 focus-visible:ring-gray-400
                focus-visible:ring-offset-2
                focus-visible:ring-offset-white
                focus-visible:outline-none
                disabled:cursor-not-allowed disabled:text-gray-300
                dark:hover:text-gray-200
                dark:focus-visible:ring-offset-gray-900
                dark:disabled:text-gray-600
              `}
            >
              {isReorderMode
                ? <IconArrowUp className="size-4" stroke={2} aria-hidden="true" />
                : isEditing
                  ? <IconDeviceFloppy className="size-4" stroke={2} aria-hidden="true" />
                  : <IconPencil className="size-4" stroke={2} aria-hidden="true" />}
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (isReorderMode) {
                  onMoveDown?.()
                }
                else if (isEditing) {
                  onCancelEdit()
                }
                else {
                  onRequestDelete()
                }
              }}
              disabled={isReorderMode ? !onMoveDown : isDeleting}
              aria-label={isReorderMode
                ? `Move ${character.name} down`
                : isEditing ? `Cancel renaming ${character.name}` : `Remove ${character.name}`}
              className={`
                inline-flex size-8 shrink-0 items-center justify-center
                rounded-lg border border-transparent text-gray-400
                transition
                focus-visible:ring-2 focus-visible:ring-offset-2
                focus-visible:ring-offset-white focus-visible:outline-none
                disabled:cursor-not-allowed disabled:text-gray-300
                dark:focus-visible:ring-offset-gray-900
                dark:disabled:text-gray-600
                ${isReorderMode
      ? `hover:text-gray-600 focus-visible:ring-gray-400
         dark:hover:text-gray-200`
      : isEditing
        ? `hover:text-gray-600 focus-visible:ring-gray-400
           dark:hover:text-gray-200`
        : `hover:text-red-500 focus-visible:ring-red-400
           dark:hover:text-red-300`}
              `}
            >
              {isReorderMode
                ? <IconArrowDown className="size-4" stroke={2} aria-hidden="true" />
                : isEditing
                  ? <IconX className="size-4" stroke={2} aria-hidden="true" />
                  : <IconTrash className="size-4" stroke={2} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div
          id={panelId}
          aria-busy={isCommissionsLoading}
          inert={!isOpen}
          className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div
              aria-hidden={!isOpen}
              className={`
                border-t border-gray-200 bg-white/85 px-3
                sm:px-5
                dark:border-gray-700 dark:bg-gray-900/30
                motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out
                ${isOpen ? 'translate-y-0 opacity-100' : 'motion-safe:-translate-y-1 opacity-0'}
              `}
            >
              {/* Show skeleton only while the card is open and loading */}
              {isOpen && commissionLoadError && !isCommissionsLoaded
                ? (
                    <div role="alert" className="flex min-h-24 flex-wrap items-center justify-between gap-3 py-4 text-sm text-red-600 dark:text-red-400">
                      <span className="min-w-0 break-words">
                        Could not load commissions:
                        {commissionLoadError}
                      </span>
                      <button type="button" onClick={onRetryLoad} className="shrink-0 font-medium underline underline-offset-2">Try again</button>
                    </div>
                  )
                : null}
              {isOpen && !commissionLoadError && !isCommissionsLoaded
                ? (
                    <div className="py-4">
                      <CommissionThumbnailGridSkeleton count={totalCommissions} />
                    </div>
                  )
                : null}

              {/* Thumbnail grid once loaded */}
              {isCommissionsLoaded
                ? (
                    <div className="py-4">
                      <CommissionThumbnailGrid
                        commissions={commissionList}
                        selectedCommissionId={selectedCommissionId}
                        onSelect={onSelectCommission}
                      />
                    </div>
                  )
                : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
