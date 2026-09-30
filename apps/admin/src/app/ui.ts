export type StatusTone = 'done' | 'pending' | 'blocked'

export const adminSurfaceStyles
  = 'admin-surface space-y-6 rounded-xl border border-gray-200 p-4 text-sm sm:p-6 dark:border-gray-800'

export const adminMetricCardStyles
  = 'admin-surface rounded-xl border border-gray-200 p-5 dark:border-gray-800'

export const adminInsetCardStyles
  = 'rounded-lg bg-gray-100/60 p-4 dark:bg-gray-800/40'

export const adminActionLinkStyles
  = 'admin-surface inline-flex min-h-11 items-center justify-between gap-4 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800 no-underline transition hover:border-gray-400 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:text-gray-100'

// 移动端用 text-base (16px) 规避 iOS Safari 聚焦自动放大；桌面端维持 text-sm。
export const formControlStyles
  = 'admin-input w-full rounded-md border border-gray-300 px-3 py-2.5 text-base text-gray-900 transition placeholder:text-gray-500 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:text-sm dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus-visible:ring-offset-gray-900'

export function getStatusBadgeStyles(tone: StatusTone) {
  switch (tone) {
    case 'done':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
    case 'blocked':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100'
    default:
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100'
  }
}
