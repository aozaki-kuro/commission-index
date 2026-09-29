import type { AdminCommissionSearchRow } from '@commission-index/domain'
import * as Popover from '@radix-ui/react-popover'
import { IconReplace, IconX } from '@tabler/icons-react'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { formControlStyles } from '../../app/ui'
import { getAdminApiUrl } from '../../lib/adminApi'
import {
  getCommissionAccessibleLabel,
  getCommissionDisplayLabel,
} from '../../lib/commissionPresentation'

interface KeywordReplacePopoverProps {
  commissionSearchRows: AdminCommissionSearchRow[]
  onComplete: () => void
}

interface MatchedCommission {
  id: number
  publicId: string
  characterId: number
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  displayLabel: string
  links: string
  design: string | null | undefined
  description: string | null | undefined
  hidden: boolean
  currentKeyword: string
  newKeyword: string
}

function findMatches(
  rows: AdminCommissionSearchRow[],
  findTerm: string,
): MatchedCommission[] {
  if (!findTerm.trim())
    return []

  const needle = findTerm.trim().toLowerCase()
  const matches: MatchedCommission[] = []

  for (const row of rows) {
    if (!row.keyword)
      continue
    if (row.keyword.toLowerCase().includes(needle)) {
      matches.push({
        id: row.id,
        publicId: row.publicId,
        characterId: row.characterId,
        characterName: row.characterName,
        commissionDate: row.commissionDate,
        creatorName: row.creatorName,
        displayLabel: getCommissionDisplayLabel(row),
        links: row.links,
        design: row.design,
        description: row.description,
        hidden: row.hidden,
        currentKeyword: row.keyword,
        newKeyword: row.keyword, // placeholder, set during replace
      })
    }
  }

  return matches
}

function computeReplacement(
  currentKeyword: string,
  findTerm: string,
  replaceTerm: string,
): string {
  // Case-insensitive replacement, preserving surrounding structure
  const regex = new RegExp(
    findTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'gi',
  )
  return currentKeyword.replace(regex, replaceTerm.trim())
}

