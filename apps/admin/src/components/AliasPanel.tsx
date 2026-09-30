import type { FormState } from '../lib/formState'
import { useActionState, useId, useRef, useState } from 'react'
import { adminSurfaceStyles, formControlStyles } from '../app/ui'
import { notifyDataUpdate } from '../lib/dataUpdateSignal'
import { INITIAL_FORM_STATE } from '../lib/formState'
import { markPendingRebuild } from '../lib/pendingRebuildSignal'
import { FormStatusIndicator } from './FormStatusIndicator'
import { SaveButton } from './SaveButton'

export interface AliasRow {
  key: string
  count: number
  initialValue: string
}

interface AliasPanelProps {
  rows: AliasRow[]
  formAction: (state: FormState, data: FormData) => FormState | Promise<FormState>
  title: string
  description: string
  saveLabel: string
  errorFallback: string
  emptyMessage: string
  columnHeader: string
  placeholder?: string
  buildPayload: (rows: AliasRow[], drafts: Record<string, string>) => string
  isLoading?: boolean
  isUnavailable?: boolean
  onSaved?: () => void
}

const aliasGridTemplate = 'md:grid-cols-[minmax(10rem,18rem)_minmax(0,1fr)]'

export function AliasPanel({
  rows,
  formAction,
  title,
  description,
  saveLabel,
  errorFallback,
  emptyMessage,
  columnHeader,
  placeholder,
  buildPayload,
  isLoading = false,
  isUnavailable = false,
  onSaved,
}: AliasPanelProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<{ rows: AliasRow[], values: Record<string, string> }>({ rows, values: {} })
  const latestRowsRef = useRef(rows)
  latestRowsRef.current = rows
  const baseline = Object.fromEntries(rows.map(row => [row.key, saved.rows === rows && Object.hasOwn(saved.values, row.key) ? saved.values[row.key] : row.initialValue]))
  const values = { ...baseline, ...drafts }
  const changedRows = rows.filter(row => values[row.key] !== baseline[row.key])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleRows = rows.filter(row => `${row.key} ${baseline[row.key]}`.toLocaleLowerCase().includes(normalizedQuery))
  const [state, action, pending] = useActionState(async (previous: FormState, data: FormData) => {
    if (changedRows.length === 0)
      return previous
    // 批量接口逐行 upsert；只提交已编辑行，空字符串仍表示显式删除。
    const submitted = Object.fromEntries(changedRows.map(row => [row.key, values[row.key]]))
    let result: FormState
    try {
      result = await formAction(previous, data)
    }
    catch (error) {
      return { status: 'error' as const, message: error instanceof Error ? error.message : errorFallback }
    }
    if (result.status === 'success') {
      setSaved(current => ({ rows: latestRowsRef.current, values: { ...(current.rows === latestRowsRef.current ? current.values : {}), ...submitted } }))
      setDrafts((current) => {
        const next = { ...current }
        for (const [key, value] of Object.entries(submitted)) {
          if (next[key] === value)
            delete next[key]
        }
        return next
      })
      notifyDataUpdate()
      markPendingRebuild()
      onSaved?.()
    }
    return result
  }, INITIAL_FORM_STATE)

  return (
    <form action={action} className={`${adminSurfaceStyles} min-w-0`} aria-busy={isLoading || pending}>
      <input type="hidden" name="rowsJson" value={buildPayload(changedRows, values)} />
      <header>
        <h2 className="sr-only">{title}</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">{description}</p>
      </header>
      <div className="space-y-2">
        <label htmlFor={`${id}-filter`} className="sr-only">
          {`Filter ${title.toLowerCase()}`}
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input id={`${id}-filter`} type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={isLoading || isUnavailable} placeholder={`Search ${columnHeader.toLowerCase()} or alias`} className={`${formControlStyles} min-w-0 md:max-w-md`} />
          <span className="pl-1 font-mono text-xs text-gray-500 dark:text-gray-400" aria-live="polite">{isLoading || isUnavailable ? '— entries' : `${visibleRows.length} of ${rows.length} entries`}</span>
        </div>
        <p className="pl-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Separate aliases with commas. Clear a field to remove its aliases.</p>
      </div>
      <div className="admin-glass sticky top-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 shadow-sm dark:border-gray-700">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200" aria-live="polite">{changedRows.length > 0 ? `${changedRows.length} unsaved ${changedRows.length === 1 ? 'change' : 'changes'}` : 'No unsaved changes'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Only changed rows in this section are saved.</p>
        </div>
        <fieldset disabled={pending || isLoading || isUnavailable || changedRows.length === 0} className="min-w-0">
          <SaveButton label={saveLabel} />
        </fieldset>
      </div>
      <div>
        <div className={`hidden gap-6 border-y border-gray-200 py-3 text-xs font-medium text-gray-500 md:grid dark:border-gray-700 dark:text-gray-400 ${aliasGridTemplate}`}>
          <span className="pl-1">{columnHeader}</span>
          <span className="pl-1">Aliases</span>
        </div>
        {isLoading
          ? <div aria-hidden="true" className="space-y-4 py-4">{[0, 1, 2].map(index => <div key={index} className="h-16 rounded-lg bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" />)}</div>
          : isUnavailable
            ? <p className="py-4 pl-1 text-sm text-gray-500 dark:text-gray-400">Alias data is unavailable. Use the retry notice to load it.</p>
            : visibleRows.length === 0
              ? <p className="py-4 pl-1 text-sm text-gray-500 dark:text-gray-400">{rows.length === 0 ? emptyMessage : 'No aliases match this filter.'}</p>
              : visibleRows.map((row) => {
                  const inputId = `${id}-${encodeURIComponent(row.key)}`
                  return (
                    <div key={row.key} className={`grid min-w-0 scroll-mt-48 gap-2 border-b border-gray-200/80 py-3 last:border-0 md:scroll-mt-28 md:items-center md:gap-6 dark:border-gray-700/80 ${aliasGridTemplate}`}>
                      <div className="min-w-0 space-y-1 pl-1">
                        <label htmlFor={inputId} className="block text-sm font-medium break-words text-gray-900 dark:text-gray-100">
                          {row.key}
                          <span className="sr-only"> aliases</span>
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {row.count}
                          {' '}
                          {row.count === 1 ? 'commission' : 'commissions'}
                        </p>
                      </div>
                      <div className="relative min-w-0">
                        <input id={inputId} type="text" value={values[row.key]} disabled={pending} onChange={event => setDrafts(current => ({ ...current, [row.key]: event.target.value }))} className={`${formControlStyles} min-w-0 scroll-mt-48 pr-8 md:scroll-mt-28`} placeholder={placeholder} />
                        {values[row.key] !== baseline[row.key] && <span className="pointer-events-none absolute top-1/2 right-3 size-1.5 -translate-y-1/2 rounded-full bg-amber-600 dark:bg-amber-400" title="Unsaved change"><span className="sr-only">Unsaved change</span></span>}
                      </div>
                    </div>
                  )
                })}
      </div>
      <FormStatusIndicator status={state.status} message={state.message} successLabel={`${title} saved`} errorFallback={errorFallback} />
    </form>
  )
}
