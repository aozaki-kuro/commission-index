import { Button } from '#components/ui/button'
import { IconRefresh } from '@tabler/icons-react'
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
      className="mt-2 flex min-h-8 w-full items-center gap-2 overflow-hidden text-xs text-gray-500 dark:text-gray-400"
      style={style}
    >
      <ul className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto pr-0.5">
        {keywords.map((keyword, index) => (
          <li key={keyword} className={`shrink-0 ${index >= 4 ? 'hidden lg:block' : ''}`}>
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
      {onRotate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full border border-gray-200/80 bg-white/70 text-gray-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[color,border-color,background-color,box-shadow] duration-200 hover:border-gray-400 hover:bg-white hover:text-gray-900 hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-black/35 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-black/55 dark:hover:text-gray-100 dark:hover:shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
          aria-label={refreshLabel || 'Refresh keywords'}
          onClick={() => onRotate()}
        >
          <IconRefresh className="h-4 w-4" stroke={1.85} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

export default PopularKeywordsRow
