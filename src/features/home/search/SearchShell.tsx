import { Button } from '#components/ui/button'
import { Skeleton } from '#components/ui/skeleton'
import PopularKeywordsRow from '#features/home/search/PopularKeywordsRow'
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

interface SearchShellProps {
  query: string
  onQueryChange: (value: string) => void
  sectionClassName?: string
  searchLabel: string
  searchPlaceholder: string
  searchHelpLabel: string
  refreshPopularSearchLabel?: string
  popularKeywords?: string[]
  loadingLabel?: string | null
  helpDisabled?: boolean
  helpButtonClassName?: string
  onPrewarm?: () => void
  onActivate?: (focusOnMount?: boolean, openHelpOnMount?: boolean) => void
  onHelpPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onHelpClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onRotatePopularKeywords?: () => void
  onPopularKeywordSelect?: (keyword: string) => void
  reservePopularKeywordsSpace?: boolean
  showLoadingPanel?: boolean
}

type LoadingPanelMetrics = {
  rowHeight: number
  titleHeight: number
  detailHeight: number
}
const DEFAULT_POPULAR_KEYWORDS_ROW_HEIGHT = 32

const hasSameMetrics = (a: LoadingPanelMetrics | null, b: LoadingPanelMetrics) =>
  a?.rowHeight === b.rowHeight &&
  a?.titleHeight === b.titleHeight &&
  a?.detailHeight === b.detailHeight

