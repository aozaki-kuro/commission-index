interface SortableDividerProps {
  archivedCount: number
}

export function SortableDivider({
  archivedCount,
}: SortableDividerProps) {
  return (
    <div
      className="relative flex items-center gap-3 py-3"
      data-stale-divider="true"
    >
      <div className="
        flex-1 border-t border-gray-200
        dark:border-gray-600
      "
      />
      <span className="
        shrink-0 text-xs font-medium text-gray-500
        dark:text-gray-400
      "
      >
        Archived (
        {archivedCount}
        )
      </span>
      <div className="
        flex-1 border-t border-gray-200
        dark:border-gray-600
      "
      />
    </div>
  )
}
