import type { DuplicateCommissionHint } from '../../lib/duplicateCommissionHints'
import { useState } from 'react'
import { FloatingNotice } from '../FloatingNotice'

interface DuplicateCommissionNoticeProps {
  hints: DuplicateCommissionHint[]
}

function DuplicateDetails({ hints }: DuplicateCommissionNoticeProps) {
  return (
    <ol className="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto p-3">
      {hints.map(hint => (
        <li
          key={hint.commissionId}
          className="rounded-lg border border-amber-200/70 bg-white/80 px-3 py-2 dark:border-amber-300/20 dark:bg-gray-950/30"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span
              className="min-w-0 truncate font-mono text-xs text-gray-800 dark:text-gray-100"
              title={`Public ID: ${hint.publicId}`}
              aria-label={`${hint.displayLabel} · Public ID ${hint.publicId}`}
            >
              {hint.displayLabel}
            </span>
            <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-300">
              {hint.characterName}
            </span>
          </div>
          <p className="mt-1 break-words text-[11px] text-amber-900/80 dark:text-amber-100/80">
            {hint.reasons.join(' · ')}
          </p>
        </li>
      ))}
    </ol>
  )
}

export function DuplicateCommissionNotice({ hints }: DuplicateCommissionNoticeProps) {
  const signature = hints.map(hint => `${hint.commissionId}:${hint.reasons.join('|')}`).join(';')
  const [dismissedSignature, setDismissedSignature] = useState('')
  if (hints.length === 0 || signature === dismissedSignature) {
    return null
  }

  return (
    <FloatingNotice tone="warning" onDismiss={() => setDismissedSignature(signature)}>
      <details>
        <summary className="cursor-pointer font-medium">
          {`${hints.length} possible duplicate ${hints.length === 1 ? 'entry' : 'entries'}`}
          <span className="ml-2 text-xs underline underline-offset-2">Review</span>
        </summary>
        <p className="mt-2 text-xs">Compare these records before saving.</p>
        <DuplicateDetails hints={hints} />
      </details>
    </FloatingNotice>
  )
}
