import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { IconReplace } from '@tabler/icons-react'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { formControlStyles } from '../../app/ui'
import { getAdminApiUrl } from '../../lib/adminApi'
import {
  getCommissionAccessibleLabel,
  getCommissionDisplayLabel,
} from '../../lib/commissionPresentation'
import { FloatingNotice } from '../FloatingNotice'
import { Dialog, DialogClose, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog'

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
  workGroupId: string | null
  partNumber: number | null
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
        workGroupId: row.workGroupId,
        partNumber: row.partNumber,
        displayLabel: getCommissionDisplayLabel(row),
        links: row.links,
        design: row.design,
        description: row.description,
        hidden: row.hidden,
        currentKeyword: row.keyword,
        newKeyword: row.keyword,
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
  // 忽略大小写替换文字，保留其余关键词内容。
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
  const [completedIds, setCompletedIds] = useState<Set<number>>(() => new Set())

  const matches = useMemo(
    () => findMatches(commissionSearchRows, findTerm),
    [commissionSearchRows, findTerm],
  )

  const matchesWithPreview = useMemo(
    () => matches.filter(match => !completedIds.has(match.id)).map(m => ({
      ...m,
      newKeyword: computeReplacement(m.currentKeyword, findTerm, replaceTerm),
    })),
    [matches, findTerm, replaceTerm, completedIds],
  )

  const handleReplaceAll = useCallback(() => {
    if (matchesWithPreview.length === 0)
      return

    setError(null)
    setProgress({ current: 1, total: matchesWithPreview.length })
    startTransition(async () => {
      const savedIds: number[] = []
      const finishPartial = () => {
        setProgress(null)
        if (savedIds.length > 0) {
          setCompletedIds(previous => new Set([...previous, ...savedIds]))
          onComplete()
        }
      }
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
                workGroupId: match.workGroupId,
                partNumber: match.partNumber,
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
            finishPartial()
            return
          }
          savedIds.push(match.id)
        }
        catch {
          setError(`Network error on "${match.displayLabel}" (${match.publicId})`)
          finishPartial()
          return
        }
      }

      // 全部成功后关闭；部分成功时保留预览与重试进度。
      setProgress(null)
      setFindTerm('')
      setReplaceTerm('')
      setCompletedIds(new Set())
      setOpen(false)
      onComplete()
    })
  }, [matchesWithPreview, onComplete])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && isPending)
      return
    setOpen(isOpen)
    if (!isOpen) {
      setFindTerm('')
      setReplaceTerm('')
      setProgress(null)
      setError(null)
      setCompletedIds(new Set())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Replace keywords"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white/80 px-3 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
        >
          <IconReplace className="size-4" stroke={1.8} aria-hidden="true" />
          <span className="hidden sm:inline">Keywords</span>
        </button>
      </DialogTrigger>
      <DialogContent className="h-[min(42rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Replace keywords</DialogTitle>
          <DialogCloseButton disabled={isPending} />
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div className="shrink-0 px-5 py-5">
            <DialogDescription>
              Preview changes across commission keywords before saving. Matching ignores letter case.
            </DialogDescription>
            <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <label htmlFor="keyword-replace-find" className="block pl-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">Find</label>
                <input
                  id="keyword-replace-find"
                  type="text"
                  value={findTerm}
                  onChange={(event) => {
                    setFindTerm(event.target.value)
                    setCompletedIds(new Set())
                    setError(null)
                  }}
                  disabled={isPending}
                  placeholder="e.g. yukata"
                  className={`${formControlStyles} min-h-11 px-4`}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="keyword-replace-with" className="block pl-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">Replace with</label>
                <input
                  id="keyword-replace-with"
                  type="text"
                  value={replaceTerm}
                  onChange={(event) => {
                    setReplaceTerm(event.target.value)
                    setCompletedIds(new Set())
                    setError(null)
                  }}
                  disabled={isPending}
                  placeholder="e.g. kimono"
                  className={`${formControlStyles} min-h-11 px-4`}
                />
              </div>
            </div>
          </div>
          <section aria-label="Replacement preview" className="min-h-24 flex-1 space-y-3 overflow-y-auto border-t border-gray-200 px-5 py-5 dark:border-gray-800">
            <p className="pl-1 text-sm font-medium text-gray-700 dark:text-gray-200" aria-live="polite">
              {!findTerm.trim()
                ? 'Enter text to preview the affected commissions.'
                : matchesWithPreview.length === 0
                  ? 'No commissions match.'
                  : `${matchesWithPreview.length} commission${matchesWithPreview.length === 1 ? '' : 's'} matched`}
            </p>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {matchesWithPreview.map(match => (
                <article key={match.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{match.characterName}</p>
                  <p
                    className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400"
                    title={`Public ID: ${match.publicId}`}
                    aria-label={getCommissionAccessibleLabel(match)}
                  >
                    {match.displayLabel}
                  </p>
                  <dl className="mt-3 grid min-w-0 grid-cols-2 gap-4 text-sm">
                    <div className="min-w-0">
                      <dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">Before</dt>
                      <dd className="break-words text-gray-600 dark:text-gray-300">{match.currentKeyword}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">After</dt>
                      <dd className="break-words text-emerald-700 dark:text-emerald-300">{match.newKeyword}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </div>
        {error && <FloatingNotice tone="error" onDismiss={() => setError(null)}>{error}</FloatingNotice>}
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <DialogClose asChild>
            <button
              type="button"
              disabled={isPending}
              className="inline-flex min-h-11 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={isPending || matchesWithPreview.length === 0 || !replaceTerm.trim()}
            className="inline-flex min-h-11 w-36 shrink-0 items-center justify-center rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white transition hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {isPending ? `Saving ${progress?.current ?? 0}/${progress?.total ?? matchesWithPreview.length}` : 'Replace all'}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
