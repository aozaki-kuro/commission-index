import type {
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import type { KeyboardEvent } from 'react'
import type { DragHandleProps } from '../../hooks/useNativeDragReorder'
import { IconArrowDown, IconArrowUp, IconChevronRight, IconDeviceFloppy, IconGripHorizontal, IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { CommissionThumbnailGrid, CommissionThumbnailGridSkeleton } from './CommissionThumbnailGrid'

const inlineEditStyles
  = 'h-11 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-base font-medium text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100'

const characterHeaderStyles = 'grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 px-2 py-2 @min-[16rem]/thumbnails:flex sm:gap-2 sm:px-3'
const characterIdentityStyles = 'col-span-2 flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3'

export function CharacterCardSkeleton() {
  return (
    <div data-character-skeleton="true" className="@container/thumbnails rounded-xl border border-gray-200 bg-gray-100 motion-safe:animate-pulse dark:border-gray-800 dark:bg-gray-900/50">
      <div className={characterHeaderStyles}>
        <span className="hidden size-11 shrink-0 sm:block" />
        <div className={characterIdentityStyles}>
          <span className="min-h-11 w-full min-w-0 flex-1" />
        </div>
        <span className="h-4 w-5 shrink-0" />
        <div className="flex shrink-0 gap-0.5">
          <span className="size-11" />
          <span className="size-11" />
        </div>
      </div>
    </div>
  )
}

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
  const statusId = `${sectionId}-status`
  const statusLabel = isActive ? 'Active' : 'Archived'

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
        @container/thumbnails overflow-hidden rounded-xl border border-gray-200 bg-white transition
        dark:border-gray-800 dark:bg-gray-900
      "
      >
        <div className={characterHeaderStyles}>
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
              hidden sm:inline-flex size-11 shrink-0 items-center justify-center rounded-lg
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

          {/* 输入框和展开按钮互斥，避免交互控件嵌套。 */}
          <div className={characterIdentityStyles}>
            {isEditing
              ? (
                  <div className="w-full min-w-0 flex-1">
                    <input
                      type="text"
                      aria-label={`Name for ${character.name}`}
                      aria-describedby={statusId}
                      autoFocus
                      value={editingValue}
                      disabled={isDeleting}
                      onChange={event => onRenameChange(event.target.value)}
                      onBlur={(event) => {
                        if (!event.relatedTarget?.hasAttribute('data-rename-action'))
                          onSubmitRename()
                      }}
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
                  </div>
                )
              : (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-describedby={statusId}
                    onClick={onToggle}
                    className="
              flex min-h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-lg text-left
              focus-visible:ring-2 focus-visible:ring-gray-400
              focus-visible:ring-offset-2
              focus-visible:ring-offset-white focus-visible:outline-none
              dark:focus-visible:ring-offset-gray-900
            "
                  >
                    <IconChevronRight aria-hidden="true" stroke={1.8} className={`size-4 shrink-0 text-gray-500 motion-safe:transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {/* 状态圆点：绿=active、灰=archived，仅作视觉标记；无障碍语义由下方 statusId 文本提供 */}
                    <span
                      data-character-status-dot="true"
                      role="img"
                      aria-label={statusLabel}
                      title={statusLabel}
                      className={`size-2.5 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    />
                    <span className="
                    truncate text-sm font-medium text-gray-800
                    dark:text-gray-100
                  "
                    >
                      {character.name}
                    </span>
                  </button>
                )}
            <span
              id={statusId}
              data-character-status-label="true"
              className="sr-only"
            >
              {statusLabel}
            </span>
          </div>

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
              data-rename-action={isEditing ? 'save' : undefined}
              onPointerDown={(event) => {
                if (isEditing)
                  event.preventDefault()
              }}
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
                inline-flex size-11 shrink-0 items-center justify-center
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
              data-rename-action={isEditing ? 'cancel' : undefined}
              onPointerDown={(event) => {
                if (isEditing)
                  event.preventDefault()
              }}
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
                inline-flex size-11 shrink-0 items-center justify-center
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
                border-t border-gray-100 px-3
                sm:px-5
                dark:border-gray-800
                motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out
                ${isOpen ? 'translate-y-0 opacity-100' : 'motion-safe:-translate-y-1 opacity-0'}
              `}
            >
              {/* 展开读取时保留完整网格几何。 */}
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

              {/* 已加载内容在后台刷新时保持挂载；折叠时由网格跳过图片请求。 */}
              {isCommissionsLoaded
                ? (
                    <div className="py-4">
                      <CommissionThumbnailGrid
                        commissions={commissionList}
                        selectedCommissionId={selectedCommissionId}
                        onSelect={onSelectCommission}
                        isExpanded={isOpen}
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