export function KeywordReplacePopover({
  commissionSearchRows,
  onComplete,
}: KeywordReplacePopoverProps) {
  const [open, setOpen] = useState(false)
  const [findTerm, setFindTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [isPending, startTransition] = useTransition()
  const [progress, setProgress] = useState<{ current: number, total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(
    () => findMatches(commissionSearchRows, findTerm),
    [commissionSearchRows, findTerm],
  )

  const matchesWithPreview = useMemo(
    () => matches.map(m => ({
      ...m,
      newKeyword: computeReplacement(m.currentKeyword, findTerm, replaceTerm),
    })),
    [matches, findTerm, replaceTerm],
  )

  const handleReplaceAll = useCallback(() => {
    if (matchesWithPreview.length === 0)
      return

    setError(null)
    startTransition(async () => {
      for (let i = 0; i < matchesWithPreview.length; i++) {
        const match = matchesWithPreview[i]
        setProgress({ current: i + 1, total: matchesWithPreview.length })

        try {
          const response = await fetch(
            getAdminApiUrl(`/api/admin/commissions/${match.id}`),
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterId: match.characterId,
                commissionDate: match.commissionDate,
                creatorName: match.creatorName,
                links: match.links,
                design: match.design ?? '',
                description: match.description ?? '',
                keyword: match.newKeyword,
                hidden: match.hidden,
              }),
            },
          )

          if (!response.ok) {
            const body = await response.json().catch(() => ({}))
            setError(`Failed on "${match.displayLabel}" (${match.publicId}): ${(body as { message?: string }).message ?? response.statusText}`)
            return
          }
        }
        catch {
          setError(`Network error on "${match.displayLabel}" (${match.publicId})`)
          return
        }
      }

      // All succeeded
      setProgress(null)
      setFindTerm('')
      setReplaceTerm('')
      setOpen(false)
      onComplete()
    })
  }, [matchesWithPreview, onComplete])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && isPending)
      return // prevent close during operation
    setOpen(isOpen)
    if (!isOpen) {
      setFindTerm('')
      setReplaceTerm('')
      setProgress(null)
      setError(null)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="
            inline-flex items-center gap-1.5 rounded-lg border
            border-gray-200 bg-white/80 px-3 py-2.5 text-sm
            font-medium text-gray-600 shadow-sm transition
            hover:border-gray-300 hover:text-gray-900
            focus-visible:ring-2 focus-visible:ring-gray-500
            focus-visible:ring-offset-2 focus-visible:ring-offset-white
            focus-visible:outline-none
            dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300
            dark:hover:border-gray-600 dark:hover:text-gray-100
            dark:focus-visible:ring-offset-gray-900
          "
        >
          <IconReplace className="size-4" stroke={1.8} aria-hidden="true" />
          <span className="
            hidden
            sm:inline
          "
          >
            Keyword
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="
            z-50 w-[380px] overflow-hidden rounded-xl border
            border-gray-200 bg-white shadow-lg
            dark:border-gray-700 dark:bg-gray-950
          "
        >
          {/* Header with inputs */}
          <div className="space-y-3 border-b border-gray-100 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="
                text-sm font-semibold text-gray-900
                dark:text-gray-100
              "
              >
                Keyword Find & Replace
              </h3>
              <Popover.Close
                aria-label="Close"
                className="
                  inline-flex size-6 items-center justify-center rounded-md
                  text-gray-400 transition
                  hover:text-gray-600
                  dark:hover:text-gray-200
                "
              >
                <IconX className="size-3.5" stroke={2} aria-hidden="true" />
              </Popover.Close>
            </div>

            <div className="space-y-2">
              <div>
                <label className="
                  mb-1 block text-xs font-semibold uppercase tracking-wide
                  text-gray-500
                  dark:text-gray-400
                "
                >
                  Find
                </label>
                <input
                  type="text"
                  value={findTerm}
                  onChange={e => setFindTerm(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. yukata"
                  className={formControlStyles}
                />
              </div>
              <div>
                <label className="
                  mb-1 block text-xs font-semibold uppercase tracking-wide
                  text-gray-500
                  dark:text-gray-400
                "
                >
                  Replace with
                </label>
                <input
                  type="text"
                  value={replaceTerm}
                  onChange={e => setReplaceTerm(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. kimono"
                  className={formControlStyles}
                />
              </div>
            </div>
          </div>

          {/* Match preview */}
          {findTerm.trim() && (
            <div className="
              max-h-48 overflow-y-auto border-b border-gray-100 p-4
              dark:border-gray-800
            "
            >
              {matchesWithPreview.length === 0
                ? (
                    <p className="
                      text-xs text-gray-500
                      dark:text-gray-400
                    "
                    >
                      No commissions match.
                    </p>
                  )
                : (
                    <>
                      <p className="
                        mb-2 text-xs font-semibold text-gray-600
                        dark:text-gray-300
                      "
                      >
                        {matchesWithPreview.length}
                        {' '}
                        commission
                        {matchesWithPreview.length !== 1 ? 's' : ''}
                        {' '}
                        matched
                      </p>
                      <div className="space-y-1.5">
                        {matchesWithPreview.map(match => (
                          <div
                            key={match.id}
                            className="
                              flex items-center gap-2 rounded-md border
                              border-gray-100 bg-gray-50 px-2.5 py-1.5
                              dark:border-gray-800 dark:bg-gray-900/40
                            "
                          >
                            <span
                              className="
                              flex-1 truncate text-xs text-gray-600
                              dark:text-gray-300
                            "
                              title={`Public ID: ${match.publicId}`}
                              aria-label={getCommissionAccessibleLabel(match)}
                            >
                              {match.displayLabel}
                            </span>
                            <span className="
                              shrink-0 text-xs text-gray-400 line-through
                              dark:text-gray-500
                            "
                            >
                              {match.currentKeyword}
                            </span>
                            <span className="
                              shrink-0 text-xs text-emerald-600
                              dark:text-emerald-400
                            "
                            >
                              {match.newKeyword}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="
              border-b border-red-100 bg-red-50 px-4 py-2.5
              dark:border-red-900/30 dark:bg-red-950/30
            "
            >
              <p className="
                text-xs text-red-600
                dark:text-red-400
              "
              >
                {error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between p-4">
            {progress
              ? (
                  <p className="
                    text-xs text-gray-500
                    dark:text-gray-400
                  "
                  >
                    {progress.current}
                    /
                    {progress.total}
                    {' '}
                    updated…
                  </p>
                )
              : <div />}
            <div className="flex gap-2">
              <Popover.Close
                disabled={isPending}
                className="
                  inline-flex h-8 items-center rounded-md border
                  border-gray-200 px-3 text-xs font-medium text-gray-600
                  transition
                  hover:bg-gray-50
                  disabled:cursor-not-allowed disabled:opacity-60
                  dark:border-gray-700 dark:text-gray-300
                  dark:hover:bg-gray-800
                "
              >
                Cancel
              </Popover.Close>
              <button
                type="button"
                onClick={handleReplaceAll}
                disabled={isPending || matchesWithPreview.length === 0 || !replaceTerm.trim()}
                className="
                  inline-flex h-8 items-center rounded-md bg-gray-900 px-3
                  text-xs font-semibold text-white transition
                  hover:bg-gray-800
                  disabled:cursor-not-allowed disabled:opacity-60
                  dark:bg-gray-100 dark:text-gray-900
                  dark:hover:bg-gray-200
                "
              >
                Replace all
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
