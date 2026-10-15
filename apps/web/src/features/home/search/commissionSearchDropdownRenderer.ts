import type { SuggestionTokenOperator } from '@lib/search/index'

import { LOAD_ARCHIVED_COMMAND_VALUE } from './commissionSearchConstants'

export interface SuggestionViewModel {
  term: string
  matchCountLabel: string
  sourcesLabel: string
  relatedTerms: string[]
}

interface RenderDropdownOptions {
  container: HTMLElement
  suggestionViewModels: SuggestionViewModel[]
  suggestionIsExclusion: boolean
  suggestionOperator: SuggestionTokenOperator
  sourcePrefix: string
  shouldShowHiddenArchivedNotice: boolean
  hiddenArchivedNoticeMessage: string
  visibleStatusMessage: string
  loadArchivedCharactersLabel: string
  onSelectSuggestion: (term: string) => void
  onLoadArchivedCharacters: () => void
}

// ==================== 操作符 badge 文本解析 ====================
// 根据排除标志和操作符类型决定显示的 badge，返回 null 表示不显示

function resolveOperatorBadge(
  isExclusion: boolean,
  operator: SuggestionTokenOperator,
): string | null {
  if (isExclusion)
    return 'NOT'
  if (operator === 'or')
    return 'OR'
  if (operator === 'and')
    return 'AND'
  return null
}

const BADGE_CLASS = [
  'shrink-0 rounded-sm border border-gray-300/90',
  'bg-gray-100/85 px-1 py-0.5 font-mono text-[10px] leading-none',
  'tracking-[0.06em] text-gray-600',
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300',
].join(' ')

// cmdk CommandItem base classes merged with per-item overrides
const SUGGESTION_ITEM_CLASS = [
  // CommandItem base
  'relative flex items-center rounded-sm px-2 py-1.5',
  'text-sm outline-none select-none',
  'data-[disabled=true]:pointer-events-none',
  'data-[disabled=true]:opacity-50',
  // suggestion-specific overrides
  'px-3 py-1.5 text-gray-700',
  'data-[selected=true]:bg-gray-900/6',
  'data-[selected=true]:text-gray-900',
  'dark:text-gray-300',
  'dark:data-[selected=true]:bg-white/10',
  'dark:data-[selected=true]:text-white',
].join(' ')

const ARCHIVED_ITEM_CLASS = [
  // CommandItem base
  'relative flex items-center rounded-sm px-2 py-1.5',
  'text-sm outline-none select-none',
  'data-[disabled=true]:pointer-events-none',
  'data-[disabled=true]:opacity-50',
  // archived-specific overrides
  'items-start gap-3 px-3 py-2 text-gray-700',
  'data-[selected=true]:bg-gray-900/6',
  'data-[selected=true]:text-gray-900',
  'dark:text-gray-300',
  'dark:data-[selected=true]:bg-white/10',
  'dark:data-[selected=true]:text-white',
].join(' ')

function createSuggestionItem(
  vm: SuggestionViewModel,
  index: number,
  badgeText: string | null,
  sourcePrefix: string,
  onSelect: (term: string) => void,
): HTMLDivElement {
  const item = document.createElement('div')
  item.role = 'option'
  item.id = `search-suggestion-${index}`
  item.dataset.value = vm.term
  item.dataset.selected = 'false'
  item.className = SUGGESTION_ITEM_CLASS
  item.addEventListener('click', () => onSelect(vm.term))

  // grid container
  const grid = document.createElement('div')
  grid.className = 'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5'

  // row 1 left: operator badge + term + related terms
  const termRow = document.createElement('span')
  termRow.className = 'flex min-w-0 items-center gap-1.5'

  if (badgeText) {
    const badge = document.createElement('span')
    badge.className = BADGE_CLASS
    badge.textContent = badgeText
    termRow.appendChild(badge)
  }

  const termGroup = document.createElement('span')
  termGroup.className = 'flex min-w-0 items-baseline gap-1 truncate'

  const termSpan = document.createElement('span')
  termSpan.className = 'truncate'
  termSpan.textContent = vm.term
  termGroup.appendChild(termSpan)

  if (vm.relatedTerms.length > 0) {
    const related = document.createElement('span')
    related.className = 'truncate text-[11px]/4 text-gray-500 dark:text-gray-400'
    related.textContent = `(${vm.relatedTerms.join(' / ')})`
    termGroup.appendChild(related)
  }

  termRow.appendChild(termGroup)
  grid.appendChild(termRow)

  // row 1-2 right: match count
  const countSpan = document.createElement('span')
  countSpan.className = 'col-start-2 row-span-2 self-center text-right text-[11px]/4 text-gray-500 tabular-nums dark:text-gray-400'
  countSpan.textContent = vm.matchCountLabel
  grid.appendChild(countSpan)

  // row 2 left: source label
  const sourceSpan = document.createElement('span')
  sourceSpan.className = 'truncate text-[11px]/4 text-gray-500 dark:text-gray-400'
  sourceSpan.textContent = `${sourcePrefix} ${vm.sourcesLabel}`
  grid.appendChild(sourceSpan)

  item.appendChild(grid)
  return item
}

function createArchivedNoticeItem(
  index: number,
  message: string,
  statusMessage: string,
  label: string,
  onLoad: () => void,
): HTMLDivElement {
  // outer divider wrapper
  const wrapper = document.createElement('div')
  wrapper.className = 'mt-1 border-t border-gray-200/80 pt-1 dark:border-gray-700/80'

  const item = document.createElement('div')
  item.role = 'option'
  item.id = `search-suggestion-${index}`
  item.dataset.value = LOAD_ARCHIVED_COMMAND_VALUE
  item.dataset.selected = 'false'
  item.className = ARCHIVED_ITEM_CLASS
  item.addEventListener('click', () => onLoad())

  // left content
  const content = document.createElement('div')
  content.className = 'min-w-0 flex-1'

  const msgP = document.createElement('p')
  msgP.className = 'text-[12px]/4 wrap-break-word whitespace-normal'
  msgP.textContent = message

  const statusP = document.createElement('p')
  statusP.className = 'mt-0.5 text-[11px]/4 text-gray-500 dark:text-gray-400'
  statusP.textContent = statusMessage

  content.appendChild(msgP)
  content.appendChild(statusP)
  item.appendChild(content)

  // right label
  const labelSpan = document.createElement('span')
  labelSpan.className = 'shrink-0 text-[11px]/4 text-gray-500 dark:text-gray-400'
  labelSpan.textContent = label
  item.appendChild(labelSpan)

  wrapper.appendChild(item)
  return wrapper
}

export function renderDropdown(options: RenderDropdownOptions): void {
  const { container } = options
  container.textContent = ''

  const badgeText = resolveOperatorBadge(
    options.suggestionIsExclusion,
    options.suggestionOperator,
  )

  options.suggestionViewModels.forEach((vm, i) => {
    container.appendChild(
      createSuggestionItem(vm, i, badgeText, options.sourcePrefix, options.onSelectSuggestion),
    )
  })

  if (options.shouldShowHiddenArchivedNotice) {
    container.appendChild(
      createArchivedNoticeItem(
        options.suggestionViewModels.length,
        options.hiddenArchivedNoticeMessage,
        options.visibleStatusMessage,
        options.loadArchivedCharactersLabel,
        options.onLoadArchivedCharacters,
      ),
    )
  }
}

export function getDropdownItemCount(container: HTMLElement): number {
  return container.querySelectorAll('[role="option"]').length
}
