import { Button } from '#components/ui/button'
import type { CSSProperties, Ref } from 'react'

interface PopularKeywordsRowProps {
  keywords: string[]
  refreshLabel?: string
  rowRef?: Ref<HTMLDivElement>
  style?: CSSProperties
  onRotate?: () => void
  onKeywordPointerDown?: () => void
  onKeywordSelect?: (keyword: string) => void
}

const PopularKeywordsRow = ({
  keywords,
  refreshLabel = '',
  rowRef,
  style,
  onRotate,
  onKeywordPointerDown,
  onKeywordSelect,
}: PopularKeywordsRowProps) => {
  if (keywords.length === 0) return null

  return (
    <div
      ref={rowRef}
      className="mt-2 flex w-full items-center gap-1.5 overflow-hidden text-xs text-gray-500 dark:text-gray-400"
      style={style}
    >
      {onRotate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 rounded-full border border-gray-300/70 text-gray-500 transition-transform duration-200 hover:rotate-90 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label={refreshLabel || 'Refresh keywords'}
          onClick={() => onRotate()}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
            <path
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 0 1-15.4 6.4M3 12a9 9 0 0 1 15.4-6.4M3 4v5h5M16 15h5v5"
            />
          </svg>
        </Button>
      ) : null}
      <ul className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pr-0.5">
        {keywords.map(keyword => (
          <li key={keyword} className="shrink-0">
            <button
              type="button"
              className="rounded-full border border-gray-300/80 bg-white/75 px-2.5 py-1 font-mono text-[11px] tracking-[0.01em] text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-700 dark:bg-black/40 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-gray-100"
              onPointerDown={() => onKeywordPointerDown?.()}
              onClick={() => onKeywordSelect?.(keyword)}
            >
              {keyword}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default PopularKeywordsRow
