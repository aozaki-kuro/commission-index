export const adminSurfaceStyles
  = 'admin-surface space-y-6 rounded-xl border border-gray-200 p-4 text-sm sm:p-6 dark:border-gray-800'

export const adminActionLinkStyles
  = 'admin-surface inline-flex min-h-11 items-center justify-between gap-4 rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800 no-underline transition motion-safe:active:scale-[0.98] hover:border-gray-400 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:text-gray-100'

export const fieldLabelStyles
  = 'block text-sm font-medium text-gray-700 dark:text-gray-300'

// 移动端用 text-base (16px) 规避 iOS Safari 聚焦自动放大；桌面端维持 text-sm。
// Focus is an outline coloured by the global :where(:focus-visible) rule; ring offsets drew a bright halo on the #000 canvas.
export const formControlStyles
  = 'admin-input min-h-11 w-full rounded-md border border-gray-300 px-3 py-2.5 text-base text-gray-900 transition placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400'

// Variants own colour, weight and padding; call sites add only layout (width, min-width, margins, position),
// because cn() is a plain join and a conflicting utility resolves by stylesheet order, not class order.
const buttonBase
  = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export const buttonStyles = {
  primary: `${buttonBase} bg-gray-900 px-4 font-semibold text-white enabled:hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:enabled:hover:bg-gray-200`,
  secondary: `${buttonBase} border border-gray-300 px-4 font-medium text-gray-700 enabled:hover:bg-gray-100 enabled:hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:enabled:hover:bg-gray-800 dark:enabled:hover:text-gray-100`,
  danger: `${buttonBase} bg-red-600 px-4 font-semibold text-white enabled:hover:bg-red-700`,
  ghost: `${buttonBase} px-3 font-medium text-gray-700 enabled:hover:bg-gray-100 enabled:hover:text-gray-900 dark:text-gray-200 dark:enabled:hover:bg-gray-800 dark:enabled:hover:text-gray-100`,
  // No size here: pair with size-11, or size-9 pointer-coarse:size-11 inside dense popovers.
  icon: 'inline-flex shrink-0 items-center justify-center rounded-md text-gray-500 transition enabled:hover:bg-gray-100 enabled:hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:enabled:hover:bg-gray-800 dark:enabled:hover:text-gray-100',
} as const
