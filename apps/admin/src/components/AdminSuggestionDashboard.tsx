import type { DragHandleProps } from '../hooks/useNativeDragReorder'
import { IconArrowDown, IconArrowUp, IconGripHorizontal, IconX } from '@tabler/icons-react'
import { useActionState, useCallback, useMemo, useState } from 'react'
import { adminSurfaceStyles, formControlStyles } from '../app/ui'
import { arrayMove, useNativeDragReorder } from '../hooks/useNativeDragReorder'
import { saveHomeFeaturedKeywordsAction } from '../lib/adminActions'
import { writeCachedAdminJson } from '../lib/adminApi'
import { INITIAL_FORM_STATE } from '../lib/formState'
import { dedupeKeywords, normalizeKeyword, normalizeKeywordKey } from '../lib/keywords'
import { markPendingRebuild } from '../lib/pendingRebuildSignal'
import { DropIndicator } from './DropIndicator'
import { FormStatusIndicator } from './FormStatusIndicator'
import { SubmitButton } from './SubmitButton'

interface AdminSuggestionDashboardProps {
  featuredKeywords: string[]
  keywordOptions: string[]
  isReady?: boolean
  isLoading?: boolean
}

const MAX_FEATURED_KEYWORDS = 6
const labelStyles = 'block pl-1 text-sm font-semibold text-gray-900 dark:text-gray-100'
const iconButtonStyles = 'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'

interface KeywordItemProps {
  dragHandleProps: DragHandleProps
  isDragging: boolean
  keyword: string
  index: number
  count: number
  onRemove: (keyword: string) => void
  onReorder: (from: number, to: number) => void
}

