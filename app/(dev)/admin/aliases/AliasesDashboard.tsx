'use client'

import Link from 'next/link'
import { useActionState, useDeferredValue, useMemo, useState } from 'react'

import { saveCreatorAliasesBatchAction } from '#admin/actions'
import type { CreatorAliasRow } from '#lib/admin/db'
import FormStatusIndicator from '../FormStatusIndicator'
import SubmitButton from '../SubmitButton'
import { INITIAL_FORM_STATE } from '../types'
import { adminSurfaceStyles, formControlStyles } from '../uiStyles'

interface AliasesDashboardProps {
  creators: CreatorAliasRow[]
}

const cjkCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

const buildInitialDrafts = (creators: CreatorAliasRow[]) =>
  Object.fromEntries(creators.map(row => [row.creatorName, row.aliases[0] ?? ''])) as Record<
    string,
    string
  >

const AliasesDashboard = ({ creators }: AliasesDashboardProps) => {
  const [state, formAction] = useActionState(saveCreatorAliasesBatchAction, INITIAL_FORM_STATE)
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>(() => buildInitialDrafts(creators))
  const deferredQuery = useDeferredValue(query)
  const visibleCreators = useMemo(
    () => creators.filter(row => cjkCharacterPattern.test(row.creatorName)),
    [creators],
  )

  const filteredCreators = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) return visibleCreators

    return visibleCreators.filter(row => {
      if (row.creatorName.toLowerCase().includes(needle)) return true
      const alias = (drafts[row.creatorName] ?? row.aliases[0] ?? '').toLowerCase()
      return alias.includes(needle)
    })
  }, [deferredQuery, drafts, visibleCreators])

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        visibleCreators.map(row => ({
          creatorName: row.creatorName,
          alias: (drafts[row.creatorName] ?? '').trim(),
        })),
      ),
    [drafts, visibleCreators],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 pb-10 lg:px-0">
      <header className="space-y-2">
        <h1 className="text-2xl leading-tight font-semibold text-gray-900 dark:text-gray-100">
          Creator Aliases
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Manage searchable romanized aliases for creators extracted from commission file names.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-gray-600 dark:text-gray-300">
          {filteredCreators.length} / {visibleCreators.length} creators
        </div>
        <div className="flex justify-end gap-4">
          <Link href="/admin">Admin</Link>
          <Link href="/">Home</Link>
        </div>
      </div>

      <section className={adminSurfaceStyles}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1">
            <label
              htmlFor="creator-alias-filter"
              className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-300"
            >
              Filter
            </label>
            <input
              id="creator-alias-filter"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search creator or alias"
              className={formControlStyles}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Creator aliases are matched as creator search terms.
          </p>
        </div>
      </section>

      <form action={formAction} className={adminSurfaceStyles}>
        <input type="hidden" name="rowsJson" value={rowsPayload} />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
          <FormStatusIndicator
            status={state.status}
            message={state.message}
            successLabel="Saved"
            errorFallback="Unable to save aliases."
          />
        </div>

        <div className="mb-4 hidden grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] gap-4 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:text-gray-300">
          <div>Creator</div>
          <div>Alias</div>
        </div>

        {filteredCreators.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No creators matched your filter.
          </p>
        ) : (
          <div className="space-y-0">
            {filteredCreators.map(row => (
              <div
                key={row.creatorName}
                className="grid gap-4 border-t border-gray-200/80 py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-center dark:border-gray-700/80"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {row.creatorName}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {row.commissionCount} commission{row.commissionCount === 1 ? '' : 's'}
                  </p>
                </div>

                <input
                  type="text"
                  value={drafts[row.creatorName] ?? ''}
                  onChange={event =>
                    setDrafts(prev => ({
                      ...prev,
                      [row.creatorName]: event.target.value,
                    }))
                  }
                  className={formControlStyles}
                />
              </div>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}

export default AliasesDashboard