const SearchShell = ({
  query,
  onQueryChange,
  sectionClassName = 'mt-8 mb-6',
  searchLabel,
  searchPlaceholder,
  searchHelpLabel,
  refreshPopularSearchLabel = '',
  popularKeywords = [],
  loadingLabel = null,
  helpDisabled = false,
  helpButtonClassName,
  onPrewarm,
  onActivate,
  onHelpPointerDown,
  onHelpClick,
  onRotatePopularKeywords,
  onPopularKeywordSelect,
  reservePopularKeywordsSpace = false,
  showLoadingPanel = false,
}: SearchShellProps) => {
  const probeRowRef = useRef<HTMLDivElement | null>(null)
  const probeTitleRef = useRef<HTMLSpanElement | null>(null)
  const probeDetailRef = useRef<HTMLSpanElement | null>(null)
  const popularKeywordsRowRef = useRef<HTMLDivElement | null>(null)
  const hasSettledMetricsRef = useRef(false)
  const [loadingPanelMetrics, setLoadingPanelMetrics] = useState<LoadingPanelMetrics | null>(null)
  const [popularKeywordsRowHeight, setPopularKeywordsRowHeight] = useState<number | null>(null)
  const hasPopularKeywords = popularKeywords.length > 0
  const shouldShowPopularKeywords = !reservePopularKeywordsSpace && hasPopularKeywords
  const shouldReservePopularKeywordsSpace =
    reservePopularKeywordsSpace || (showLoadingPanel && !hasPopularKeywords)
  const shouldShowPopularKeywordsSkeleton = shouldReservePopularKeywordsSpace && !hasPopularKeywords

  useEffect(() => {
    if (!showLoadingPanel) return

    if (hasSettledMetricsRef.current) return

    const probeRow = probeRowRef.current
    const probeTitle = probeTitleRef.current
    const probeDetail = probeDetailRef.current
    if (!probeRow || !probeTitle || !probeDetail) return

    const measure = () => {
      const nextMetrics = {
        rowHeight: Math.ceil(probeRow.getBoundingClientRect().height),
        titleHeight: Math.ceil(probeTitle.getBoundingClientRect().height),
        detailHeight: Math.ceil(probeDetail.getBoundingClientRect().height),
      }

      setLoadingPanelMetrics(previous =>
        hasSameMetrics(previous, nextMetrics) ? previous : nextMetrics,
      )
    }

    let rafId = 0
    let isDisposed = false
    const scheduleMeasure = (onMeasured?: () => void) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        measure()
        onMeasured?.()
      })
    }

    const markMetricsSettled = () => {
      hasSettledMetricsRef.current = true
    }
    const fonts = 'fonts' in document ? document.fonts : null
    if (!fonts || fonts.status === 'loaded') {
      scheduleMeasure(markMetricsSettled)
    } else {
      scheduleMeasure()
      void fonts.ready.then(() => {
        if (isDisposed) return
        scheduleMeasure(markMetricsSettled)
      })
    }

    return () => {
      isDisposed = true
      cancelAnimationFrame(rafId)
    }
  }, [showLoadingPanel])

  useEffect(() => {
    if (!shouldShowPopularKeywords) return

    const row = popularKeywordsRowRef.current
    if (!row) return

    const rafId = requestAnimationFrame(() => {
      const nextHeight = Math.ceil(row.getBoundingClientRect().height)
      if (!nextHeight) return
      setPopularKeywordsRowHeight(previous => (previous === nextHeight ? previous : nextHeight))
    })

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [popularKeywords, shouldShowPopularKeywords])

  const rowStyle: CSSProperties | undefined = loadingPanelMetrics
    ? { minHeight: `${loadingPanelMetrics.rowHeight}px` }
    : undefined
  const titleStyle: CSSProperties | undefined = loadingPanelMetrics
    ? { height: `${loadingPanelMetrics.titleHeight}px` }
    : undefined
  const detailStyle: CSSProperties | undefined = loadingPanelMetrics
    ? { height: `${loadingPanelMetrics.detailHeight}px` }
    : undefined
  const resolvedPopularKeywordsRowHeight = Math.max(
    popularKeywordsRowHeight ?? DEFAULT_POPULAR_KEYWORDS_ROW_HEIGHT,
    DEFAULT_POPULAR_KEYWORDS_ROW_HEIGHT,
  )
  const popularKeywordsRowStyle: CSSProperties | undefined = hasPopularKeywords
    ? { minHeight: `${resolvedPopularKeywordsRowHeight}px` }
    : undefined
  const popularKeywordsSkeletonStyle: CSSProperties | undefined = shouldShowPopularKeywordsSkeleton
    ? { minHeight: `${resolvedPopularKeywordsRowHeight}px` }
    : undefined

  return (
    <section id="commission-search" className={sectionClassName}>
      <div className="flex h-12 items-center justify-end">
        <div className="relative h-11 w-full overflow-visible border-b border-gray-300/80 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-300">
          <svg
            viewBox="0 0 24 24"
            className="absolute top-1/2 left-2.5 h-3.5 w-3.5 shrink-0 -translate-y-1/2 opacity-70"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
            <circle cx="11" cy="11" r="6" strokeWidth="2" />
          </svg>

          <div className="absolute inset-y-0 right-2 left-8 flex items-center gap-2">
            <label htmlFor="commission-search-input" className="sr-only">
              {searchLabel}
            </label>

            <input
              id="commission-search-input"
              type="search"
              value={query}
              onFocus={() => onPrewarm?.()}
              onPointerDown={() => {
                onPrewarm?.()
              }}
              onChange={event => {
                onQueryChange(event.target.value)
                onActivate?.(true)
              }}
              placeholder={searchPlaceholder}
              autoComplete="off"
              aria-label={searchLabel}
              className="w-full origin-[left_center] transform-[scale(0.8)] bg-transparent pr-24 font-mono text-[16px] tracking-[0.01em] outline-none placeholder:text-gray-400"
            />
            {loadingLabel ? (
              <span className="absolute right-9 text-xs text-gray-400 dark:text-gray-500">
                {loadingLabel}
              </span>
            ) : null}

            <Button
              type="button"
              onPointerDown={event => {
                if (helpDisabled) return
                if (onHelpPointerDown) {
                  onHelpPointerDown(event)
                  return
                }
                event.preventDefault()
                onActivate?.(false, true)
              }}
              onClick={event => {
                if (helpDisabled) return
                if (onHelpClick) {
                  onHelpClick(event)
                  return
                }
                if (event.detail !== 0) return
                onActivate?.(false, true)
              }}
              variant="ghost"
              size="icon"
              className={
                helpButtonClassName ??
                'absolute right-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300'
              }
              aria-label={searchHelpLabel}
              disabled={helpDisabled}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.6 9.2a2.6 2.6 0 1 1 4.8 1.4c-.6.8-1.4 1.2-2 1.8-.4.4-.6.9-.6 1.6"
                />
                <circle cx="12" cy="17.3" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </Button>
          </div>

          {showLoadingPanel ? (
            <div
              aria-hidden="true"
              data-search-loading-panel="true"
              data-testid="search-loading-panel"
              className="animate-search-dropdown-in pointer-events-none absolute top-[calc(100%+0.5rem)] right-2 left-8 z-20 rounded-lg border border-gray-300/80 bg-white/95 py-1 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm motion-reduce:animate-none dark:border-gray-700 dark:bg-black/90"
            >
              <span className="sr-only">{loadingLabel ?? '...'}</span>
              <div className="pointer-events-none absolute -z-10 px-4 py-2 opacity-0">
                <div ref={probeRowRef} className="rounded-sm px-3 py-1.5 font-mono text-sm">
                  <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
                    <span ref={probeTitleRef} className="truncate">
                      probe
                    </span>
                    <span className="col-start-2 row-span-2 self-center text-right text-[11px] leading-4 tabular-nums">
                      000
                    </span>
                    <span ref={probeDetailRef} className="truncate text-[11px] leading-4">
                      source
                    </span>
                  </div>
                </div>
              </div>
              <ul className="space-y-0.5 px-1">
                {(['w-[72%]', 'w-[58%]', 'w-[80%]'] as const).map((titleWidth, index) => (
                  <li
                    key={`search-loading-row-${index}`}
                    className="rounded-sm px-3 py-1.5"
                    style={rowStyle}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
                      <Skeleton
                        className={`${loadingPanelMetrics ? '' : 'h-3'} ${titleWidth} rounded-sm`}
                        style={titleStyle}
                      />
                      <Skeleton
                        className={`${loadingPanelMetrics ? '' : 'h-2.5'} w-8 rounded-sm`}
                        style={detailStyle}
                      />
                      <Skeleton
                        className={`${loadingPanelMetrics ? '' : 'h-2.5'} w-24 rounded-sm`}
                        style={detailStyle}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {shouldShowPopularKeywords ? (
        <PopularKeywordsRow
          keywords={popularKeywords}
          refreshLabel={refreshPopularSearchLabel}
          rowRef={popularKeywordsRowRef}
          style={popularKeywordsRowStyle}
          onRotate={onRotatePopularKeywords}
          onKeywordPointerDown={onPrewarm}
          onKeywordSelect={onPopularKeywordSelect}
        />
      ) : shouldShowPopularKeywordsSkeleton ? (
        <div
          aria-hidden="true"
          data-testid="search-popular-keywords-skeleton"
          className="mt-2 flex w-full items-center gap-1.5 overflow-hidden text-xs text-gray-500 dark:text-gray-400"
          style={popularKeywordsSkeletonStyle}
        >
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <ul className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pr-0.5">
            {(['w-12', 'w-14', 'w-16', 'w-12', 'w-[3.75rem]', 'w-[3.25rem]'] as const).map(
              (widthClass, index) => (
                <li key={`popular-keyword-skeleton-${index}`} className="shrink-0">
                  <Skeleton className={`h-6 ${widthClass} rounded-full`} />
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export default SearchShell