function KeywordItem({ dragHandleProps, isDragging, keyword, index, count, onRemove, onReorder }: KeywordItemProps) {
  return (
    <div className={`flex min-w-0 items-center gap-1 py-1 ${isDragging ? 'opacity-55' : ''}`}>
      <span aria-hidden="true" className="w-6 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">{String(index + 1).padStart(2, '0')}</span>
      <button type="button" className={`${iconButtonStyles} cursor-grab active:cursor-grabbing max-sm:hidden`} aria-label={`Drag ${keyword}`} {...dragHandleProps}>
        <IconGripHorizontal className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200" title={keyword}>{keyword}</span>
      <button type="button" className={iconButtonStyles} disabled={index === 0} aria-label={`Move ${keyword} up`} onClick={() => onReorder(index, index - 1)}>
        <IconArrowUp className="size-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconButtonStyles} disabled={index === count - 1} aria-label={`Move ${keyword} down`} onClick={() => onReorder(index, index + 1)}>
        <IconArrowDown className="size-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconButtonStyles} aria-label={`Remove ${keyword}`} onClick={() => onRemove(keyword)}>
        <IconX className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function AdminSuggestionDashboard({ featuredKeywords, keywordOptions, isReady = true, isLoading = false }: AdminSuggestionDashboardProps) {
  const [selection, setSelection] = useState(() => ({ source: featuredKeywords, values: dedupeKeywords(featuredKeywords, MAX_FEATURED_KEYWORDS), dirty: false }))
  const [state, formAction, isPending] = useActionState(async (previous: typeof INITIAL_FORM_STATE, formData: FormData) => {
    const submittedKeywords = JSON.parse(formData.get('keywordsJson') as string) as string[]
    const result = await saveHomeFeaturedKeywordsAction(previous, formData)
    if (result.status === 'success') {
      writeCachedAdminJson('/api/admin/suggestion', {
        featuredKeywords: submittedKeywords,
        keywordOptions,
      })
      setSelection(current => current.values.length === submittedKeywords.length
        && current.values.every((keyword, index) => keyword === submittedKeywords[index])
        ? { ...current, dirty: false }
        : current)
      markPendingRebuild()
    }
    return result
  }, INITIAL_FORM_STATE)
  const [manualInput, setManualInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  // 冷启动与静默刷新只同步未编辑的配置，远端结果不能覆盖本地草稿。
  if (selection.source !== featuredKeywords) {
    setSelection(previous => ({
      source: featuredKeywords,
      values: previous.dirty ? previous.values : dedupeKeywords(featuredKeywords, MAX_FEATURED_KEYWORDS),
      dirty: previous.dirty,
    }))
  }
  const selectedKeywords = selection.values
  const selectedKeySet = useMemo(() => new Set(selectedKeywords.map(normalizeKeywordKey)), [selectedKeywords])
  const filteredOptions = useMemo(() => {
    const query = normalizeKeywordKey(searchInput)
    return dedupeKeywords(keywordOptions).filter(keyword => normalizeKeywordKey(keyword).includes(query))
  }, [keywordOptions, searchInput])
  const canAddMore = selectedKeywords.length < MAX_FEATURED_KEYWORDS
  const normalizedManualInput = normalizeKeyword(manualInput)
  const canAddManual = canAddMore && !!normalizedManualInput && !selectedKeySet.has(normalizeKeywordKey(normalizedManualInput))
  const disabled = !isReady || isPending
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setSelection(previous => ({ ...previous, dirty: true, values: arrayMove(previous.values, fromIndex, toIndex) }))
  }, [])
  const { containerProps, dragHandleProps, dragItemAttr, draggingIndex, dropIndicatorIndex } = useNativeDragReorder({ itemCount: selectedKeywords.length, onReorder: handleReorder, disabled })
  const addKeyword = (raw: string) => {
    const keyword = normalizeKeyword(raw)
    setSelection((previous) => {
      if (!keyword || previous.values.length >= MAX_FEATURED_KEYWORDS || previous.values.some(item => normalizeKeywordKey(item) === normalizeKeywordKey(keyword)))
        return previous
      return { ...previous, dirty: true, values: [...previous.values, keyword] }
    })
  }
  const removeKeyword = (keyword: string) => {
    setSelection(previous => ({ ...previous, dirty: true, values: previous.values.filter(item => normalizeKeywordKey(item) !== normalizeKeywordKey(keyword)) }))
  }
  const addManual = () => {
    if (!canAddManual)
      return
    addKeyword(manualInput)
    setManualInput('')
  }

  return (
    <form action={formAction} className={`${adminSurfaceStyles} min-w-0 motion-safe:animate-[tabFade_300ms_cubic-bezier(0.25,1,0.5,1)_both]`}>
      <input type="hidden" name="keywordsJson" value={JSON.stringify(selectedKeywords)} />
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200/80 pb-5 dark:border-gray-700/80">
        <p className="max-w-xl text-sm text-gray-600 dark:text-gray-300">Choose up to six keywords to help visitors explore the home page.</p>
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{isReady ? `${selectedKeywords.length} / ${MAX_FEATURED_KEYWORDS} selected` : '— / 6 selected'}</span>
      </header>
      <fieldset disabled={disabled} aria-busy={!isReady && isLoading} className="min-w-0 space-y-6">
        <div className="grid min-w-0 gap-8 @min-[48rem]/workspace:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 space-y-3" aria-labelledby="suggestion-order-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="suggestion-order-title" className={labelStyles}>Display order</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">First to last</span>
            </div>
            <div className="h-80 overflow-y-auto border-y border-gray-200/80 dark:border-gray-700/80">
              {!isReady
                ? <p className="p-3 text-sm text-gray-500 dark:text-gray-400">{isLoading ? 'Loading featured keywords…' : 'Featured keywords are unavailable.'}</p>
                : selectedKeywords.length === 0
                  ? <p className="p-3 text-sm text-gray-500 dark:text-gray-400">No featured keywords. Choose from the keyword pool or add your own below.</p>
                  : (
                      <div role="list" aria-label="Featured keyword order" className="divide-y divide-gray-200/70 dark:divide-gray-700/70" {...containerProps}>
                        {selectedKeywords.map((keyword, index) => (
                          <div key={keyword} role="listitem" className="relative" {...dragItemAttr(index)}>
                            {dropIndicatorIndex === index && <DropIndicator offsetClass="-top-1.5" />}
                            <KeywordItem keyword={keyword} index={index} count={selectedKeywords.length} onRemove={removeKeyword} onReorder={handleReorder} dragHandleProps={dragHandleProps(index)} isDragging={draggingIndex === index} />
                          </div>
                        ))}
                        {dropIndicatorIndex === selectedKeywords.length && <DropIndicator offsetClass="-top-1.5" />}
                      </div>
                    )}
            </div>
            <p className="pl-1 text-xs text-gray-500 dark:text-gray-400">Drag to reorder, or use the arrow buttons.</p>
          </section>
          <section className="min-w-0 space-y-3 @min-[48rem]/workspace:border-l @min-[48rem]/workspace:border-gray-200/80 @min-[48rem]/workspace:pl-8 @min-[48rem]/workspace:dark:border-gray-700/80" aria-labelledby="suggestion-pool-title">
            <h3 id="suggestion-pool-title" className={labelStyles}>Keyword pool</h3>
            <div className="flex min-w-0 flex-col gap-4">
              <input
                type="search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    event.preventDefault()
                }}
                className={`${formControlStyles} min-w-0 shrink-0`}
                placeholder="Search keywords"
                aria-label="Search keywords"
              />
              <div className="h-40 overflow-y-auto pr-1">
                {!isReady
                  ? <p className="text-sm text-gray-500 dark:text-gray-400">{isLoading ? 'Loading keywords…' : 'Keywords are unavailable.'}</p>
                  : filteredOptions.length === 0
                    ? <p className="text-sm text-gray-500 dark:text-gray-400">{searchInput ? 'No matching keywords.' : 'No keywords yet. Add one below.'}</p>
                    : (
                        <div className="flex flex-wrap gap-2">
                          {filteredOptions.map((keyword) => {
                            const isSelected = selectedKeySet.has(normalizeKeywordKey(keyword))
                            return (
                              <button key={keyword} type="button" aria-pressed={isSelected} onClick={() => isSelected ? removeKeyword(keyword) : addKeyword(keyword)} disabled={!isSelected && !canAddMore} className={`max-w-full rounded-md border px-3 py-2 text-left text-sm break-words transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 ${isSelected ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900' : 'border-gray-200 bg-transparent text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100'}`}>{keyword}</button>
                            )
                          })}
                        </div>
                      )}
              </div>
            </div>
            <p className="pl-1 text-xs text-gray-500 dark:text-gray-400">Select to add; select again to remove.</p>
            <div className="space-y-2 border-t border-gray-200/80 pt-5 dark:border-gray-700/80">
              <label htmlFor="suggestion-manual" className={labelStyles}>Add a keyword</label>
              <div className="flex min-w-0 gap-3">
                <input
                  id="suggestion-manual"
                  type="text"
                  value={manualInput}
                  onChange={event => setManualInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addManual()
                    }
                  }}
                  className={`${formControlStyles} min-w-0 flex-1`}
                  placeholder="Enter a keyword"
                />
                <button type="button" onClick={addManual} disabled={!canAddManual} className="h-11 shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-medium transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800">Add</button>
              </div>
            </div>
          </section>
        </div>
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200/80 pt-5 dark:border-gray-700/80">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200" aria-live="polite">{selection.dirty ? 'Unsaved changes' : 'Saved selection'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Save, then publish to update the home page.</p>
        </div>
        <SubmitButton disabled={!isReady}>Save suggestions</SubmitButton>
      </footer>
      <FormStatusIndicator status={state.status} message={state.message} successLabel="Suggestions saved" errorFallback="Unable to save featured keywords." />
    </form>
  )
}
