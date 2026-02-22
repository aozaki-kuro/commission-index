'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { saveCreatorAliasesBatchAction } from '#admin/actions'
import { hasCjkCharacter } from '#lib/creatorAliases/shared'
import type { CreatorAliasRow } from '#lib/admin/db'
import AdminSectionNav from '../AdminSectionNav'
import FormStatusIndicator from '../FormStatusIndicator'
import { INITIAL_FORM_STATE } from '../types'
import { adminSurfaceStyles, formControlStyles } from '../uiStyles'

interface AliasesDashboardProps {
  creators: CreatorAliasRow[]
}

const buildInitialDrafts = (creators: CreatorAliasRow[]) =>
  Object.fromEntries(creators.map(row => [row.creatorName, row.aliases[0] ?? ''])) as Record<
    string,
    string
  >

const AliasesSaveButton = () => {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus-visible:ring-offset-gray-900"
    >
      {pending ? 'Saving...' : 'Save aliases'}
    </button>
  )
}

const AliasesDashboard = ({ creators }: AliasesDashboardProps) => {
  const [state, formAction] = useActionState(saveCreatorAliasesBatchAction, INITIAL_FORM_STATE)
  const [drafts, setDrafts] = useState<Record<string, string>>(() => buildInitialDrafts(creators))
  const visibleCreators = useMemo(
    () => creators.filter(row => hasCjkCharacter(row.creatorName)),
    [creators],
  )

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

      <AdminSectionNav current="aliases" />

      <form action={formAction} className={adminSurfaceStyles}>
        <input type="hidden" name="rowsJson" value={rowsPayload} />

        <div className="mb-4 flex justify-end">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <FormStatusIndicator
              status={state.status}
              message={state.message}
              successLabel="Saved"
              errorFallback="Unable to save aliases."
            />
            <AliasesSaveButton />
          </div>
        </div>

        <div className="mb-4 hidden grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] gap-4 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid dark:text-gray-300">
          <div>Creator</div>
          <div>Alias</div>
        </div>

        {visibleCreators.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No creators available for alias editing.
          </p>
        ) : (
          <div className="space-y-0">
            {visibleCreators.map(row => (
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
