import type { DuplicateCommissionHint } from '../../lib/duplicateCommissionHints'

interface DuplicateCommissionNoticeProps {
  hints: DuplicateCommissionHint[]
}

export function DuplicateCommissionNotice({
  hints,
}: DuplicateCommissionNoticeProps) {
  if (hints.length === 0) {
    return null
  }

  return (
    <section className="
      rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 ring-1
      ring-amber-950/5
      dark:border-amber-400/25 dark:bg-amber-500/10 dark:ring-white/10
    "
    >
      <div className="space-y-1">
        <h3 className="
          text-sm font-semibold text-amber-900
          dark:text-amber-100
        "
        >
          Likely duplicate entries
        </h3>
        <p className="
          text-xs text-amber-800/80
          dark:text-amber-100/80
        "
        >
          Non-blocking warning shown when character, delivery date, and creator all match.
        </p>
      </div>

      <ol className="mt-3 space-y-2">
        {hints.map(hint => (
          <li
            key={hint.commissionId}
            className="
              rounded-lg border border-amber-200/70 bg-white/80 px-3 py-2
              dark:border-amber-300/20 dark:bg-gray-950/30
            "
          >
            <div className="flex items-center justify-between gap-3">
              <span className="
                min-w-0 truncate font-mono text-xs text-gray-800
                dark:text-gray-100
              "
              >
                {hint.displayLabel}
              </span>
              <span className="
                shrink-0 text-[11px] text-gray-500
                dark:text-gray-300
              "
              >
                {hint.characterName}
              </span>
            </div>
            <p className="
              mt-1 text-[11px] text-amber-900/80
              dark:text-amber-100/80
            "
            >
              {hint.reasons.join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
