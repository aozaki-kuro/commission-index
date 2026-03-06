import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { saveHomeFeaturedKeywordsAction } from '#admin/actions'
import FormStatusIndicator from '#admin/FormStatusIndicator'
import { INITIAL_FORM_STATE } from '#admin/types'
import { adminSurfaceStyles, formControlStyles } from '#admin/uiStyles'
import { Button } from '#components/ui/button'
import { dedupeKeywords } from '#lib/search/popularKeywords'
import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

interface SuggestionDashboardProps {
  featuredKeywords: string[]
  keywordOptions: string[]
}

const MAX_FEATURED_KEYWORDS = 6

const normalizeKeyword = (value: string) => value.trim().replace(/\s+/g, ' ')
const normalizeKeywordKey = (value: string) => normalizeKeyword(value).toLowerCase()

const SaveButton = () => {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Save featured keywords'}
    </Button>
  )
}

interface SortableKeywordItemProps {
  keyword: string
  onRemove: (keyword: string) => void
}

const SortableKeywordItem = ({ keyword, onRemove }: SortableKeywordItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: keyword,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/50"
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-gray-400 transition hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
        aria-label={`Drag ${keyword}`}
        {...attributes}
        {...listeners}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8h12M6 16h12" />
        </svg>
      </button>

      <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-800 dark:text-gray-200">
        {keyword}
      </span>

      <button
        type="button"
        onClick={() => onRemove(keyword)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-gray-400 transition hover:text-red-500 dark:text-gray-500 dark:hover:text-red-300"
        aria-label={`Remove ${keyword}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M18 6L6 18M6 6l12 12"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  )
}

const SuggestionDashboard = ({ featuredKeywords, keywordOptions }: SuggestionDashboardProps) => {
  const [state, formAction] = useActionState(saveHomeFeaturedKeywordsAction, INITIAL_FORM_STATE)
  const [manualInput, setManualInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedKeywords, setSelectedKeywords] = useState(() =>
    dedupeKeywords(featuredKeywords, MAX_FEATURED_KEYWORDS),
  )
  const normalizedSelectedKeywordKeySet = useMemo(
    () => new Set(selectedKeywords.map(normalizeKeywordKey)),
    [selectedKeywords],
  )

  const availableKeywords = useMemo(() => {
    const filtered = dedupeKeywords(keywordOptions, 240).filter(keyword => {
      if (!searchInput.trim()) return true
      return keyword.toLowerCase().includes(searchInput.trim().toLowerCase())
    })
    return filtered.slice(0, 120)
  }, [keywordOptions, searchInput])

  const keywordsJson = useMemo(() => JSON.stringify(selectedKeywords), [selectedKeywords])
  const canAddMore = selectedKeywords.length < MAX_FEATURED_KEYWORDS
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const addKeyword = (rawKeyword: string) => {
    const keyword = normalizeKeyword(rawKeyword)
    if (!keyword || !canAddMore) return

    const keywordKey = normalizeKeywordKey(keyword)
    if (normalizedSelectedKeywordKeySet.has(keywordKey)) return

    setSelectedKeywords(previous => [...previous, keyword])
  }

  const removeKeyword = (keyword: string) => {
    setSelectedKeywords(previous => previous.filter(item => item !== keyword))
  }

  const toggleKeyword = (keyword: string) => {
    const keywordKey = normalizeKeywordKey(keyword)
    if (normalizedSelectedKeywordKeySet.has(keywordKey)) {
      removeKeyword(keyword)
      return
    }

    addKeyword(keyword)
  }

  const handleManualAdd = () => {
    addKeyword(manualInput)
    setManualInput('')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setSelectedKeywords(previous => {
      const oldIndex = previous.findIndex(keyword => keyword === active.id)
      const newIndex = previous.findIndex(keyword => keyword === over.id)
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  return (
    <form action={formAction} className={adminSurfaceStyles}>
      <input type="hidden" name="keywordsJson" value={keywordsJson} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Featured keywords ({selectedKeywords.length}/{MAX_FEATURED_KEYWORDS})
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Home first batch uses these keywords first, then rotates to random suggestions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            successLabel="Saved"
            errorFallback="Unable to save featured keywords."
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white/70 p-4 dark:border-gray-700/80 dark:bg-gray-900/30">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Selected order
          </p>

          {selectedKeywords.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No featured keywords yet. Add up to six.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={selectedKeywords} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {selectedKeywords.map(keyword => (
                    <SortableKeywordItem key={keyword} keyword={keyword} onRemove={removeKeyword} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white/70 p-4 dark:border-gray-700/80 dark:bg-gray-900/30">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300">
            Add keywords
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={event => setManualInput(event.target.value)}
              className={formControlStyles}
              placeholder="Type keyword and add"
              disabled={!canAddMore}
            />
            <Button type="button" size="sm" onClick={handleManualAdd} disabled={!canAddMore}>
              Add
            </Button>
          </div>

          <input
            type="search"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            className={formControlStyles}
            placeholder="Filter keyword options"
          />

          <div className="max-h-72 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {availableKeywords.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No keyword options available.
                </p>
              ) : (
                availableKeywords.map(keyword => {
                  const isSelected = normalizedSelectedKeywordKeySet.has(
                    normalizeKeywordKey(keyword),
                  )

                  return (
                    <button
                      key={keyword}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleKeyword(keyword)}
                      disabled={!isSelected && !canAddMore}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                        isSelected
                          ? 'border-gray-700 bg-gray-900 text-white dark:border-gray-300 dark:bg-gray-100 dark:text-gray-900'
                          : 'border-gray-300/80 bg-white/80 text-gray-700 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:bg-black/40 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-gray-100'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {keyword}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

export default SuggestionDashboard
