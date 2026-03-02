'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortableDividerProps {
  activeCount: number
  disabled?: boolean
  dividerId: string
}

const SortableDivider = ({ activeCount, disabled = true, dividerId }: SortableDividerProps) => {
  const { setNodeRef, transform, transition } = useSortable({
    id: dividerId,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex items-center gap-3 py-4"
      data-stale-divider="true"
    >
      <div className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
      <span className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
        Active ({activeCount}) / Stale
      </span>
      <div className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
    </div>
  )
}

export default SortableDivider
