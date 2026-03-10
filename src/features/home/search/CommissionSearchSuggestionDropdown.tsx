import { CommandItem, CommandList } from '#components/ui/command'
import type { SuggestionTokenOperator } from '#lib/search/index'

export type SuggestionViewModel = {
  term: string
  matchCountLabel: string
  sourcesLabel: string
  relatedTerms: string[]
}

export const LOAD_STALE_COMMAND_VALUE = '__load-stale__'

interface CommissionSearchSuggestionDropdownProps {
  hiddenStaleNoticeMessage: string
  loadStaleCharactersLabel: string
  onLoadStaleCharacters: () => void
  onSelectSuggestion: (suggestion: string) => void
  shouldAnimate: boolean
  shouldShow: boolean
  shouldShowHiddenStaleNotice: boolean
  sourcePrefix: string
  suggestionIsExclusion: boolean
  suggestionOperator: SuggestionTokenOperator
  suggestionViewModels: SuggestionViewModel[]
  visibleStatusMessage: string
}

const CommissionSearchSuggestionDropdown = ({
  hiddenStaleNoticeMessage,
  loadStaleCharactersLabel,
  onLoadStaleCharacters,
  onSelectSuggestion,
  shouldAnimate,
  shouldShow,
  shouldShowHiddenStaleNotice,
  sourcePrefix,
  suggestionIsExclusion,
  suggestionOperator,
  suggestionViewModels,
  visibleStatusMessage,
}: CommissionSearchSuggestionDropdownProps) => {
  if (!shouldShow) return null

  return (
    <CommandList
      className={`${shouldAnimate ? 'animate-search-dropdown-in' : ''} absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-300/80 bg-white/95 py-1 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm motion-reduce:animate-none dark:border-gray-700 dark:bg-black/90`}
    >
      {suggestionViewModels.map(suggestion => {
        return (
          <CommandItem
            key={suggestion.term}
            value={suggestion.term}
            onSelect={() => onSelectSuggestion(suggestion.term)}
            className="cursor-pointer px-3 py-1.5 font-mono text-gray-700 data-[selected=true]:bg-gray-900/6 data-[selected=true]:text-gray-900 dark:text-gray-300 dark:data-[selected=true]:bg-white/10 dark:data-[selected=true]:text-white"
          >
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                {suggestionIsExclusion ? (
                  <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    NOT
                  </span>
                ) : suggestionOperator === 'or' ? (
                  <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    OR
                  </span>
                ) : suggestionOperator === 'and' ? (
                  <span className="shrink-0 rounded border border-gray-300/90 bg-gray-100/85 px-1 py-0.5 text-[9px] leading-none tracking-[0.06em] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    AND
                  </span>
                ) : null}
                <span className="flex min-w-0 items-baseline gap-1 truncate">
                  <span className="truncate">{suggestion.term}</span>
                  {suggestion.relatedTerms.length > 0 ? (
                    <span className="truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                      ({suggestion.relatedTerms.join(' / ')})
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="col-start-2 row-span-2 self-center text-right text-[11px] leading-4 text-gray-500 tabular-nums dark:text-gray-400">
                {suggestion.matchCountLabel}
              </span>
              <span className="truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {sourcePrefix} {suggestion.sourcesLabel}
              </span>
            </div>
          </CommandItem>
        )
      })}

      {shouldShowHiddenStaleNotice ? (
        <div className="mt-1 border-t border-gray-200/80 pt-1 dark:border-gray-700/80">
          <CommandItem
            value={LOAD_STALE_COMMAND_VALUE}
            onSelect={onLoadStaleCharacters}
            className="items-start gap-3 px-3 py-2 font-mono text-gray-700 data-[selected=true]:bg-gray-900/6 data-[selected=true]:text-gray-900 dark:text-gray-300 dark:data-[selected=true]:bg-white/10 dark:data-[selected=true]:text-white"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-4 break-words whitespace-normal">
                {hiddenStaleNoticeMessage}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {visibleStatusMessage}
              </p>
            </div>
            <span className="shrink-0 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
              {loadStaleCharactersLabel}
            </span>
          </CommandItem>
        </div>
      ) : null}
    </CommandList>
  )
}

export default CommissionSearchSuggestionDropdown
